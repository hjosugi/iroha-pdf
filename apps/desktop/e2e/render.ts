/**
 * Rasterising a PDF with engines that are not pdfium.
 *
 * pdfium both writes the annotation and reads it back, so "pdfium can see it" proves
 * very little about whether the person you send the file to can. poppler and
 * Ghostscript share no code with pdfium, so agreement between them is real evidence
 * that the mark is in the file in a standard-conforming way.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export type Box = { x: number; y: number; width: number; height: number };

function has(tool: string): boolean {
  try {
    execFileSync('which', [tool], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export const RENDERERS = {
  poppler: has('pdftoppm'),
  ghostscript: has('gs'),
  imagemagick: has('magick') || has('convert'),
};

function magick(args: string[]): string {
  const binary = has('magick') ? 'magick' : 'convert';
  return execFileSync(binary, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

/** Renders one page to PNG and returns the path, or null when the engine is missing. */
export function renderPoppler(
  pdfPath: string,
  outPrefix: string,
  dpi = 72,
  pageNumber = 1,
): string | null {
  if (!RENDERERS.poppler) return null;
  execFileSync(
    'pdftoppm',
    ['-png', '-r', String(dpi), '-f', String(pageNumber), '-l', String(pageNumber), pdfPath, outPrefix],
    { stdio: ['ignore', 'ignore', 'ignore'] },
  );
  // pdftoppm suffixes the page number, zero-padded to the page count's width.
  for (const candidate of [`${outPrefix}-${pageNumber}.png`, `${outPrefix}-0${pageNumber}.png`]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function renderGhostscript(pdfPath: string, outPath: string, dpi = 72): string | null {
  if (!RENDERERS.ghostscript) return null;
  execFileSync(
    'gs',
    [
      '-q',
      '-dNOPAUSE',
      '-dBATCH',
      '-dFirstPage=1',
      '-dLastPage=1',
      '-sDEVICE=png16m',
      `-r${dpi}`,
      '-dShowAnnots=true',
      '-o',
      outPath,
      pdfPath,
    ],
    { stdio: ['ignore', 'ignore', 'ignore'] },
  );
  return existsSync(outPath) ? outPath : null;
}

/**
 * Bounding box of everything that differs between two renders, or null when they are
 * identical. Threshold keeps antialiasing noise from widening the box.
 */
export function diffBox(before: string, after: string, thresholdPercent = 8): Box | null {
  if (!RENDERERS.imagemagick) return null;
  const raw = magick([
    before,
    after,
    '-compose',
    'difference',
    '-composite',
    '-threshold',
    `${thresholdPercent}%`,
    '-format',
    '%@',
    'info:',
  ]);
  // ImageMagick reports "WxH+X+Y", or "0x0+0+0" when nothing differs.
  const match = raw.match(/^(\d+)x(\d+)\+(\d+)\+(\d+)$/);
  if (!match) return null;
  const [, width, height, x, y] = match.map(Number) as [number, number, number, number, number];
  if (width === 0 || height === 0) return null;
  return { x, y, width, height };
}

/**
 * Normalised RMSE between two images, 0 meaning identical and 1 meaning maximally
 * different. Both are scaled to a common size first, so a screenshot taken at the
 * app's zoom can be compared against a reference rendered at a fixed DPI.
 */
export function rmseAgainst(a: string, b: string, size = '600x800!'): number | null {
  if (!RENDERERS.imagemagick) return null;
  const binary = has('magick') ? 'magick' : 'convert';
  try {
    // `compare` writes the metric to stderr and exits non-zero when images differ.
    const output = execFileSync(
      has('magick') ? 'magick' : 'compare',
      has('magick')
        ? ['compare', '-metric', 'RMSE', '-resize', size, a, '-resize', size, b, 'null:']
        : ['-metric', 'RMSE', '-resize', size, a, '-resize', size, b, 'null:'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return parseMetric(output);
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? '';
    const parsed = parseMetric(stderr);
    if (parsed !== null) return parsed;
    void binary;
    return null;
  }
}

/** ImageMagick prints "12345.6 (0.1883)"; the parenthesised value is normalised. */
function parseMetric(text: string): number | null {
  const match = text.match(/\(([\d.eE+-]+)\)/);
  return match ? Number(match[1]) : null;
}

export function imageSize(path: string): { width: number; height: number } {
  const raw = magick([path, '-format', '%wx%h', 'info:']);
  const [width, height] = raw.split('x').map(Number);
  return { width: width ?? 0, height: height ?? 0 };
}

export function tempName(directory: string, name: string): string {
  return join(directory, name);
}
