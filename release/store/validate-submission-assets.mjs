import { createHash } from 'node:crypto';

import { assert, pngDimensions, read } from '../lib/assets.mjs';

const scenarios = ['01-library', '02-annotate', '03-tools', '04-drive'];
const screenshotSets = [
  { directory: 'android-phone', width: 1080, height: 1920, store: 'play' },
  { directory: 'ios-iphone-6.9', width: 1320, height: 2868, store: 'apple' },
  { directory: 'ios-ipad-13', width: 2064, height: 2752, store: 'apple' },
];

function characters(value) {
  return [...value].length;
}


async function json(relativePath) {
  return JSON.parse(await read(relativePath));
}

function within(value, maximum, label) {
  assert(typeof value === 'string' && value.trim(), `${label} is required`);
  assert(characters(value) <= maximum, `${label} is ${characters(value)} characters; maximum is ${maximum}`);
}

function https(value, label) {
  assert(new URL(value).protocol === 'https:', `${label} must use HTTPS`);
}

for (const locale of ['en-US', 'ja-JP']) {
  const listing = await json(`release/store/listing/${locale}.json`);
  assert(listing.locale === locale, `${locale} listing has the wrong locale`);

  within(listing.appStore.name, 30, `${locale} App Store name`);
  within(listing.appStore.subtitle, 30, `${locale} App Store subtitle`);
  within(listing.appStore.promotionalText, 170, `${locale} App Store promotional text`);
  within(listing.appStore.description, 4000, `${locale} App Store description`);
  assert(Buffer.byteLength(listing.appStore.keywords, 'utf8') <= 100, `${locale} App Store keywords exceed 100 UTF-8 bytes`);
  assert(!listing.appStore.keywords.split(',').some((word) => characters(word.trim()) <= 2), `${locale} App Store keywords must be longer than two characters`);
  https(listing.appStore.supportUrl, `${locale} App Store support URL`);
  https(listing.appStore.marketingUrl, `${locale} App Store marketing URL`);
  https(listing.appStore.privacyPolicyUrl, `${locale} App Store privacy URL`);

  within(listing.googlePlay.name, 30, `${locale} Play name`);
  within(listing.googlePlay.shortDescription, 80, `${locale} Play short description`);
  within(listing.googlePlay.fullDescription, 4000, `${locale} Play full description`);
  https(listing.googlePlay.privacyPolicyUrl, `${locale} Play privacy URL`);
  assert(
    listing.googlePlay.privacyPolicyUrl === listing.appStore.privacyPolicyUrl,
    `${locale} store privacy URLs must be identical`,
  );

  assert(Object.keys(listing.screenshotAltText).length === scenarios.length, `${locale} must describe every screenshot`);
  for (const scenario of scenarios) {
    within(listing.screenshotAltText[scenario], 140, `${locale} ${scenario} alt text`);
  }
}

if (process.argv.includes('--metadata-only')) {
  console.log('Store listing metadata is valid for en-US and ja-JP.');
  process.exit(0);
}

const hashes = new Map();
for (const set of screenshotSets) {
  for (const scenario of scenarios) {
    const relativePath = `release/store/screenshots/${set.directory}/${scenario}.png`;
    const bytes = await read(relativePath);
    const [width, height] = pngDimensions(bytes, relativePath);
    const bitDepth = bytes[24];
    const colorType = bytes[25];
    assert(width === set.width && height === set.height, `${relativePath} must be ${set.width}x${set.height}, got ${width}x${height}`);
    assert(bitDepth === 8 && colorType === 2, `${relativePath} must be an opaque 24-bit RGB PNG without alpha`);
    assert(bytes.length <= 8 * 1024 * 1024, `${relativePath} exceeds the 8 MB Play asset ceiling`);
    if (set.store === 'play') {
      assert(Math.min(width, height) >= 320 && Math.max(width, height) <= 3840, `${relativePath} is outside Play dimensions`);
      assert(Math.max(width, height) <= Math.min(width, height) * 2, `${relativePath} is taller than Play's 2:1 limit`);
    }
    const digest = createHash('sha256').update(bytes).digest('hex');
    assert(!hashes.has(digest), `${relativePath} duplicates ${hashes.get(digest)}`);
    hashes.set(digest, relativePath);
  }
}

const evidence = await json('release/store/screenshots/evidence.json');
assert(/^[0-9a-f]{40}$/.test(evidence.sourceCommit), 'screenshot evidence needs a full source commit SHA');
assert(/^\d+$/.test(String(evidence.githubRunId)), 'screenshot evidence needs a GitHub Actions run ID');
assert(evidence.syntheticFixture === 'apps/mobile/assets/store/iroha-demo.pdf', 'screenshot evidence must identify the synthetic fixture');
assert(Array.isArray(evidence.devices) && evidence.devices.length === 3, 'screenshot evidence must identify Android, iPhone, and iPad devices');

console.log(`Store submission assets are complete: 2 localized listings and ${hashes.size} validated screenshots.`);
