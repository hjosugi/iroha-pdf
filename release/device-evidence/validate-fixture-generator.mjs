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
  const harness = readFileSync(resolve(root, 'release/device-evidence/verify-low-memory-android.sh'), 'utf8');
  assert.match(harness, /trap capture_unexpected_failure ERR/, 'unexpected harness failures must retain logcat');
  assert.match(harness, /curl --fail --silent --show-error --head/, 'the fixture server must be ready before the app starts downloading');
  assert.match(harness, /send-trim-memory "\$package" RUNNING_CRITICAL/, 'the foreground critical-trim transition must remain explicit');
  assert.match(harness, /for _ in \$\(seq 1 30\); do[\s\S]*send-trim-memory "\$package" BACKGROUND/, 'background trim must wait for ActivityManager to finish the HOME transition');
  assert.match(harness, /capture_logcat_required\(\)[\s\S]*for _ in \$\(seq 1 10\); do[\s\S]*adb logcat -d[\s\S]*capture_logcat_required\s*\nif grep/, 'final crash evidence must tolerate a transient ADB transfer failure without skipping the log check');
  assert.match(workflow, /adb pull[^\n]*stylus-pressure\.png[\s\S]*adb pull[^\n]*stylus-window\.xml[\s\S]*instrumentation_status == 0/, 'stylus failures must retain the in-app screen and accessibility tree before failing');
  const stylusHarness = readFileSync(resolve(root, 'release/device-evidence/prepare-stylus-instrumentation.mjs'), 'utf8');
  assert.match(stylusHarness, /finally \{\s*captureEvidence\(device, target\);\s*\}/, 'the instrumentation must capture evidence before Android stops the target package');
  assert.match(stylusHarness, /Page 1 of 500[\s\S]*240_000/, 'stylus instrumentation must wait for the real large document instead of racing the initial 1-page state');
  assert.match(stylusHarness, /annotation page did not appear before selecting the pen/, 'the stable page bounds must be measured before annotation controls alter the accessibility tree');

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
