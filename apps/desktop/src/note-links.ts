/**
 * How a note points back at a place in a PDF (#46).
 *
 * The note body is plain Markdown, so it stays readable in any viewer — inside the
 * app, in a text editor, in a sync client. The target lives in the link's href as
 * a small `iroha-pdf://` URI: the document key (the file path the note store uses),
 * the zero-based page, and the selected rectangle in page coordinates.
 *
 * Parsing never trusts the href. A malformed one becomes `target: null` and the
 * note panel refuses the jump rather than guessing at a page.
 */
export type NoteTargetRect = { x: number; y: number; width: number; height: number };

export type NoteTarget = {
  /** The key the note store uses: the file path on desktop. */
  documentKey: string;
  pageIndex: number;
  rect: NoteTargetRect;
};

export type ParsedNoteLink = {
  label: string;
  href: string;
  target: NoteTarget | null;
};

/** Markdown links whose href is ours; everything else in the body is left alone. */
const LINK_PATTERN = /\[([^\]\n]*)\]\((iroha-pdf:\/\/[^)\s]+)\)/g;

function round(value: number): string {
  return Number.isFinite(value) ? String(Math.round(value * 10_000) / 10_000) : '0';
}

export function noteTargetHref(target: NoteTarget): string {
  const params = new URLSearchParams({
    document: target.documentKey,
    page: String(target.pageIndex),
    rect: [
      target.rect.x,
      target.rect.y,
      target.rect.width,
      target.rect.height,
    ].map(round).join(','),
  });
  return `iroha-pdf://note-target?${params.toString()}`;
}

export function parseNoteTarget(href: string): NoteTarget | null {
  try {
    const url = new URL(href);
    if (url.protocol !== 'iroha-pdf:' || url.hostname !== 'note-target') return null;

    const documentKey = url.searchParams.get('document');
    const pageIndex = Number(url.searchParams.get('page'));
    const rect = (url.searchParams.get('rect') ?? '').split(',').map(Number);
    if (!documentKey || !Number.isInteger(pageIndex) || pageIndex < 0) return null;
    if (rect.length !== 4 || rect.some((value) => !Number.isFinite(value))) return null;

    return {
      documentKey,
      pageIndex,
      rect: { x: rect[0]!, y: rect[1]!, width: rect[2]!, height: rect[3]! },
    };
  } catch {
    return null;
  }
}

export function parseNoteLinks(body: string): ParsedNoteLink[] {
  return [...body.matchAll(LINK_PATTERN)].map((match) => {
    const label = match[1] ?? '';
    const href = match[2] ?? '';
    return { label, href, target: parseNoteTarget(href) };
  });
}

/** A short, single-line label: the selected text when there is some, else the page. */
export function linkLabel(text: string, pageLabel: string, limit = 60): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (!collapsed) return pageLabel;
  return collapsed.length > limit ? `${collapsed.slice(0, limit - 1)}…` : collapsed;
}

/** Appends the link as a Markdown paragraph, keeping whatever was in the note. */
export function appendNoteLink(body: string, label: string, href: string): string {
  const safeLabel = label.replace(/[[\]]/g, '');
  const trimmed = body.trimEnd();
  return `${trimmed}${trimmed.length > 0 ? '\n\n' : ''}[${safeLabel}](${href})`;
}
