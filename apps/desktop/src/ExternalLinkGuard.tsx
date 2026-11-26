import { useEffect, useRef } from 'react';
import { PdfAnnotationSubtype } from '@embedpdf/models';
import { openUrl } from '@tauri-apps/plugin-opener';

import { externalUrlOrNull } from './external-links';
import { confirmExternalLink, isDesktopRuntime } from './file-bridge';
import { useAnnotationScope } from './use-pdf-file';

/**
 * Makes link annotations navigable, and makes them ask first (#57).
 *
 * The annotation plugin only navigates a link while the annotation is locked;
 * otherwise a click selects or drags it. Locks are applied in memory — never
 * written to the document — so the link stays a link in the file and becomes the
 * thing a reader expects on screen.
 *
 * The plugin's own handler opens a URI with `window.open` when one is navigated.
 * That is disabled in `App`, and this subscribes to the same event instead: the
 * scheme is checked, the exact URL is confirmed, and only then is it opened.
 */
export function ExternalLinkGuard({ documentId }: { documentId: string }) {
  const annotation = useAnnotationScope(documentId);
  const locked = useRef(new Set<string>());

  useEffect(() => {
    if (!annotation) return;

    const lockLinks = () => {
      for (const tracked of annotation.getAnnotations()) {
        const object = tracked.object;
        if (object.type !== PdfAnnotationSubtype.LINK) continue;
        if (locked.current.has(object.id)) continue;
        locked.current.add(object.id);
        annotation.syncAnnotationObject(object.id, {
          flags: [...(object.flags ?? []), 'readOnly'],
        });
      }
    };

    lockLinks();
    // Annotations arrive asynchronously after the document loads, and the event
    // hook is for edit actions; the state hook is what sees the initial load.
    const offState = annotation.onStateChange(() => lockLinks());
    const offEvents = annotation.onAnnotationEvent(() => lockLinks());
    const offNavigate = annotation.onNavigate((event) => {
      if (event.result.outcome !== 'uri') return;
      void confirmAndOpen(event.result.uri);
    });

    return () => {
      offState();
      offEvents();
      offNavigate();
    };
  }, [annotation]);

  return null;
}

async function confirmAndOpen(raw: string): Promise<void> {
  const url = externalUrlOrNull(raw);
  if (!url) {
    // No dialog: there is nothing a reader could sensibly agree to here.
    console.warn('Iroha PDF: refused a link with an unsupported scheme');
    return;
  }
  if (!(await confirmExternalLink(url))) return;

  try {
    if (isDesktopRuntime()) await openUrl(url);
    else window.open(url, '_blank', 'noopener,noreferrer');
  } catch (error) {
    console.warn('Iroha PDF: the link could not be opened', error);
  }
}
