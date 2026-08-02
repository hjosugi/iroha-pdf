import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { globSync } from 'node:fs';

const root = resolve(import.meta.dirname, '../..');
const failures = [];

for (const relative of ['apps/desktop/src/styles.css', 'site/assets/site.css']) {
  const source = readFileSync(resolve(root, relative), 'utf8');
  const rawFixedSize = /^\s*(font-size|gap|border-radius|min-height|line-height):\s*(?!0(?:\D|$)|var\(|clamp\(|calc\()[0-9.]+(?:px|rem)\b/gm;
  for (const match of source.matchAll(rawFixedSize)) {
    const line = source.slice(0, match.index).split('\n').length;
    failures.push(`${relative}:${line}: ${match[1]} must use a design token`);
  }
  for (const match of source.matchAll(/\bline-height:\s*(?!var\()[0-9.]+/g)) {
    const line = source.slice(0, match.index).split('\n').length;
    failures.push(`${relative}:${line}: line-height must use a design token`);
  }
  const rawLayoutSize = /(?:^|[;{])\s*(width|height|max-width|max-height|min-width|margin(?:-[a-z]+)?|padding(?:-[a-z]+)?):\s*(?!0(?:\D|$)|var\(|clamp\(|calc\(|min\(|max\(|auto|100%)[0-9.]+(?:px|rem)\b/gm;
  for (const match of source.matchAll(rawLayoutSize)) {
    const line = source.slice(0, match.index).split('\n').length;
    failures.push(`${relative}:${line}: ${match[1]} must use a design token`);
  }
}

for (const absolute of globSync(resolve(root, 'apps/mobile/src/**/*.tsx'))) {
  const source = readFileSync(absolute, 'utf8');
  const stylesAt = source.indexOf('StyleSheet.create');
  if (stylesAt < 0) continue;
  const styles = source.slice(stylesAt);
  const rawNativeSize = /\b(minHeight|gap|borderRadius|fontSize|lineHeight|maxWidth|padding(?:Horizontal|Vertical)?):\s*[1-9][0-9]*(?:\.[0-9]+)?\b/g;
  for (const match of styles.matchAll(rawNativeSize)) {
    const line = source.slice(0, stylesAt + match.index).split('\n').length;
    failures.push(`${absolute.slice(root.length + 1)}:${line}: ${match[1]} must use a native design token`);
  }
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exit(1);
}
process.stdout.write('CSS custom properties and native size tokens are enforced.\n');
