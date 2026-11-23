/**
 * What is beside the page: what has been done to this document, and what the
 * reader wants to remember about it.
 *
 * Both are per-document and both outlive the session, which is why they sit
 * together — the history comes back from the document store, the note from the
 * app-data note store, and switching tab is the only thing that chooses between them.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Note } from '@iroha-pdf/core';

import { PageThumbnails } from './PageThumbnails';

import { basename } from './file-bridge';
import { t, timeFormat } from './i18n';
import {
  blankLinkedNote,
  discardLinkedNote,
  loadLinkedNote,
  reconcileLinkedNote,
  restoreLinkedNote,
  saveLinkedNote,
  type NoteRecovery,
} from './note-store';
import type { EditEntry, SaveRevision } from './document-store';
import { useDocumentFile } from './use-pdf-file';

function formatBytes(byteLength: number): string {
  if (byteLength < 1024) return `${byteLength} B`;
  if (byteLength < 1024 * 1024) return `${(byteLength / 1024).toFixed(0)} KB`;
  return `${(byteLength / (1024 * 1024)).toFixed(1)} MB`;
}

/** Edits and saves share the timeline; only a save carries the file it reached. */
type TimelineItem = EditEntry | SaveRevision;

function isSaveRevision(item: TimelineItem): item is SaveRevision {
  return 'path' in item;
}

const EDIT_VERBS = {
  create: 'history.added',
  update: 'history.changed',
  delete: 'history.removed',
} as const;

function EditLabel({ entry }: { entry: EditEntry }) {
  return (
    <span className="history-label">
      {`${t(EDIT_VERBS[entry.kind])} `}
      <strong>{t(`annotation.${entry.annotation}`)}</strong>
      <span className="history-meta">{t('history.page', { page: entry.pageIndex + 1 })}</span>
    </span>
  );
}

function SaveLabel({ revision }: { revision: SaveRevision }) {
  return (
    <span className="history-label">
      {t(revision.kind === 'save-as' ? 'history.savedAs' : 'history.saved')}{' '}
      <strong>{basename(revision.path)}</strong>
      <span className="history-meta">
        {formatBytes(revision.byteLength)} · {t(revision.editCount === 1 ? 'history.editOne' : 'history.edits', { count: revision.editCount })}
      </span>
    </span>
  );
}

function HistoryPanel({ documentId }: { documentId: string }) {
  const file = useDocumentFile(documentId);

  // Newest first: the most recent change is the one being reasoned about.
  const timeline = useMemo(
    () => [...file.edits, ...file.revisions].sort((a, b) => b.at - a.at),
    [file.edits, file.revisions],
  );

  if (timeline.length === 0) {
    return (
      <p className="history-empty">
        {t('history.empty')}
      </p>
    );
  }

  return (
    <ol className="history-list">
      {timeline.map((item, index) => (
        <li
          className={isSaveRevision(item) ? 'history-item save' : 'history-item edit'}
          key={`${item.at}-${index}`}
        >
          <span className="history-time">{timeFormat.format(item.at)}</span>
          {isSaveRevision(item) ? <SaveLabel revision={item} /> : <EditLabel entry={item} />}
        </li>
      ))}
    </ol>
  );
}

/** Long enough that typing is not a write per keystroke, short enough to survive a crash. */
const NOTE_SAVE_DEBOUNCE_MS = 250;

function NotePanel({ noteKey }: { noteKey: string }) {
  const [note, setNote] = useState<Note | null>(null);
  const [storedLast, setStoredLast] = useState(true);
  const [recovery, setRecovery] = useState<NoteRecovery | null>(null);
  const noteRef = useRef<Note | null>(null);

  useEffect(() => {
    noteRef.current = note;
  }, [note]);

  useEffect(() => {
    let cancelled = false;
    setNote(null);
    setStoredLast(true);
    setRecovery(null);

    void Promise.all([loadLinkedNote(noteKey), reconcileLinkedNote(noteKey)]).then(
      ([loaded, recovered]) => {
        if (cancelled) return;
        setNote(loaded);
        setRecovery(recovered);
      },
      (error: unknown) => {
        // The note store is the one thing that survives a cleared webview, so a read
        // that cannot happen must not take the panel down with it.
        console.warn('Iroha PDF: the note could not be read', error);
        if (cancelled) return;
        setNote(blankLinkedNote(noteKey));
        setStoredLast(false);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [noteKey]);

  /**
   * The note is journaled in the app data directory, not localStorage, so a crash
   * between this debounce and the disk leaves a recovery copy rather than nothing.
   * Only the debounced write reports: the flush on the way out may be running because
   * the panel is going away, and an unmounting component has no business setting state.
   */
  useEffect(() => {
    if (!note || note.linkedDocumentId !== noteKey) return;
    const persist = (report: boolean) => {
      void saveLinkedNote(note).then(
        () => {
          if (report) setStoredLast(true);
        },
        (error: unknown) => {
          console.warn('Iroha PDF: the note could not be stored', error);
          if (report) setStoredLast(false);
        },
      );
    };
    const timer = window.setTimeout(() => persist(true), NOTE_SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [noteKey, note]);

  // Flush the latest note when the panel goes away or another document opens.
  useEffect(() => {
    return () => {
      const pending = noteRef.current;
      if (!pending) return;
      void saveLinkedNote(pending).catch((error: unknown) => {
        console.warn('Iroha PDF: the note could not be stored on the way out', error);
      });
    };
  }, [noteKey]);

  const restore = () => {
    void restoreLinkedNote(noteKey).then(
      (restored) => {
        setNote(restored);
        setRecovery(null);
        setStoredLast(true);
      },
      (error: unknown) => {
        console.warn('Iroha PDF: the recovered note could not be restored', error);
      },
    );
  };

  const discard = () => {
    void discardLinkedNote(noteKey).then(
      () => setRecovery(null),
      (error: unknown) => {
        console.warn('Iroha PDF: the recovered note could not be discarded', error);
      },
    );
  };

  if (!note) {
    return (
      <span className="saved-indicator" role="status">
        {t('note.loading')}
      </span>
    );
  }

  return (
    <>
      {recovery && (
        <div className="note-recovery-banner" role="status">
          <span>{t('note.recovered')}</span>
          <span className="recovery-actions">
            <button className="tool" onClick={discard}>
              {t('recovery.discard')}
            </button>
            <button className="primary-button" onClick={restore}>
              {t('recovery.restore')}
            </button>
          </span>
        </div>
      )}
      <textarea
        className="note-body"
        value={note.body}
        onChange={(event) => setNote((current) => ({
          ...(current ?? note),
          body: event.target.value,
          updatedAt: new Date().toISOString(),
        }))}
        placeholder={t('note.placeholder')}
        aria-label={t('note.linked')}
      />
      {/* A note nobody can store is the case this label must not sleep through:
          it is the only copy of what was typed, and someone who reads "Saved"
          will keep typing into a panel that is keeping nothing. */}
      <span className={storedLast ? 'saved-indicator' : 'saved-indicator failed'} role={storedLast ? undefined : 'alert'}>
        {t(storedLast ? 'autosave.saved' : 'note.saveFailed')}
      </span>
    </>
  );
}

export function SidePanel({ documentId }: { documentId: string }) {
  const [tab, setTab] = useState<'history' | 'pages' | 'note'>('history');
  const file = useDocumentFile(documentId);

  return (
    <aside className="side-panel">
      <div className="side-panel-tabs" role="tablist" aria-label={t('document.details')}>
        <button
          className={tab === 'history' ? 'panel-tab active' : 'panel-tab'}
          onClick={() => setTab('history')}
          role="tab"
          aria-selected={tab === 'history'}
        >
          {t('edit.history')}
        </button>
        <button
          className={tab === 'pages' ? 'panel-tab active' : 'panel-tab'}
          onClick={() => setTab('pages')}
          role="tab"
          aria-selected={tab === 'pages'}
        >
          {t('thumbnails.label')}
        </button>
        <button
          className={tab === 'note' ? 'panel-tab active' : 'panel-tab'}
          onClick={() => setTab('note')}
          role="tab"
          aria-selected={tab === 'note'}
        >
          {t('note.label')}
        </button>
      </div>
      {tab === 'history' && file.path && (
        <p className="side-panel-path" title={file.path}>
          {file.path}
        </p>
      )}
      {tab === 'history' && <HistoryPanel documentId={documentId} />}
      {/* Mounted only while the tab is open: the strip holds rendered bitmaps, and a
          panel nobody is looking at should not be holding any. */}
      {tab === 'pages' && <PageThumbnails documentId={documentId} />}
      {tab === 'note' && <NotePanel noteKey={file.path ?? documentId} />}
    </aside>
  );
}
