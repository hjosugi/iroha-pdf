#!/usr/bin/env node
/**
 * Builds the documentation site and checks the output before it can be
 * deployed. This is a gate, not a smoke test, because the two ways this site
 * can fail are both silent:
 *
 *  - A link that used to resolve in Markdown becomes a 404 once the documents
 *    are pages, and nothing in a normal build notices.
 *  - A stylesheet, font, or script sneaks in from another host, which would
 *    make the published site the one part of this project that does what
 *    `apps/desktop/e2e/offline.spec.ts` exists to forbid.
 *
 * It also pins the privacy-policy URL. That address is written into App Store
 * Connect, Play Console, and the OAuth consent screen (docs/
 * STORE_PRIVACY_CHECKLIST.md); it must not move because someone renamed a slug.
 *
 *   node site/verify.mjs [built-directory]
 *
 * With no argument it builds into a temporary directory first, so the check is
 * of a freshly generated site and never of a stale `site/dist`.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { argv, execPath, exit } from 'node:process';
import { fileURLToPath } from 'node:url';

import { DOCUMENTS } from './catalog.mjs';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}

function walk(directory, base = directory) {
  return readdirSync(directory).flatMap((entry) => {
    const full = path.join(directory, entry);
    return statSync(full).isDirectory() ? walk(full, base) : [path.relative(base, full)];
  });
}

let siteDir = argv[2] ? path.resolve(argv[2]) : null;
let temporary = null;
if (!siteDir) {
  temporary = mkdtempSync(path.join(tmpdir(), 'iroha-site-'));
  siteDir = path.join(temporary, 'dist');
  execFileSync(execPath, [path.join(root, 'site/build.mjs'), '--out', siteDir], { stdio: 'inherit' });
}

try {
  const files = new Set(walk(siteDir).map((file) => file.split(path.sep).join('/')));

  // Every catalogued document, plus the pages the site owes a visitor.
  for (const required of [
    'index.html',
    '404.html',
    'sitemap.xml',
    'robots.txt',
    'site.css',
    'icon.svg',
    'apple-touch-icon.png',
    ...DOCUMENTS.map((document) => `${document.slug}/index.html`),
  ]) {
    check(files.has(required), `missing from the built site: ${required}`);
  }

  // The address entered in the stores. Renaming this slug is a breaking change.
  check(files.has('privacy/index.html'), 'the privacy policy must be published at /privacy/');
  const privacy = readFileSync(path.join(siteDir, 'privacy/index.html'), 'utf8');
  check(
    privacy.includes('Iroha PDF privacy policy'),
    '/privacy/ must render docs/PRIVACY_POLICY.md, not a placeholder',
  );
  check(
    privacy.includes('<link rel="canonical" href="https://hjosugi.github.io/iroha-pdf/privacy/">')
      || privacy.includes('<link rel="canonical" href="'),
    '/privacy/ must declare a canonical URL',
  );

  const pages = [...files].filter((file) => file.endsWith('.html'));
  check(pages.length >= DOCUMENTS.length + 2, 'fewer pages were built than the catalogue declares');

  const attribute = /(?:href|src)="([^"]*)"/g;

  for (const page of pages) {
    const html = readFileSync(path.join(siteDir, page), 'utf8');
    const from = path.posix.dirname(page);

    check(!/<script[\s>]/i.test(html), `${page} contains a script; this site ships no JavaScript`);
    check(html.includes('rel="icon"'), `${page} does not declare a favicon`);
    check(html.includes('name="viewport"'), `${page} has no viewport meta; it must be readable on a phone`);
    check(/<html lang="(ja|en)">/.test(html), `${page} does not declare a document language`);
    check(
      html.includes('http-equiv="Content-Security-Policy"'),
      `${page} must declare the no-off-origin Content-Security-Policy`,
    );

    for (const [, target] of html.matchAll(attribute)) {
      if (/^https?:/i.test(target)) {
        // Off-origin is fine to *link* to and never acceptable to *load*.
        const loaded = new RegExp(
          `<(?:link|img|script|iframe|source|object|embed)\\b[^>]*"${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`,
          'i',
        );
        const inMeta = new RegExp(`<meta[^>]*content="${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'i');
        check(
          !loaded.test(html) || inMeta.test(html),
          `${page} loads an off-origin subresource: ${target}`,
        );
        continue;
      }
      if (target.startsWith('#') || target.startsWith('mailto:') || target.startsWith('data:')) continue;

      const [linkPath, fragment] = target.split('#');
      if (!linkPath) continue;

      const absolute = (
        linkPath.startsWith('/')
          ? linkPath.slice(1)
          : path.posix.normalize(path.posix.join(from === '.' ? '' : from, linkPath))
      ).replace(/^\.\/?/, '');
      const resolved = absolute === '' || absolute.endsWith('/') ? `${absolute}index.html` : absolute;

      check(
        files.has(resolved) || files.has(`${resolved}/index.html`),
        `${page} links to ${target}, which is not in the built site (resolved to ${resolved})`,
      );

      // A fragment that points at nothing is a link that silently does nothing.
      if (fragment && (files.has(resolved) || files.has(`${resolved}/index.html`))) {
        const targetFile = files.has(resolved) ? resolved : `${resolved}/index.html`;
        const targetHtml =
          targetFile === page ? html : readFileSync(path.join(siteDir, targetFile), 'utf8');
        check(
          targetHtml.includes(`id="${fragment}"`),
          `${page} links to #${fragment} in ${targetFile}, which has no such anchor`,
        );
      }
    }
  }
} finally {
  if (temporary) rmSync(temporary, { recursive: true, force: true });
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`not ok  ${failure}`);
  console.error(`\n${failures.length} site check(s) failed.`);
  exit(1);
}

console.log(`Documentation site builds and links cleanly (${DOCUMENTS.length} documents checked).`);
