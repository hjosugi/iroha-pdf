// Collects what `tauri build` bundled into a stable, Frost-owned output tree.
//
// The bundler writes into Cargo's target directory, whose layout is Cargo's to
// choose and contains no Frost profile, so it cannot be a Frost `output_dirs`
// entry — Frost requires `${config}` in a command target's outputs so profiles
// and platforms stay isolated. This step copies the finished packages out to
// `apps/desktop/bundle/<profile>/`, which can be, and in doing so makes the
// packaging a real graph artifact rather than a side effect left in target/.
//
// It also normalises the names. productName is "Iroha PDF", so most bundlers
// emit a filename containing a space, and GitHub rewrites spaces when it stores
// a release asset. Removing them here keeps a SHA256SUMS file describing the
// same names the release page shows.
//
// Usage: node release/desktop/collect-bundles.mjs <bundle-dir> <output-dir>

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Only these directories are read, and only for the extension that belongs in
// them. `bundle/appimage/` also holds the unpacked AppDir and `bundle/macos/`
// holds `Iroha PDF.app`; both are directory trees that cannot be release
// assets, and neither should be walked looking for stray matches.
const BUNDLERS = {
  appimage: '.AppImage',
  deb: '.deb',
  rpm: '.rpm',
  dmg: '.dmg',
  msi: '.msi',
  nsis: '.exe',
};

// What `bundle.targets: "all"` is expected to emit on each host. A missing
// entry is a failure: silently shipping a release without the Linux AppImage,
// or without the Windows NSIS installer, is exactly the outcome this whole
// pipeline exists to prevent.
const REQUIRED = {
  linux: ['appimage', 'deb', 'rpm'],
  darwin: ['dmg'],
  win32: ['msi', 'nsis'],
};

const repoRoot = resolve(fileURLToPath(import.meta.url), '../../..');

function fail(message) {
  process.stderr.write(`collect-bundles: ${message}\n`);
  process.exitCode = 1;
}

const [bundleArg, outputArg] = process.argv.slice(2);
if (!bundleArg || !outputArg) {
  process.stderr.write(
    'usage: node release/desktop/collect-bundles.mjs <bundle-dir> <output-dir>\n',
  );
  process.exit(2);
}

const bundleDir = resolve(repoRoot, bundleArg);
const outputDir = resolve(repoRoot, outputArg);

const required = REQUIRED[process.platform];
if (!required) {
  process.stderr.write(
    `collect-bundles: no desktop packages are defined for ${process.platform}\n`,
  );
  process.exit(2);
}

if (!existsSync(bundleDir)) {
  process.stderr.write(
    `collect-bundles: ${bundleArg} does not exist; tauri build produced no bundles\n`,
  );
  process.exit(1);
}

const { version } = JSON.parse(
  await readFile(join(repoRoot, 'apps/desktop/src-tauri/tauri.conf.json'), 'utf8'),
);

// Rebuilt from scratch so a stale package from an earlier version or an earlier
// architecture cannot survive into a release directory.
rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

const collected = [];

for (const [bundler, extension] of Object.entries(BUNDLERS)) {
  const dir = join(bundleDir, bundler);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(extension)) continue;

    const name = entry.name.replaceAll(' ', '-');
    const destination = join(outputDir, name);
    if (collected.some((item) => item.name === name)) {
      fail(`two bundlers both produced ${name}`);
      continue;
    }

    cpSync(join(dir, entry.name), destination);
    collected.push({
      bundler,
      name,
      bytes: statSync(destination).size,
      source: join(bundler, entry.name),
    });
  }
}

for (const bundler of required) {
  if (!collected.some((item) => item.bundler === bundler)) {
    fail(`${process.platform} produced no ${bundler} package under ${bundleArg}`);
  }
}

// A package carrying the wrong version means the wrong tree was built, which a
// checksum file downstream would happily bless.
for (const item of collected) {
  if (!item.name.includes(version)) {
    fail(`${item.name} does not carry version ${version}`);
  }
}

if (collected.length === 0) {
  fail(`no packages were found under ${bundleArg}`);
}

const width = Math.max(...collected.map((item) => item.name.length), 4);
for (const item of collected.sort((a, b) => a.name.localeCompare(b.name))) {
  const size = `${(item.bytes / 1024 / 1024).toFixed(1)} MiB`;
  process.stdout.write(
    `${item.name.padEnd(width)}  ${size.padStart(10)}  ${item.source}\n`,
  );
}
process.stdout.write(
  `${collected.length} package(s) in ${outputArg}${
    process.exitCode ? ' — but the set is incomplete\n' : '\n'
  }`,
);
