#!/usr/bin/env node
/**
 * Builds the GitHub Pages documentation site from the Markdown already in this
 * repository. No generator, no theme, no runtime script, no off-origin request:
 * the output is static HTML, one stylesheet, and two icons copied from
 * `assets/branding/`. Every page declares a CSP that permits nothing but its
 * own origin, so "this site fetches nothing" is enforced by the page and not
 * merely asserted in a review.
 *
 *   node site/build.mjs [--out <dir>]
 *
 * `SITE_BASE_URL` sets the absolute origin used for canonical links and
 * sitemap.xml; the workflow passes the value `actions/configure-pages` resolves.
 * Everything a page links to is relative, so the output also works from a
 * subdirectory or a local static server without a rebuild.
 */

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { argv, env, exit } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_BASE_URL,
  DOCUMENTS,
  FACTS,
  HERO,
  REPOSITORY,
  REPOSITORY_URL,
  SECTIONS,
} from './catalog.mjs';
import { escapeHtml, renderInline, renderMarkdown } from './markdown.mjs';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const outIndex = argv.indexOf('--out');
const outDir = path.resolve(outIndex === -1 ? path.join(root, 'site/dist') : argv[outIndex + 1]);

const baseUrl = (env.SITE_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
const bySource = new Map(DOCUMENTS.map((document) => [document.source, document]));

const CSP = [
  "default-src 'none'",
  "img-src 'self'",
  "style-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const SITE_DESCRIPTION =
  'Iroha PDF is a local-first PDF workspace for iOS, Android, Windows, macOS and Linux. '
  + 'Architecture, build, privacy, security and release documentation.';

/** Picks the document element language from the text itself; these docs are bilingual. */
function detectLanguage(text) {
  const cjk = (text.match(/[぀-ヿ㐀-鿿]/gu) ?? []).length;
  const latin = (text.match(/[A-Za-z]/gu) ?? []).length;
  return cjk * 6 > latin ? 'ja' : 'en';
}

/**
 * `prefix` is what a page must prepend to reach the site root: '' at the root,
 * '../' for a document directory, '/' for 404.html, which is served for a URL
 * at any depth and therefore cannot use a relative one.
 */
function layout({ lang, title, description, canonical, prefix, bodyClass, main, headExtra = '' }) {
  const home = prefix || './';
  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="${escapeHtml(CSP)}">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <meta name="color-scheme" content="light dark">
    <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
    <meta name="theme-color" content="#0b0e1a" media="(prefers-color-scheme: dark)">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Iroha PDF">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${escapeHtml(canonical)}">
    <meta property="og:image" content="${escapeHtml(`${baseUrl}/apple-touch-icon.png`)}">
    <link rel="canonical" href="${escapeHtml(canonical)}">
    <link rel="icon" href="${prefix}icon.svg" type="image/svg+xml">
    <link rel="apple-touch-icon" href="${prefix}apple-touch-icon.png">
    <link rel="stylesheet" href="${prefix}site.css">${headExtra}
  </head>
  <body class="${bodyClass}">
    <a class="skip-link" href="#content">本文へスキップ / Skip to content</a>
    <header class="masthead">
      <a class="brand" href="${home}">
        <img class="brand-mark" src="${prefix}icon.svg" alt="" width="30" height="30">
        <span class="brand-text"><b>Iroha PDF</b><span>Documentation</span></span>
      </a>
      <nav class="masthead-nav" aria-label="Sections">
${SECTIONS.map(
  (section) =>
    `        <a href="${home}#${section.id}">${escapeHtml(section.titleEnglish)}</a>`,
).join('\n')}
        <a class="masthead-repo" href="${REPOSITORY_URL}" rel="noopener noreferrer">GitHub</a>
      </nav>
    </header>
    <main id="content">
${main}
    </main>
    <footer class="site-footer">
      <div class="footer-inner">
        <p>
          <b>Iroha PDF</b> — 軽量・ローカルファーストのPDFワークスペース。
          Apache-2.0. <a href="${REPOSITORY_URL}" rel="noopener noreferrer">${escapeHtml(REPOSITORY)}</a>
        </p>
        <p class="footer-note">
          このサイトはリポジトリ内のMarkdownから <code>site/build.mjs</code> が生成しています。
          外部への通信もランタイムスクリプトもありません。
          プライバシーポリシーの安定URLは
          <a href="${home}privacy/">${escapeHtml(`${baseUrl}/privacy/`)}</a> です。
        </p>
      </div>
    </footer>
  </body>
</html>
`;
}

function tableOfContents(headings) {
  const entries = headings.filter((heading) => heading.level === 2 || heading.level === 3);
  if (entries.length < 2) return '';
  const items = entries
    .map(
      (heading) =>
        `            <li class="toc-h${heading.level}"><a href="#${escapeHtml(heading.id)}">` +
        `${renderInline(heading.text)}</a></li>`,
    )
    .join('\n');
  return `        <details class="toc" open>
          <summary>目次 / On this page</summary>
          <nav aria-label="On this page">
            <ul>
${items}
            </ul>
          </nav>
        </details>
`;
}

/**
 * Rewrites a Markdown link so it keeps working once the documents are pages.
 * A `.md` target that this site publishes becomes the published directory; one
 * it does not publish becomes the file on GitHub, which is still a working link
 * rather than a 404. Anything else is passed through untouched.
 */
function makeResolver(document) {
  const fromDirectory = path.posix.dirname(document.source);
  return (target) => {
    if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#') || target.startsWith('//')) {
      return target;
    }
    const [rawPath, fragment = ''] = target.split('#');
    if (!rawPath.toLowerCase().endsWith('.md')) return target;

    const resolved = path.posix.normalize(path.posix.join(fromDirectory, rawPath));
    const suffix = fragment ? `#${fragment}` : '';
    const published = bySource.get(resolved);
    if (published) return `../${published.slug}/${suffix}`;
    return `${REPOSITORY_URL}/blob/main/${resolved}${suffix}`;
  };
}

function renderDocumentPage(document, markdown) {
  const resolveHref = makeResolver(document);
  const { html, title, headings } = renderMarkdown(markdown, { resolveHref });
  const heading = title ?? document.label;
  const lang = detectLanguage(markdown);
  const canonical = `${baseUrl}/${document.slug}/`;
  const section = SECTIONS.find((candidate) => candidate.id === document.section);
  const summaryText = document.summary.replace(/`/g, '');
  // A short document gets no contents list, and then it must not be laid out
  // around the gap where one would have been.
  const toc = tableOfContents(headings);

  const main = `      <nav class="crumbs" aria-label="Breadcrumb">
        <a href="../">Documentation</a>
        <span aria-hidden="true">/</span>
        <a href="../#${section.id}">${escapeHtml(section.titleEnglish)}</a>
      </nav>
      <div class="doc-layout${toc ? '' : ' no-toc'}">
${toc}        <article class="prose">
${html}
          <p class="source-note">
            この文書のソースは
            <a href="${REPOSITORY_URL}/blob/main/${document.source}" rel="noopener noreferrer"><code>${escapeHtml(document.source)}</code></a>
            です。サイトはmainへのpushごとに再生成されます。
          </p>
        </article>
      </div>
`;

  return layout({
    lang,
    title: `${heading} — Iroha PDF`,
    description: summaryText,
    canonical,
    prefix: '../',
    bodyClass: 'page-doc',
    main,
  });
}

function renderLanding(version) {
  const cards = SECTIONS.map((section) => {
    const documents = section.documents
      .map(
        (document) => `            <li>
              <a class="card" href="${document.slug}/">
                <span class="card-title">${escapeHtml(document.label)}${
                  document.stable ? '<span class="badge">安定URL</span>' : ''
                }</span>
                <span class="card-summary">${renderInline(document.summary)}</span>
                <span class="card-path">/${document.slug}/</span>
              </a>
            </li>`,
      )
      .join('\n');
    return `        <section class="doc-section" id="${section.id}">
          <header class="doc-section-head">
            <h2>${escapeHtml(section.title)}<span class="section-en">${escapeHtml(section.titleEnglish)}</span></h2>
            <p>${escapeHtml(section.blurb)}</p>
          </header>
          <ul class="card-grid">
${documents}
          </ul>
        </section>`;
  }).join('\n');

  const facts = FACTS.map(
    (fact) => `          <div class="fact">
            <dt>${escapeHtml(fact.term)}<span>${escapeHtml(fact.termEnglish)}</span></dt>
            <dd>${escapeHtml(fact.detail)}</dd>
          </div>`,
  ).join('\n');

  const main = `      <section class="hero">
        <div class="hero-inner">
          <img class="hero-mark" src="icon.svg" alt="Iroha PDF" width="96" height="96">
          <p class="eyebrow">${escapeHtml(HERO.eyebrow)}</p>
          <h1>Iroha PDF</h1>
          <p class="lead">${escapeHtml(HERO.lead)}</p>
          <p class="lead-en">${escapeHtml(HERO.leadEnglish)}</p>
          <p class="actions">
            <a class="button primary" href="${REPOSITORY_URL}/releases/latest" rel="noopener noreferrer">最新リリース / Latest release</a>
            <a class="button" href="${REPOSITORY_URL}" rel="noopener noreferrer">ソースコード / Source</a>
            <a class="button" href="privacy/">プライバシーポリシー</a>
          </p>
          <p class="version">
            このサイトの生成時点のリポジトリ宣言バージョンは <b>v${escapeHtml(version)}</b> です。
            署名済みネイティブパッケージはまだ添付されていません — <a href="release-gate/">Release gate</a> を参照してください。
          </p>
        </div>
      </section>
      <section class="facts" aria-label="Product facts">
        <dl class="facts-grid">
${facts}
        </dl>
      </section>
      <div class="sections">
${cards}
      </div>
`;

  return layout({
    lang: 'ja',
    title: 'Iroha PDF — Documentation',
    description: SITE_DESCRIPTION,
    canonical: `${baseUrl}/`,
    prefix: '',
    bodyClass: 'page-home',
    main,
  });
}

function renderNotFound() {
  const main = `      <section class="hero">
        <div class="hero-inner">
          <p class="eyebrow">404</p>
          <h1>ページが見つかりません</h1>
          <p class="lead">That page is not part of this documentation site.</p>
          <p class="actions"><a class="button primary" href="/">ドキュメント一覧へ / All documents</a></p>
        </div>
      </section>
`;
  return layout({
    lang: 'ja',
    title: 'Not found — Iroha PDF',
    description: SITE_DESCRIPTION,
    canonical: `${baseUrl}/404.html`,
    // Served for a URL at any depth, so its assets cannot be reached relatively.
    prefix: '/',
    bodyClass: 'page-home page-404',
    main,
  });
}

function renderSitemap() {
  const urls = ['', ...DOCUMENTS.map((document) => `${document.slug}/`)];
  const body = urls
    .map((url) => `  <url><loc>${escapeHtml(`${baseUrl}/${url}`)}</loc></url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

async function write(relativePath, contents) {
  const target = path.join(outDir, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
}

async function main() {
  const version = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version;

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  for (const document of DOCUMENTS) {
    const markdown = await readFile(path.join(root, document.source), 'utf8');
    await write(path.join(document.slug, 'index.html'), renderDocumentPage(document, markdown));
  }

  await write('index.html', renderLanding(version));
  await write('404.html', renderNotFound());
  await write('sitemap.xml', renderSitemap());
  await write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml\n`);
  // Belt and braces: Pages does not run Jekyll over an uploaded artifact, but a
  // future change of deployment method should not start eating files.
  await write('.nojekyll', '');

  // One source of truth for the mark. Both are existing, committed assets.
  await cp(path.join(root, 'assets/branding/iroha-icon.svg'), path.join(outDir, 'icon.svg'));
  await cp(path.join(root, 'apps/mobile/assets/images/icon.png'), path.join(outDir, 'apple-touch-icon.png'));
  await cp(path.join(root, 'site/assets/site.css'), path.join(outDir, 'site.css'));

  const where = path.relative(root, outDir);
  console.log(`Built ${DOCUMENTS.length + 2} pages into ${where.startsWith('..') ? outDir : where}`);
}

main().catch((error) => {
  console.error(error);
  exit(1);
});
