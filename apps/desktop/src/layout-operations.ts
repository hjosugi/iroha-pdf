/**
 * Creating a print layout on the desktop (#23).
 *
 * The imposition itself is in `@iroha-pdf/core`; this asks where to put the result
 * and writes it through the same dialog, sibling grant and atomic rename as every
 * other produced file. The open document is never touched.
 *
 * Loaded on demand: `pdf-lib` behind it is the same megabyte the page operations,
 * form filling and blank-page tools keep out of the entry chunk.
 */
import { imposeBooklet, imposeNUp, imposePoster } from '@iroha-pdf/core';

import {
  allowSaveSiblings,
  pickSaveLocation,
  writePdfToDisk,
} from './file-bridge';

export type LayoutSheet = 'a4' | 'letter';

export type LayoutChoice =
  | { kind: 'n-up'; perSheet: 2 | 4; sheet: LayoutSheet }
  | { kind: 'booklet'; sheet: LayoutSheet }
  | { kind: 'poster'; columns: number; rows: number };

export type LayoutOutcome =
  | { status: 'written'; path: string; bytes: Uint8Array }
  | { status: 'cancelled' };

function suggestedName(sourceName: string, suffix: string): string {
  return `${sourceName.replace(/\.pdf$/i, '')}${suffix}.pdf`;
}

export async function applyLayout(
  source: Uint8Array,
  choice: LayoutChoice,
  sourceName: string,
): Promise<LayoutOutcome> {
  let bytes: Uint8Array;
  let suffix: string;

  switch (choice.kind) {
    case 'n-up':
      bytes = await imposeNUp(source, { perSheet: choice.perSheet, sheet: choice.sheet });
      suffix = choice.perSheet === 2 ? '-2up' : '-4up';
      break;
    case 'booklet':
      bytes = await imposeBooklet(source, { sheet: choice.sheet });
      suffix = '-booklet';
      break;
    case 'poster':
      bytes = await imposePoster(source, { columns: choice.columns, rows: choice.rows });
      suffix = `-poster-${choice.columns}x${choice.rows}`;
      break;
  }

  const target = await pickSaveLocation(suggestedName(sourceName, suffix));
  if (!target) return { status: 'cancelled' };
  await allowSaveSiblings(target);
  await writePdfToDisk(target, bytes.slice().buffer as ArrayBuffer);
  return { status: 'written', path: target, bytes };
}
