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
  assert.match(workflow, /system-images;android-36;default;x86_64/, 'the low-memory gate must use the plain AOSP image so Google first-boot provisioning cannot consume the app budget');
  assert.doesNotMatch(workflow.slice(workflow.indexOf('android-low-memory:'), workflow.indexOf('store-screenshots:')), /google_apis/, 'the low-memory job must not install a Google-services system image');
  assert.match(workflow, /device_provisioned 1[\s\S]*user_setup_complete 1[\s\S]*wm dismiss-keyguard/, 'the AVD must finish first-boot setup before evidence starts');
  assert.match(workflow, /\$\{\{ runner\.temp \}\}\/large-500-pages\.pdf/, 'the 300 MiB fixture must stay outside the uploaded evidence directory');
  const harness = readFileSync(resolve(root, 'release/device-evidence/verify-low-memory-android.sh'), 'utf8');
  assert.match(harness, /trap capture_unexpected_failure ERR/, 'unexpected harness failures must retain logcat');
  assert.match(harness, /curl --fail --silent --show-error --head/, 'the fixture server must be ready before the app starts downloading');
  assert.match(harness, /send-trim-memory "\$package" RUNNING_CRITICAL/, 'the foreground critical-trim transition must remain explicit');
  assert.match(harness, /for _ in \$\(seq 1 30\); do[\s\S]*send-trim-memory "\$package" BACKGROUND/, 'background trim must wait for ActivityManager to finish the HOME transition');
  assert.match(harness, /capture_logcat_required\(\)[\s\S]*for _ in \$\(seq 1 10\); do[\s\S]*adb logcat -d[\s\S]*capture_logcat_required\s*\nif grep/, 'final crash evidence must tolerate a transient ADB transfer failure without skipping the log check');
  assert.match(workflow, /adb logcat -c[\s\S]*IrohaStylusEvidence:I[\s\S]*adb pull \/data\/local\/tmp\/iroha-stylus-pressure\.png[\s\S]*adb pull \/data\/local\/tmp\/iroha-stylus-window\.xml[\s\S]*screencap -p[\s\S]*uiautomator dump \/data\/local\/tmp\/iroha-stylus-window\.xml[\s\S]*instrumentation_status == 0[\s\S]*Verified persisted stylus pressure[\s\S]*Verified visible pressure accessibility state[\s\S]*89504e470d0a1a0a[\s\S]*grep -q '<hierarchy'[\s\S]*package="app\.irohapdf\.mobile"[\s\S]*Pressure enabled\|筆圧を反映中/, 'stylus failures must retain foreground or shell-fallback evidence, and successful runs must prove persistence, visible pressure semantics, PNG integrity, and the target-app tree');
  assert.match(workflow, /dependencyInsight[\s\S]*--dependency react-android[\s\S]*project \.[*]packages:react-native:ReactAndroid[\s\S]*--dependency hermes-android[\s\S]*project \.[*]packages:react-native:ReactAndroid:hermes-engine/, 'the device gate must prove Gradle resolved both the patched React Android project and its matching Hermes source rather than only inspect source text');
  assert.match(workflow, /com\\\.facebook\\\.react:react-native\.\*-> com\\\.facebook\\\.react:react-android[\s\S]*legacy react-native dependency escaped/, 'the device gate must reject a legacy react-native coordinate rewritten to the published React Android AAR');
  const stylusHarness = readFileSync(resolve(root, 'release/device-evidence/prepare-stylus-instrumentation.mjs'), 'utf8');
  assert.match(stylusHarness, /ACTION_UP[\s\S]*waitForPressurePayload[\s\S]*Verified visible pressure accessibility state[\s\S]*captureEvidence\(device\);\s*evidenceCaptured = true;/, 'successful instrumentation must capture only after persistence and visible pressure semantics pass');
  assert.match(stylusHarness, /finally \{[\s\S]*if \(!evidenceCaptured\)[\s\S]*captureEvidence\(device\);[\s\S]*Could not retain failed stylus evidence/, 'early stylus failures must make a best effort to retain evidence without hiding the original assertion');
  assert.match(stylusHarness, /android\.util\.Base64[\s\S]*dumpWindowHierarchy\(hierarchy\)[\s\S]*package=[^\n]*app\.irohapdf\.mobile[\s\S]*Pressure enabled[\s\S]*筆圧を反映中[\s\S]*Base64\.NO_WRAP[\s\S]*base64 -d > \/data\/local\/tmp\/iroha-stylus-window\.xml[\s\S]*screencap -p \/data\/local\/tmp\/iroha-stylus-pressure\.png/, 'stylus evidence must prove the foreground app and pressure state before writing shell-readable XML and PNG files');
  assert.match(stylusHarness, /new File\(new File\(context\.getFilesDir\(\), "SQLite"\), "iroha-pdf\.db"\)/, 'instrumentation must read Expo SQLite from its Android default directory rather than Context#getDatabasePath');
  assert.match(stylusHarness, /Page 1 of 500[\s\S]*240_000/, 'stylus instrumentation must wait for the real large document instead of racing the initial 1-page state');
  assert.match(stylusHarness, /annotation page did not appear before selecting the pen/, 'the stable page bounds must be measured before annotation controls alter the accessibility tree');
  assert.match(stylusHarness, /instrumentation\.sendPointerSync\(event\)/, 'stylus events must cross the Android input dispatcher instead of bypassing it through Activity dispatch');
  assert.match(stylusHarness, /Persisted stylus payload:[\s\S]*Verified persisted stylus pressure:[\s\S]*low<0\.3 high>0\.8[\s\S]*Pressure enabled[\s\S]*筆圧を反映中[\s\S]*Verified visible pressure accessibility state/, 'the device gate must report the persisted sample bounds before verifying the accessible pointer-bridge state');

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
