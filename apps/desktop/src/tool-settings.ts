/**
 * Colour and stroke width per tool.
 *
 * Every tool ships with one hard-coded default, so until now every mark came out the
 * same yellow or the same red at the same width. One highlight colour is a real limit
 * when marking up a document, and a pen you cannot thin down is poor for corrections.
 *
 * Tools disagree about which field carries "the colour" — a highlight fills, a shape
 * strokes, a text box tints its glyphs — so the mapping lives here rather than being
 * repeated at every call site.
 */
export type ToolId = 'highlight' | 'ink' | 'freeText' | 'square';

export type ToolSetting = {
  color: string;
  strokeWidth?: number;
};

/** Highlighters want translucent, saturated colours; pens want ink colours. */
export const PALETTES: Record<ToolId, string[]> = {
  highlight: ['#FFCD45', '#7BE0A6', '#7CC4FF', '#FF9EC4'],
  ink: ['#E44234', '#1F6FEB', '#2E9E5B', '#1B1F24'],
  freeText: ['#E44234', '#1F6FEB', '#2E9E5B', '#1B1F24'],
  square: ['#E44234', '#1F6FEB', '#2E9E5B', '#1B1F24'],
};

export const STROKE_WIDTHS = [2, 4, 6, 10] as const;

/** Matches the plugin's built-in defaults, so nothing changes until the user chooses. */
export const DEFAULT_SETTINGS: Record<ToolId, ToolSetting> = {
  highlight: { color: '#FFCD45' },
  ink: { color: '#E44234', strokeWidth: 6 },
  freeText: { color: '#E44234' },
  square: { color: '#E44234', strokeWidth: 6 },
};

/** Tools that draw a line the user can thicken. */
export function supportsStrokeWidth(toolId: ToolId): boolean {
  return toolId === 'ink' || toolId === 'square';
}

/**
 * Translates a colour choice into the fields the given tool actually reads.
 * A highlight paints its body, a shape paints its border, a text box paints glyphs.
 */
export function colorPatchFor(toolId: ToolId, color: string): Record<string, unknown> {
  switch (toolId) {
    case 'highlight':
      return { color, strokeColor: color };
    case 'ink':
      return { color, strokeColor: color };
    case 'square':
      return { strokeColor: color };
    case 'freeText':
      return { fontColor: color };
  }
}

export function patchFor(toolId: ToolId, setting: ToolSetting): Record<string, unknown> {
  const patch = colorPatchFor(toolId, setting.color);
  if (supportsStrokeWidth(toolId) && setting.strokeWidth !== undefined) {
    patch.strokeWidth = setting.strokeWidth;
  }
  return patch;
}

/**
 * Which tool an existing annotation belongs to.
 *
 * Needed to edit a mark that is already on the page: the palette to show and the field
 * to patch both depend on what kind of annotation it is. Numbers are
 * `PdfAnnotationSubtype` values, kept literal so this module stays free of engine
 * imports.
 */
const SUBTYPE_TO_TOOL: Record<number, ToolId> = {
  3: 'freeText',
  5: 'square',
  9: 'highlight',
  15: 'ink',
};

export function toolForSubtype(subtype: number): ToolId | null {
  return SUBTYPE_TO_TOOL[subtype] ?? null;
}

/** Reads the colour back out of an annotation, from whichever field holds it. */
export function colorOf(toolId: ToolId, annotation: Record<string, unknown>): string | null {
  const field = toolId === 'freeText' ? 'fontColor' : toolId === 'square' ? 'strokeColor' : 'color';
  const value = annotation[field];
  return typeof value === 'string' ? value : null;
}

function storageKey(toolId: ToolId): string {
  return `iroha-pdf:tool:${toolId}`;
}

export function loadSetting(toolId: ToolId): ToolSetting {
  const fallback = DEFAULT_SETTINGS[toolId];
  try {
    const raw = localStorage.getItem(storageKey(toolId));
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return fallback;
    const { color, strokeWidth } = parsed as Partial<ToolSetting>;
    return {
      color: typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color) ? color : fallback.color,
      strokeWidth:
        typeof strokeWidth === 'number' && strokeWidth > 0 ? strokeWidth : fallback.strokeWidth,
    };
  } catch {
    return fallback;
  }
}

export function saveSetting(toolId: ToolId, setting: ToolSetting): void {
  try {
    localStorage.setItem(storageKey(toolId), JSON.stringify(setting));
  } catch {
    // Storage disabled or full; the choice still applies for this session.
  }
}
