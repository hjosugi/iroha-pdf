import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '../..');
const temporary = mkdtempSync(join(tmpdir(), 'iroha-device-fixture-'));
const fixture = join(temporary, 'fixture.pdf');

try {
  const workflow = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8');
  assert.match(workflow, /-lowram -memory 1536/, 'the device gate must prevent the API 36 emulator from raising RAM to 2.5 GiB');
  assert.match(workflow, /\$\{\{ runner\.temp \}\}\/large-500-pages\.pdf/, 'the 300 MiB fixture must stay outside the uploaded evidence directory');

  for (const [tool, arguments_] of [
    [process.execPath, ['--check', resolve(root, 'release/device-evidence/prepare-stylus-instrumentation.mjs')]],
    ['bash', ['-n', resolve(root, 'release/device-evidence/verify-low-memory-android.sh')]],
  ]) {
    const syntax = spawnSync(tool, arguments_, { encoding: 'utf8' });
    if (syntax.status !== 0) throw new Error(syntax.stderr || `${tool} syntax check exited ${syntax.status}`);
  }
  const result = spawnSync(process.execPath, [
    resolve(root, 'release/device-evidence/generate-large-pdf.mjs'),
    '--pages', '10', '--size-mib', '1', '--output', fixture,
  ], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || `generator exited ${result.status}`);
  if (statSync(fixture).size < 1024 * 1024) throw new Error('generated fixture is smaller than requested');
  const bytes = readFileSync(fixture);
  const head = bytes.subarray(0, 16).toString('ascii');
  const tail = bytes.subarray(-256).toString('ascii');
  if (!head.startsWith('%PDF-1.7')) throw new Error('fixture has no PDF header');
  if (!tail.includes('/Size 24') || !tail.endsWith('%%EOF\n')) {
    throw new Error('fixture has an incomplete cross-reference trailer');
  }
  process.stdout.write('Large-PDF generator produced a deterministic 10-page validation fixture.\n');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
