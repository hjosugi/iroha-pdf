/**
 * The practice document the first-run screen offers (#65).
 *
 * It is generated rather than drawn by hand so that what it says is reviewable as
 * text, and so that `--check` can prove the committed copies are exactly what this
 * script produces — a binary nobody can regenerate is a binary nobody can fix.
 * Everything that would make the output vary is pinned: the dates and the metadata.
 *
 * It is in English only, on purpose. The first-run screen around it is localized;
 * a Japanese edition of the PDF needs Noto Sans JP embedded, and pdf-lib's subset
 * of that CFF font comes out with glyphs that poppler and Ghostscript draw as the
 * wrong characters or as boxes (checked 2026-09-25 with pdftoppm and gs). A
 * practice document that renders wrongly in other viewers is worse than one in
 * English, and embedding the whole 4.5 MB face to avoid subsetting is not a
 * sample's size.
 *
 *   node release/sample/generate.mjs          # write both copies
 *   node release/sample/generate.mjs --check  # fail if either copy is stale
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const root = new URL('../../', import.meta.url);

/** Written once per app: mobile bundles it, desktop serves it. */
const OUTPUTS = ['apps/mobile/assets/sample/iroha-sample.pdf', 'apps/desktop/public/sample/iroha-sample.pdf'];

const BLUE = rgb(43 / 255, 92 / 255, 1);
const INK = rgb(23 / 255, 27 / 255, 36 / 255);
const MUTED = rgb(105 / 255, 113 / 255, 126 / 255);
const PAPER = rgb(1, 1, 1);
const PANEL = rgb(246 / 255, 247 / 255, 249 / 255);
const LINE = rgb(214 / 255, 219 / 255, 227 / 255);

const COPY = {
  en: {
    title: 'Iroha PDF practice document',
    eyebrow: 'SAMPLE',
    heading: 'Welcome to Iroha PDF',
    intro: 'A practice document. It lives only in this app, so nothing you do to it touches your own files.',
    steps: [
      ['Highlight', 'Choose Highlight, then drag across this sentence to mark it.'],
      ['Pen', 'Choose Pen and draw inside the box below. Undo takes a stroke back.'],
      ['Text', 'Choose Text and tap anywhere on the page to leave a comment.'],
      ['Notes', 'Notes are saved as you type, on this device.'],
    ],
    box: 'Draw here',
    footer: 'Page 1 of 2',
    secondHeading: 'A second page',
    second: [
      'This page is here so that page navigation and the page tools have something to work with.',
      'Try reordering, rotating or extracting pages. Each of those writes a new PDF.',
      'When you are done, open one of your own PDFs. This sample can be deleted at any time.',
    ],
    secondFooter: 'Page 2 of 2',
  },
};

/** Breaks `text` into lines no wider than `width`, by word — or by character when there are no spaces. */
function wrap(text, font, size, width) {
  const units = text.includes(' ') ? text.split(' ') : [...text];
  const joiner = text.includes(' ') ? ' ' : '';
  const lines = [];
  let line = '';
  for (const unit of units) {
    const candidate = line ? `${line}${joiner}${unit}` : unit;
    if (line && font.widthOfTextAtSize(candidate, size) > width) {
      lines.push(line);
      line = unit;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function render() {
  const copy = COPY.en;
  const pdf = await PDFDocument.create();
  pdf.setTitle(copy.title);
  pdf.setAuthor('Iroha PDF contributors');
  pdf.setSubject('Practice document offered on first run');
  pdf.setCreator('release/sample/generate.mjs');
  pdf.setProducer('pdf-lib');
  pdf.setLanguage('en');
  const fixedDate = new Date('2026-09-25T00:00:00.000Z');
  pdf.setCreationDate(fixedDate);
  pdf.setModificationDate(fixedDate);

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const width = 595.28;
  const height = 841.89;
  const margin = 56;
  const column = width - margin * 2;

  const first = pdf.addPage([width, height]);
  first.drawRectangle({ x: 0, y: 0, width, height, color: PAPER });
  first.drawRectangle({ x: 0, y: height - 150, width, height: 150, color: BLUE });
  first.drawText(copy.eyebrow, { x: margin, y: height - 56, size: 10, font: bold, color: rgb(1, 1, 1) });
  first.drawText(copy.heading, { x: margin, y: height - 96, size: 28, font: bold, color: rgb(1, 1, 1) });
  let y = height - 124;
  for (const line of wrap(copy.intro, regular, 10, column)) {
    first.drawText(line, { x: margin, y, size: 10, font: regular, color: rgb(0.87, 0.9, 1) });
    y -= 14;
  }

  y = height - 200;
  copy.steps.forEach(([label, body], index) => {
    first.drawText(`${index + 1}. ${label}`, { x: margin, y, size: 15, font: bold, color: INK });
    y -= 22;
    for (const line of wrap(body, regular, 12, column)) {
      first.drawText(line, { x: margin, y, size: 12, font: regular, color: INK });
      y -= 18;
    }
    y -= 14;
    if (index === 1) {
      // The pen box sits under the pen step, where the step says it is.
      first.drawRectangle({ x: margin, y: y - 110, width: column, height: 120, color: PANEL, borderColor: LINE, borderWidth: 1 });
      first.drawText(copy.box, { x: margin + 12, y: y - 12, size: 10, font: regular, color: MUTED });
      y -= 140;
    }
  });
  first.drawText(copy.footer, { x: margin, y: 36, size: 9, font: regular, color: MUTED });

  const second = pdf.addPage([width, height]);
  second.drawRectangle({ x: 0, y: 0, width, height, color: PAPER });
  second.drawText(copy.secondHeading, { x: margin, y: height - 96, size: 24, font: bold, color: INK });
  y = height - 140;
  for (const paragraph of copy.second) {
    for (const line of wrap(paragraph, regular, 12, column)) {
      second.drawText(line, { x: margin, y, size: 12, font: regular, color: INK });
      y -= 18;
    }
    y -= 12;
  }
  second.drawText(copy.secondFooter, { x: margin, y: 36, size: 9, font: regular, color: MUTED });

  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

const check = process.argv.includes('--check');
const bytes = await render();
let stale = false;
for (const relative of OUTPUTS) {
  const target = new URL(relative, root);
  if (check) {
    const committed = await readFile(target).catch(() => null);
    if (!committed || !committed.equals(bytes)) {
      console.error(`Sample PDF is stale: ${relative} — run node release/sample/generate.mjs`);
      stale = true;
    }
  } else {
    await mkdir(dirname(fileURLToPath(target)), { recursive: true });
    await writeFile(target, bytes);
    console.log(`Generated ${relative} (${bytes.length} bytes).`);
  }
}
if (check) {
  if (stale) process.exit(1);
  console.log(`The sample PDF is reproducible (${bytes.length} bytes).`);
}
