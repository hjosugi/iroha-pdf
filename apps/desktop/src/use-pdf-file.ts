import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useAnnotationCapability } from '@embedpdf/plugin-annotation/react';
import { useDocumentManagerCapability } from '@embedpdf/plugin-document-manager/react';
import { useExport } from '@embedpdf/plugin-export/react';
import { PdfAnnotationSubtype } from '@embedpdf/models';

import {
  ensureOriginalBackup,
  isDesktopRuntime,
  pickPdfFromDisk,
  pickSaveLocation,
  readPdfFromDisk,
  writePdfToDisk,
} from './file-bridge';
import {
  dismissRecovery,
  getDocumentFile,
  recordEdit,
  recordSave,
  registerOpenedFile,
  subscribe,
  type DocumentFile,
} from './document-store';
import { clearDraft, saveDraft } from './draft-store';

/** A pen stroke emits a burst of updates; exporting on each one would be wasteful. */
const DRAFT_DEBOUNCE_MS = 800;

const SUBTYPE_LABELS: Partial<Record<PdfAnnotationSubtype, string>> = {
  [PdfAnnotationSubtype.HIGHLIGHT]: 'Highlight',
  [PdfAnnotationSubtype.INK]: 'Pen stroke',
  [PdfAnnotationSubtype.FREETEXT]: 'Text',
  [PdfAnnotationSubtype.SQUARE]: 'Shape',
  [PdfAnnotationSubtype.CIRCLE]: 'Ellipse',
  [PdfAnnotationSubtype.UNDERLINE]: 'Underline',
  [PdfAnnotationSubtype.STRIKEOUT]: 'Strikeout',
  [PdfAnnotationSubtype.SQUIGGLY]: 'Squiggly',
  [PdfAnnotationSubtype.TEXT]: 'Sticky note',
  [PdfAnnotationSubtype.STAMP]: 'Stamp',
  [PdfAnnotationSubtype.LINE]: 'Line',
};

function labelFor(subtype: PdfAnnotationSubtype): string {
  return SUBTYPE_LABELS[subtype] ?? 'Annotation';
}

export function useDocumentFile(documentId: string): DocumentFile {
  const snapshot = useCallback(() => getDocumentFile(documentId), [documentId]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

type DocumentManager = NonNullable<ReturnType<typeof useDocumentManagerCapability>['provides']>;

async function openPath(provides: DocumentManager, path: string): Promise<void> {
  const file = await readPdfFromDisk(path);
  const response = await provides
    .openDocumentBuffer({ buffer: file.buffer, name: file.name })
    .toPromise();
  registerOpenedFile(response.documentId, file.path);
}

/** Opens a PDF, keeping its filesystem path when the desktop runtime provides one. */
export function useOpenPdf(): () => Promise<void> {
  const { provides } = useDocumentManagerCapability();

  /**
   * Dev-only seam for the real-runtime e2e. The native dialog is a portal window
   * that no scripting tool can drive under Wayland, so the test opens by path.
   * `import.meta.env.DEV` is statically false in production builds, so the bundler
   * removes this entirely.
   */
  useEffect(() => {
    if (!import.meta.env.DEV || !provides) return;
    Object.assign(window, {
      __IROHA_DEV__: { openPath: (path: string) => openPath(provides, path) },
    });
    return () => {
      delete (window as { __IROHA_DEV__?: unknown }).__IROHA_DEV__;
    };
  }, [provides]);

  return useCallback(async () => {
    if (!provides) return;

    if (!isDesktopRuntime()) {
      // Browser mode has no filesystem path, so saving falls back to a download.
      const response = await provides.openFileDialog().toPromise();
      registerOpenedFile(response.documentId, null);
      return;
    }

    const picked = await pickPdfFromDisk();
    if (!picked) return;

    const response = await provides
      .openDocumentBuffer({ buffer: picked.buffer, name: picked.name })
      .toPromise();
    registerOpenedFile(response.documentId, picked.path);
  }, [provides]);
}

/** Mirrors annotation activity into the edit timeline, and keeps a crash draft. */
export function useEditTimeline(documentId: string): void {
  const { provides: annotationCapability } = useAnnotationCapability();
  const annotation = useMemo(
    () => annotationCapability?.forDocument(documentId),
    [annotationCapability, documentId],
  );

  useEffect(() => {
    if (!annotation) return;

    let draftTimer: number | undefined;
    const writeDraft = () => {
      const path = getDocumentFile(documentId).path;
      if (!path) return;
      annotation.exportAnnotations().wait(
        (items) => saveDraft(path, items),
        () => {
          // Export can fail while the engine is mid-operation. The next edit retries,
          // and an explicit Save is unaffected.
        },
      );
    };

    const unsubscribe = annotation.onAnnotationEvent((event) => {
      if (event.type === 'loaded') return;
      recordEdit(documentId, {
        at: Date.now(),
        kind: event.type,
        label: labelFor(event.annotation.type),
        pageIndex: event.pageIndex,
      });

      // Debounced: a pen stroke emits a burst of updates, and each export walks
      // every annotation in the document.
      window.clearTimeout(draftTimer);
      draftTimer = window.setTimeout(writeDraft, DRAFT_DEBOUNCE_MS);
    });

    return () => {
      window.clearTimeout(draftTimer);
      unsubscribe();
    };
  }, [annotation, documentId]);
}

/**
 * Puts a recovered draft back into the document.
 *
 * Import replays the annotations through the normal creation path, so they end up
 * pending exactly as if they had just been drawn — and therefore unsaved, which is
 * what they are.
 */
export function useRecoverDraft(documentId: string) {
  const { provides: annotationCapability } = useAnnotationCapability();
  const annotation = useMemo(
    () => annotationCapability?.forDocument(documentId),
    [annotationCapability, documentId],
  );

  const restore = useCallback(() => {
    const file = getDocumentFile(documentId);
    if (!annotation || !file.recovery) return;

    const items = file.recovery.items;
    annotation.importAnnotations(items);

    // importAnnotations dispatches to the store directly instead of going through the
    // path that emits onAnnotationEvent, so nothing would mark these as unsaved. They
    // are only in the open document, not in the file, and the user has to be told —
    // otherwise a Save button reading zero invites losing the same work twice.
    for (const item of items) {
      recordEdit(documentId, {
        at: Date.now(),
        kind: 'create',
        label: labelFor(item.annotation.type),
        pageIndex: item.annotation.pageIndex,
      });
    }
    dismissRecovery(documentId);
  }, [annotation, documentId]);

  const discard = useCallback(() => {
    const file = getDocumentFile(documentId);
    if (file.path) clearDraft(file.path);
    dismissRecovery(documentId);
  }, [documentId]);

  return { restore, discard };
}

/** The pen tool's default hold before a finished stroke becomes an annotation. */
const INK_COMMIT_DELAY_MS = 800;

type AnnotationScope = NonNullable<
  ReturnType<NonNullable<ReturnType<typeof useAnnotationCapability>['provides']>['forDocument']>
>;

/**
 * Gives an in-flight pen stroke time to become a real annotation.
 *
 * Only the pen defers; every other tool creates its mark on pointer-up. Waiting
 * unconditionally would add most of a second to every save.
 */
async function waitForPendingInk(annotation: AnnotationScope): Promise<void> {
  const tool = annotation.getActiveTool();
  if (tool?.id !== 'ink') return;

  const behavior = (tool as { behavior?: { commitDelay?: number } }).behavior;
  const delay = behavior?.commitDelay ?? INK_COMMIT_DELAY_MS;
  // Putting the tool down does not flush the timer, so the wait has to cover it.
  await new Promise((resolve) => setTimeout(resolve, delay + 150));
}

/** The annotations currently selected in the viewer, kept in sync with the plugin. */
export function useSelectedAnnotations(documentId: string) {
  const { provides: annotationCapability } = useAnnotationCapability();
  const annotation = useMemo(
    () => annotationCapability?.forDocument(documentId),
    [annotationCapability, documentId],
  );
  const [selected, setSelected] = useState<ReturnType<AnnotationScope['getSelectedAnnotations']>>(
    [],
  );

  useEffect(() => {
    if (!annotation) {
      setSelected([]);
      return;
    }

    // onStateChange fires on every annotation state change, including each preview
    // frame while a stroke is being drawn. Replacing the array unconditionally would
    // re-render the toolbar on every one of those, so only publish when the set of
    // selected annotations, or the properties this panel shows, actually differ.
    const signature = (items: ReturnType<AnnotationScope['getSelectedAnnotations']>) =>
      items
        .map((item) => {
          const object = item.object as unknown as Record<string, unknown>;
          return [object.id, object.color, object.strokeColor, object.fontColor, object.strokeWidth]
            .join(':');
        })
        .join('|');

    let current = annotation.getSelectedAnnotations();
    setSelected(current);

    return annotation.onStateChange(() => {
      const next = annotation.getSelectedAnnotations();
      if (signature(next) === signature(current)) return;
      current = next;
      setSelected(next);
    });
  }, [annotation]);

  const update = useCallback(
    (pageIndex: number, id: string, patch: Record<string, unknown>) => {
      annotation?.updateAnnotation(pageIndex, id, patch);
    },
    [annotation],
  );

  return { selected, update };
}

/**
 * Deletes the selected annotation on Delete or Backspace.
 *
 * The viewer selects a mark when you click it but offers no way to remove it, so a
 * mistake could only be taken back by undoing immediately. Coming back to a document
 * and deleting a note you left earlier is the other half of "fix this PDF".
 */
export function useDeleteSelected(documentId: string): void {
  const { provides: annotationCapability } = useAnnotationCapability();
  const annotation = useMemo(
    () => annotationCapability?.forDocument(documentId),
    [annotationCapability, documentId],
  );

  useEffect(() => {
    if (!annotation) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;

      // Never steal the key from someone typing into a note or a text annotation.
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;

      const selected = annotation.getSelectedAnnotations();
      if (selected.length === 0) return;

      event.preventDefault();
      annotation.deleteAnnotations(
        selected.map((item) => ({ pageIndex: item.object.pageIndex, id: item.object.id })),
      );
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [annotation]);
}

export type SaveOutcome =
  | { status: 'saved'; path: string }
  | { status: 'downloaded' }
  | { status: 'cancelled' };

export function usePdfSave(documentId: string, documentName: string) {
  const { provides: annotationCapability } = useAnnotationCapability();
  const { provides: exportProvider } = useExport(documentId);
  const annotation = useMemo(
    () => annotationCapability?.forDocument(documentId),
    [annotationCapability, documentId],
  );

  /** Flushes pending annotations into the document, then serialises it. */
  const serialize = useCallback(async (): Promise<ArrayBuffer> => {
    if (!exportProvider) throw new Error('The PDF engine is still starting up.');
    if (annotation) {
      // The pen tool holds a finished stroke for `commitDelay` before turning it into
      // an annotation, so that several strokes become one mark. Saving inside that
      // window used to drop the stroke and still report success — the worst outcome a
      // document editor can produce. Wait the window out before committing.
      await waitForPendingInk(annotation);
      annotation.deselectAnnotation();
      await annotation.commit().toPromise();
    }
    return exportProvider.saveAsCopy().toPromise();
  }, [annotation, exportProvider]);

  const saveAs = useCallback(async (): Promise<SaveOutcome> => {
    if (!isDesktopRuntime()) {
      exportProvider?.download();
      return { status: 'downloaded' };
    }

    const buffer = await serialize();
    const target = await pickSaveLocation(documentName || 'document.pdf');
    if (!target) return { status: 'cancelled' };

    await writePdfToDisk(target, buffer);
    recordSave(documentId, {
      at: Date.now(),
      path: target,
      byteLength: buffer.byteLength,
      editCount: getDocumentFile(documentId).pendingEdits,
      kind: 'save-as',
    });
    return { status: 'saved', path: target };
  }, [documentId, documentName, exportProvider, serialize]);

  const save = useCallback(async (): Promise<SaveOutcome> => {
    const path = getDocumentFile(documentId).path;
    if (!isDesktopRuntime() || !path) return saveAs();

    const buffer = await serialize();
    // Keep the bytes the user originally opened recoverable before the first overwrite.
    await ensureOriginalBackup(path);
    await writePdfToDisk(path, buffer);
    recordSave(documentId, {
      at: Date.now(),
      path,
      byteLength: buffer.byteLength,
      editCount: getDocumentFile(documentId).pendingEdits,
      kind: 'save',
    });
    return { status: 'saved', path };
  }, [documentId, saveAs, serialize]);

  return { save, saveAs };
}
