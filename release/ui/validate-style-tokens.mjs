import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { globSync } from 'node:fs';

const root = resolve(import.meta.dirname, '../..');
const failures = [];

for (const relative of ['apps/desktop/src/styles.css', 'site/assets/site.css']) {
  const source = readFileSync(resolve(root, relative), 'utf8');
  source.split('\n').forEach((line, index) => {
    const declaration = line.trim();
    // Custom properties are the source of truth. CSS does not resolve custom
    // properties in media-query conditions, so breakpoints are the one native
    // syntax exception; every declaration in a rule must consume a token.
    if (declaration.startsWith('--') || declaration.startsWith('@media')) return;
    if (/-?(?:\d+\.)?\d+(?:px|rem)\b/.test(declaration)) {
      failures.push(`${relative}:${index + 1}: fixed CSS sizes must use a design token`);
    }
  });
  for (const match of source.matchAll(/\bline-height:\s*(?!var\()[0-9.]+/g)) {
    const line = source.slice(0, match.index).split('\n').length;
    failures.push(`${relative}:${line}: line-height must use a design token`);
  }
}

for (const absolute of globSync(resolve(root, 'apps/mobile/src/**/*.tsx'))) {
  const source = readFileSync(absolute, 'utf8');
  const stylesAt = source.indexOf('StyleSheet.create');
  if (stylesAt < 0) continue;
  const styles = source.slice(stylesAt);
  const rawNativeSize = /\b(width|height|minWidth|minHeight|maxWidth|maxHeight|gap|borderRadius|borderWidth|fontSize|lineHeight|letterSpacing|margin(?:Horizontal|Vertical|Top|Bottom|Left|Right)?|padding(?:Horizontal|Vertical|Top|Bottom|Left|Right)?):\s*-?(?!0(?:\.0+)?\b)[0-9]+(?:\.[0-9]+)?\b/g;
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
