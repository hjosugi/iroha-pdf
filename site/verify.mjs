#!/usr/bin/env node
/**
 * Builds the documentation site and checks the output before it can be
 * deployed. This is a gate, not a smoke test, because the ways this site can
 * fail are all silent:
 *
 *  - A link that used to resolve in Markdown becomes a 404 once the documents
 *    are pages, and nothing in a normal build notices.
 *  - A stylesheet, font, or script sneaks in from another host, which would
 *    make the published site the one part of this project that does what
 *    `apps/desktop/e2e/offline.spec.ts` exists to forbid.
 *  - A page reaches its own stylesheet by a path that only works where it was
 *    tested. 404.html did exactly that: it asked for `/site.css`, which is this
 *    site's stylesheet on a domain of its own and somebody else's 404 on a
 *    project site, so the published error page rendered unstyled.
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

import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { argv, env, exit } from 'node:process';

import { buildSite } from './build.mjs';
import { DEFAULT_BASE_URL, DOCUMENTS } from './catalog.mjs';
import { renderInline } from './markdown.mjs';

const REQUIRED_FILES = [
  'index.html',
  '404.html',
  'sitemap.xml',
  'robots.txt',
  'site.css',
  'icon.svg',
  'apple-touch-icon.png',
  ...DOCUMENTS.map((document) => `${document.slug}/index.html`),
];

/**
 * The exact address written into App Store Connect, Play Console and the OAuth
 * consent screen — see docs/STORE_PRIVACY_CHECKLIST.md, which names this URL
 * three times.
 *
 * It is compared for equality, not merely required to exist. An earlier version
 * accepted any canonical at all, and a site built with `SITE_BASE_URL` pointing
 * somewhere else passed. That is not hypothetical — .github/workflows/pages.yml
 * builds with `SITE_BASE_URL: ${steps.pages.outputs.base_url}`, whatever GitHub
 * reports, so a custom domain, a repository rename or an organisation transfer
 * moves it. The three store listings would then point at a 404.
 */
const STORE_PRIVACY_URL = `${DEFAULT_BASE_URL}/privacy/`;

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}

function listFiles(directory, base = directory) {
  return readdirSync(directory).flatMap((entry) => {
    const full = path.join(directory, entry);
    return statSync(full).isDirectory()
      ? listFiles(full, base)
      : [path.relative(base, full).split(path.sep).join('/')];
  });
}

function canonicalOf(html) {
  return /<link rel="canonical" href="([^"]*)">/.exec(html)?.[1];
}

/** Every `href` and `src` in a page, with the element that carries it. */
function* references(html) {
  for (const [, tag, attributes] of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*)>/gi)) {
    for (const [, target] of attributes.matchAll(/\b(?:href|src)="([^"]*)"/g)) {
      yield { tag: tag.toLowerCase(), attributes, target };
    }
  }
}

/**
 * An `<a>` is somewhere a reader may choose to go, and a canonical link is only
 * a name. Everything else with a URL is fetched by the browser on load.
 */
function isSubresource({ tag, attributes }) {
  return tag !== 'a' && !(tag === 'link' && /\brel="canonical"/.test(attributes));
}

function loadSite(siteDir) {
  const files = new Set(listFiles(siteDir));
  const cache = new Map();
  const read = (file) => {
    if (!cache.has(file)) cache.set(file, readFileSync(path.join(siteDir, file), 'utf8'));
    return cache.get(file);
  };
  // Where the site says it lives, e.g. `/iroha-pdf/`. A root-absolute link is
  // only inside the site if it starts here.
  const canonical = files.has('index.html') ? canonicalOf(read('index.html')) : undefined;
  const basePath = canonical ? new URL(canonical).pathname.replace(/\/*$/, '/') : '/';
  return { files, read, basePath };
}

/** The built file a same-site target names, or null when there is none. */
function resolveTarget(site, page, linkPath) {
  let relative;
  if (linkPath.startsWith('/')) {
    if (!linkPath.startsWith(site.basePath)) return null;
    relative = linkPath.slice(site.basePath.length);
  } else {
    const from = path.posix.dirname(page);
    relative = path.posix.normalize(path.posix.join(from === '.' ? '' : from, linkPath));
  }
  relative = relative.replace(/^\.\/?/, '');
  const candidates =
    relative === '' || relative.endsWith('/')
      ? [`${relative}index.html`]
      : [relative, `${relative}/index.html`];
  return candidates.find((candidate) => site.files.has(candidate)) ?? null;
}

function checkPage(site, page) {
  const html = site.read(page);

  check(!/<script[\s>]/i.test(html), `${page} contains a script; this site ships no JavaScript`);
  check(html.includes('rel="icon"'), `${page} does not declare a favicon`);
  check(html.includes('name="viewport"'), `${page} has no viewport meta; it must be readable on a phone`);
  check(/<html lang="(ja|en)">/.test(html), `${page} does not declare a document language`);
  check(
    html.includes('http-equiv="Content-Security-Policy"'),
    `${page} must declare the no-off-origin Content-Security-Policy`,
  );
  // Browsers repair a link inside a link by ending the outer one early, so the
  // page still renders and half of the intended link silently stops working.
  check(
    !/<a\b[^>]*>(?:(?!<\/a>)[\s\S])*?<a\b/i.test(html),
    `${page} nests one link inside another`,
  );

  for (const reference of references(html)) {
    const { target } = reference;
    if (target.startsWith('#') || target.startsWith('mailto:') || target.startsWith('data:')) continue;

    if (/^(?:https?:)?\/\//i.test(target)) {
      // Off-origin is fine to *link* to and never acceptable to *load*.
      check(
        !isSubresource(reference),
        `${page} loads a subresource by absolute URL: ${target}`,
      );
      continue;
    }

    const [linkPath, fragment] = target.split('#');
    if (!linkPath) continue;

    // 404.html is served for a URL at any depth, so a relative path in it
    // resolves against wherever the reader happened to be.
    if (page === '404.html' && !linkPath.startsWith(site.basePath)) {
      check(
        false,
        `404.html reaches ${target} by a path that is not anchored at ${site.basePath};`
          + ' it is served at every depth and can only use paths from the site root',
      );
      continue;
    }

    const file = resolveTarget(site, page, linkPath);
    check(file !== null, `${page} links to ${target}, which is not in the built site`);

    // A fragment that points at nothing is a link that silently does nothing.
    if (file && fragment) {
      check(
        site.read(file).includes(`id="${fragment}"`),
        `${page} links to #${fragment} in ${file}, which has no such anchor`,
      );
    }
  }
}

/**
 * The renderer turns a bare `#123` into a link to that issue. A rule that
 * guesses is only safe while its boundaries hold, and a wrong guess still
 * renders as a perfectly ordinary link, so the boundaries are pinned here:
 * what must become a link, and the look-alikes that must not.
 */
function checkIssueReferences() {
  const render = (markdown) => renderInline(markdown, { issueUrl: (number) => `/issues/${number}` });
  const linked = (number) => `<a class="issue-ref" href="/issues/${number}">#${number}</a>`;
  const cases = [
    ['unsigned (#64); see #7.', `unsigned (${linked(64)}); see ${linked(7)}.`],
    ['編集履歴（#101）と#25の', `編集履歴（${linked(101)}）と${linked(25)}の`],
    ['the blue #2B5CFF and #123456', 'the blue #2B5CFF and #123456'],
    ['C#7 and docs/x#5', 'C#7 and docs/x#5'],
    ['`#64` in code', '<code>#64</code> in code'],
    ['[label #9](x.md)', '<a href="x.md">label #9</a>'],
    ['[https://a.example](b.md)', '<a href="b.md">https://a.example</a>'],
  ];
  for (const [markdown, expected] of cases) {
    const actual = render(markdown);
    check(
      actual === expected,
      `the Markdown renderer turned ${JSON.stringify(markdown)} into ${actual}, expected ${expected}`,
    );
  }
}

function checkSite(siteDir) {
  const site = loadSite(siteDir);

  // Every catalogued document, plus the pages the site owes a visitor.
  for (const required of REQUIRED_FILES) {
    check(site.files.has(required), `missing from the built site: ${required}`);
  }

  // The address entered in the stores. Renaming this slug is a breaking change.
  if (site.files.has('privacy/index.html')) {
    const privacy = site.read('privacy/index.html');
    check(
      privacy.includes('Iroha PDF privacy policy'),
      '/privacy/ must render docs/PRIVACY_POLICY.md, not a placeholder',
    );
    const canonical = canonicalOf(privacy);
    check(
      canonical === STORE_PRIVACY_URL,
      `/privacy/ must be canonical at ${STORE_PRIVACY_URL}, the address entered in the store`
        + ` consoles, but this build declares ${canonical ?? 'no canonical URL at all'}.`
        + ' Change both together, or not at all.',
    );
  } else {
    check(false, 'the privacy policy must be published at /privacy/');
  }

  const pages = [...site.files].filter((file) => file.endsWith('.html'));
  check(pages.length >= DOCUMENTS.length + 2, 'fewer pages were built than the catalogue declares');
  for (const page of pages) checkPage(site, page);
}

async function main() {
  let siteDir = argv[2] ? path.resolve(argv[2]) : null;
  let temporary = null;
  if (!siteDir) {
    temporary = mkdtempSync(path.join(tmpdir(), 'iroha-site-'));
    siteDir = path.join(temporary, 'dist');
    const pageCount = await buildSite({ outDir: siteDir, baseUrl: env.SITE_BASE_URL || DEFAULT_BASE_URL });
    console.log(`Built ${pageCount} pages into ${siteDir}`);
  }

  try {
    checkIssueReferences();
    checkSite(siteDir);
  } finally {
    if (temporary) rmSync(temporary, { recursive: true, force: true });
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(`not ok  ${failure}`);
    console.error(`\n${failures.length} site check(s) failed.`);
    exit(1);
  }
  console.log(`Documentation site builds and links cleanly (${DOCUMENTS.length} documents checked).`);
}

main().catch((error) => {
  console.error(error);
  exit(1);
});
