import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const outputUrl = new URL('../../../apps/mobile/assets/store/iroha-demo.pdf', import.meta.url);

const BLUE = rgb(43 / 255, 92 / 255, 1);
const INK = rgb(23 / 255, 27 / 255, 36 / 255);
const MUTED = rgb(105 / 255, 113 / 255, 126 / 255);
const PAPER = rgb(246 / 255, 247 / 255, 249 / 255);
const GREEN = rgb(22 / 255, 131 / 255, 95 / 255);

async function renderFixture() {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Iroha PDF synthetic store fixture');
  pdf.setAuthor('Iroha PDF contributors');
  pdf.setSubject('Synthetic content for reproducible store screenshots');
  pdf.setKeywords(['synthetic', 'store screenshot', 'Iroha PDF']);
  pdf.setCreator('release/store/fixtures/generate.mjs');
  pdf.setProducer('pdf-lib');
  const fixedDate = new Date('2026-01-15T09:41:00.000Z');
  pdf.setCreationDate(fixedDate);
  pdf.setModificationDate(fixedDate);

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([595.28, 841.89]);

  page.drawRectangle({ x: 0, y: 0, width: 595.28, height: 841.89, color: PAPER });
  page.drawRectangle({ x: 0, y: 724, width: 595.28, height: 118, color: BLUE });
  page.drawText('PROJECT HANDOFF', { x: 48, y: 792, size: 10, font: bold, color: rgb(1, 1, 1), characterSpacing: 1.5 });
  page.drawText('Launch checklist', { x: 48, y: 751, size: 28, font: bold, color: rgb(1, 1, 1) });
  page.drawText('A synthetic document created only for store screenshots', { x: 48, y: 731, size: 9, font: regular, color: rgb(0.87, 0.9, 1) });

  page.drawText('Release overview', { x: 48, y: 682, size: 18, font: bold, color: INK });
  page.drawText('Everything below is fictional. No customer document, account, or path is used.', { x: 48, y: 660, size: 10, font: regular, color: MUTED });

  const rows = [
    ['Mobile review', 'Ready', GREEN],
    ['Privacy copy', 'Ready', GREEN],
    ['Store artwork', 'In review', BLUE],
    ['Release notes', 'Ready', GREEN],
  ];
  let y = 618;
  for (const [label, status, color] of rows) {
    page.drawRectangle({ x: 48, y: y - 12, width: 499, height: 42, color: rgb(1, 1, 1), borderColor: rgb(0.9, 0.91, 0.94), borderWidth: 0.7 });
    page.drawText(label, { x: 64, y: y + 2, size: 11, font: bold, color: INK });
    const statusWidth = bold.widthOfTextAtSize(status, 9) + 22;
    page.drawRectangle({ x: 529 - statusWidth, y: y - 1, width: statusWidth, height: 20, color, opacity: 0.12, borderRadius: 6 });
    page.drawText(status, { x: 540 - statusWidth, y: y + 5, size: 9, font: bold, color });
    y -= 52;
  }

  page.drawText('Notes for the team', { x: 48, y: 380, size: 16, font: bold, color: INK });
  const notes = [
    'Keep the original PDF unchanged and export edits as a separate copy.',
    'Confirm annotations, page tools, sharing, and printing before submission.',
    'Use the same public privacy-policy URL in both store consoles.',
  ];
  y = 350;
  for (const note of notes) {
    page.drawCircle({ x: 55, y: y + 4, size: 3, color: BLUE });
    page.drawText(note, { x: 68, y, size: 10.5, font: regular, color: INK });
    y -= 30;
  }

  page.drawRectangle({ x: 48, y: 156, width: 499, height: 82, color: rgb(0.91, 0.94, 1), borderColor: rgb(0.73, 0.79, 1), borderWidth: 0.8 });
  page.drawText('LOCAL-FIRST', { x: 64, y: 212, size: 9, font: bold, color: BLUE, characterSpacing: 1.2 });
  page.drawText('Documents stay on this device unless the user chooses to share or connect Drive.', { x: 64, y: 188, size: 10.5, font: regular, color: INK });
  page.drawText('Page 1 of 2  |  Synthetic fixture', { x: 48, y: 54, size: 8.5, font: regular, color: MUTED });

  const page2 = pdf.addPage([595.28, 841.89]);
  page2.drawRectangle({ x: 0, y: 0, width: 595.28, height: 841.89, color: PAPER });
  page2.drawText('Review notes', { x: 48, y: 768, size: 28, font: bold, color: INK });
  page2.drawText('A second page proves that paging controls reflect the document truthfully.', { x: 48, y: 742, size: 10, font: regular, color: MUTED });
  page2.drawRectangle({ x: 48, y: 570, width: 499, height: 122, color: rgb(1, 1, 1), borderColor: rgb(0.9, 0.91, 0.94), borderWidth: 0.8 });
  page2.drawText('Final check', { x: 68, y: 654, size: 16, font: bold, color: INK });
  page2.drawText('Open  •  Annotate  •  Export  •  Print', { x: 68, y: 621, size: 13, font: bold, color: BLUE });
  page2.drawText('The source fixture is generated deterministically and contains no private data.', { x: 68, y: 594, size: 10, font: regular, color: MUTED });
  page2.drawText('Page 2 of 2  |  Synthetic fixture', { x: 48, y: 54, size: 8.5, font: regular, color: MUTED });

  return pdf.save({ useObjectStreams: false, addDefaultPage: false, objectsPerTick: Number.POSITIVE_INFINITY });
}

const bytes = Buffer.from(await renderFixture());
if (process.argv.includes('--check')) {
  const committed = await readFile(outputUrl).catch(() => null);
  if (!committed || !committed.equals(bytes)) {
    console.error(`Store fixture is stale: ${fileURLToPath(outputUrl)}`);
    process.exit(1);
  }
  console.log(`Store fixture is reproducible (${bytes.length} bytes).`);
} else {
  await mkdir(dirname(fileURLToPath(outputUrl)), { recursive: true });
  await writeFile(outputUrl, bytes);
  console.log(`Generated ${fileURLToPath(outputUrl)} (${bytes.length} bytes).`);
}
