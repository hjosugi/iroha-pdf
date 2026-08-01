/**
 * The one fixture the real-runtime run opens, built from the same source the
 * Playwright suite builds every fixture from.
 *
 * `e2e/fixtures.ts` is the definition of what `complex.pdf` is — two pages, CJK body
 * text, a table, an embedded unsubsetted font — and `run.mjs` asserts those exact
 * properties survive a save. A second copy of that builder here would drift from the
 * assertions the moment either side moved, so this compiles the real one instead.
 *
 * It is compiled rather than imported because Node cannot load TypeScript, and
 * `fixtures.ts` imports `./render` without an extension, so type stripping alone
 * cannot resolve it either. esbuild is already a devDependency of this workspace.
 * `import.meta.url` is pinned to the real path of `fixtures.ts` so the two things the
 * builder resolves relative to itself — the fixture directory and the Japanese font
 * under the workspace root — still land where they do when Playwright runs it.
 *
 * The Playwright suite reaches this through `e2e/global-setup.ts`, which a plain
 * `npm run e2e` runs. It is not reachable through `--list`: Playwright skips global
 * setup when it is only enumerating tests, so the instruction this file replaces
 * ("run npm run e2e -- --list") never produced a fixture at all.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(here, '../e2e/fixtures.ts');
const FIXTURE_DIR = join(here, '../e2e/fixtures');

/** Builds `complex.pdf` if it is not already on disk, and returns its path. */
export async function ensureComplexPdf() {
  const target = join(FIXTURE_DIR, 'complex.pdf');
  if (existsSync(target)) return target;

  console.log('building the complex.pdf fixture (first run in this checkout)');
  const { build } = await import('esbuild');
  const bundled = await build({
    entryPoints: [SOURCE],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    write: false,
    outfile: 'fixtures.mjs',
    define: { 'import.meta.url': JSON.stringify(pathToFileURL(SOURCE).href) },
  });
  const source = Buffer.from(bundled.outputFiles[0].text).toString('base64');
  const builder = await import(`data:text/javascript;base64,${source}`);

  mkdirSync(FIXTURE_DIR, { recursive: true });
  writeFileSync(target, await builder.buildComplexPdf());
  return target;
}
