/**
 * What is beside the page: what has been done to this document, and what the
 * reader wants to remember about it.
 *
 * Both are per-document and both outlive the session, which is why they sit
 * together — the history comes back from the document store, the note from local
 * storage, and switching tab is the only thing that chooses between them.
 */
import { useEffect, useMemo, useState } from 'react';
import type { Note } from '@iroha-pdf/core';

import { basename } from './file-bridge';
import { t, timeFormat } from './i18n';
import { storageKey } from './local-storage';
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

function loadLinkedNote(documentId: string): Note {
  const now = new Date().toISOString();
  const blank: Note = {
    id: `desktop-note:${documentId}`,
    title: t('note.linked'),
    body: '',
    linkedDocumentId: documentId,
    createdAt: now,
    updatedAt: now,
  };

  const stored = localStorage.getItem(storageKey('note', documentId));
  if (!stored) return blank;

  try {
    const parsed = JSON.parse(stored) as Partial<Note>;
    if (typeof parsed.body !== 'string') return blank;
    return {
      ...blank,
      id: parsed.id ?? blank.id,
      title: parsed.title ?? blank.title,
      body: parsed.body,
      createdAt: parsed.createdAt ?? now,
      updatedAt: parsed.updatedAt ?? now,
    };
  } catch {
    // Older versions stored only the body, so keep that local data intact.
    return { ...blank, body: stored };
  }
}

function NotePanel({ documentId }: { documentId: string }) {
  const [note, setNote] = useState<Note>(() => loadLinkedNote(documentId));

  useEffect(() => {
    setNote(loadLinkedNote(documentId));
  }, [documentId]);

  useEffect(() => {
    // The note of the document being left, written under the key of the one being
    // opened, would be the wrong note in the wrong file: wait for the reload above.
    if (note.linkedDocumentId !== documentId) return;
    const save = () => localStorage.setItem(storageKey('note', documentId), JSON.stringify(note));
    const timer = window.setTimeout(save, NOTE_SAVE_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      save();
    };
  }, [documentId, note]);

  return (
    <>
      <textarea
        className="note-body"
        value={note.body}
        onChange={(event) => setNote((current) => ({
          ...current,
          body: event.target.value,
          updatedAt: new Date().toISOString(),
        }))}
        placeholder={t('note.placeholder')}
        aria-label={t('note.linked')}
      />
      <span className="saved-indicator">{t('autosave.saved')}</span>
    </>
  );
}

export function SidePanel({ documentId }: { documentId: string }) {
  const [tab, setTab] = useState<'history' | 'note'>('history');
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
      {tab === 'history' ? <HistoryPanel documentId={documentId} /> : <NotePanel documentId={documentId} />}
    </aside>
  );
}
