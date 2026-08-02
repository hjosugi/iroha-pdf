#!/usr/bin/env node
import { closeSync, mkdirSync, openSync, writeSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const options = parseArguments(process.argv.slice(2));
const pageCount = options.pages ?? 500;
const sizeMiB = options.sizeMiB ?? 300;
const output = resolve(options.output ?? 'artifacts/device-evidence/large-500-pages.pdf');
if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error('--pages must be a positive integer');
if (!Number.isFinite(sizeMiB) || sizeMiB < 1) throw new Error('--size-mib must be at least 1');

mkdirSync(dirname(output), { recursive: true });
const descriptor = openSync(output, 'w');
let offset = 0;
const offsets = [0];
const filler = Buffer.alloc(64 * 1024, 0x20);

function write(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value, 'ascii');
  writeSync(descriptor, bytes);
  offset += bytes.length;
}

function object(id, body) {
  offsets[id] = offset;
  write(`${id} 0 obj\n${body}\nendobj\n`);
}

function writeSpaces(count) {
  let remaining = count;
  while (remaining > 0) {
    const length = Math.min(remaining, filler.length);
    write(length === filler.length ? filler : filler.subarray(0, length));
    remaining -= length;
  }
}

try {
  write('%PDF-1.7\n% Iroha PDF deterministic low-memory evidence\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  const pageIds = Array.from({ length: pageCount }, (_, index) => 4 + index * 2);
  object(2, `<< /Type /Pages /Count ${pageCount} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`);
  object(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  const targetBytes = Math.floor(sizeMiB * 1024 * 1024);
  // Spread the payload across pages so opening page 1 does not require parsing
  // one enormous stream, while the file and cross-reference table are still
  // genuinely large. Whitespace is legal PDF content and costs no JS heap.
  const bytesPerPage = Math.max(1024, Math.ceil(targetBytes / pageCount));
  const visible = 'BT /F1 20 Tf 72 742 Td (Iroha PDF low-memory evidence) Tj ET\n';

  for (let index = 0; index < pageCount; index += 1) {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    object(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`);
    offsets[contentId] = offset;
    const streamLength = visible.length + bytesPerPage + 1;
    write(`${contentId} 0 obj\n<< /Length ${streamLength} >>\nstream\n${visible}`);
    writeSpaces(bytesPerPage);
    write('\nendstream\nendobj\n');
  }

  const xref = offset;
  write(`xref\n0 ${offsets.length}\n`);
  write('0000000000 65535 f \n');
  for (let id = 1; id < offsets.length; id += 1) {
    write(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  }
  write(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
} finally {
  closeSync(descriptor);
}

process.stdout.write(`${output}\t${pageCount} pages\t${offset} bytes\n`);

function parseArguments(arguments_) {
  const parsed = {};
  for (let index = 0; index < arguments_.length; index += 1) {
    const value = arguments_[index];
    const next = arguments_[index + 1];
    if (value === '--pages' && next) parsed.pages = Number(next);
    else if (value === '--size-mib' && next) parsed.sizeMiB = Number(next);
    else if (value === '--output' && next) parsed.output = next;
    else throw new Error(`Unknown or incomplete argument: ${value}`);
    index += 1;
  }
  return parsed;
}
