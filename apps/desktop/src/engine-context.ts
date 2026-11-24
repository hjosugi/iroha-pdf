import { createContext, useContext } from 'react';
import type { PdfEngine } from '@embedpdf/models';

/**
 * The PDF engine, for the features the plugins do not wrap.
 *
 * Text extraction (#45) is an engine call: the selection plugin extracts the text
 * under a selection, but a search needs whole pages. The engine already exists in
 * `App` — the plugins hold it privately — so it is passed down explicitly rather
 * than reached for through a plugin that does not expose it.
 */
export const EngineContext = createContext<PdfEngine | null>(null);

export function usePdfEngine(): PdfEngine | null {
  return useContext(EngineContext);
}
