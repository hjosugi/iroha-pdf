import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const workflow = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8');
const desktopPackage = JSON.parse(readFileSync(resolve(root, 'apps/desktop/package.json'), 'utf8'));

assert.doesNotMatch(
  workflow,
  /run:\s*npm run build:desktop/,
  'CI must not bypass the Frost desktop-web output boundary',
);
assert.match(
  workflow,
  /e2e:\n[\s\S]*?needs: quality[\s\S]*?uses: actions\/download-artifact@v4[\s\S]*?name: quality-artifacts[\s\S]*?path: apps/,
  'E2E jobs must restore the quality job artifact beneath apps/',
);
assert.equal(
  desktopPackage.scripts?.preview,
  'vite preview --outDir dist/debug',
  'Playwright preview must serve the profile-specific Frost output',
);

process.stdout.write('CI and Playwright consume the profile-specific Frost web output.\n');
