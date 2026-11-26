/**
 * The HTML of every page, as functions of data.
 *
 * Nothing in this file reads a file, knows where the output is written, or
 * decides what the site contains: `catalog.mjs` owns the contents, `build.mjs`
 * owns the file system, and this module is only what a page looks like. That
 * split is what lets the page chrome change without touching the build, and the
 * build be read without scrolling past markup.
 *
 * Every page is static: no script, no off-origin request, and a CSP that
 * permits nothing but its own origin, so "this site fetches nothing" is
 * enforced by the page rather than asserted in a review.
 */

import {
  DOCUMENTS,
  FACTS,
  HERO,
  QUICK_LINKS,
  REPOSITORY,
  REPOSITORY_URL,
  SECTIONS,
} from './catalog.mjs';
import { escapeHtml, isExternal, renderInline } from './markdown.mjs';

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

/**
 * Page chrome in the two languages the documents are written in. The `nav*`
 * labels are the masthead's and are kept short enough to share one line with
 * the brand on a phone.
 */
const STRINGS = {
  ja: {
    documents: 'ドキュメント',
    navDocuments: 'ドキュメント',
    navRelease: '公開手順',
    navDownload: 'ダウンロード',
    contents: '目次',
    otherDocuments: 'ほかの文書',
    previous: '前の文書',
    next: '次の文書',
  },
  en: {
    documents: 'Documentation',
    navDocuments: 'Docs',
    navRelease: 'Releasing',
    navDownload: 'Download',
    contents: 'On this page',
    otherDocuments: 'Other documents',
    previous: 'Previous',
    next: 'Next',
  },
};

function sectionTitle(section, lang) {
  return lang === 'en' ? section.titleEnglish : section.title;
}

const bySlug = new Map(DOCUMENTS.map((document) => [document.slug, document]));

/** A slug named in code or in the catalogue must exist; a typo should not ship as a 404. */
function publishedPath(slug) {
  if (!bySlug.has(slug)) throw new Error(`no published document has the slug "${slug}"`);
  return `${slug}/`;
}

/** `<a>` attributes for a link that may leave the site. */
function linkAttributes(href, className = '') {
  const classes = [className, isExternal(href) ? 'is-external' : ''].filter(Boolean).join(' ');
  return (
    (classes ? ` class="${classes}"` : '')
    + ` href="${escapeHtml(href)}"`
    + (isExternal(href) ? ' rel="noopener noreferrer"' : '')
  );
}

/** Text that sits inside an anchor: Markdown styling yes, a nested link no. */
function inlineLabel(markdown) {
  return renderInline(markdown, { linkless: true });
}

/**
 * @param {object} site
 * @param {string} site.baseUrl Absolute origin and path the site is served from, no trailing slash.
 * @param {string} site.version The version `package.json` declares.
 */
export function createTemplates({ baseUrl, version }) {
  // 404.html is served for a URL at any depth, so it can reach nothing
  // relatively, and on a project site the root of the origin is somebody else's
  // page. It has to name the directory this site actually lives in.
  const basePath = `${new URL(`${baseUrl}/`).pathname.replace(/\/+$/, '')}/`;

  /**
   * `prefix` is what a page must prepend to reach the site root: '' at the
   * root, '../' for a document directory, `basePath` for 404.html.
   */
  function layout({ lang, title, description, canonical, prefix, bodyClass, currentSlug, main }) {
    const home = prefix || './';
    const strings = STRINGS[lang];
    const navigation = [
      { label: strings.navDocuments, href: `${home}#documents` },
      { label: strings.navRelease, href: `${prefix}${publishedPath('release')}`, slug: 'release' },
      { label: strings.navDownload, href: `${REPOSITORY_URL}/releases/latest` },
      { label: 'GitHub', href: REPOSITORY_URL, className: 'masthead-repo' },
    ]
      .map(
        (item) =>
          `          <a${linkAttributes(item.href, item.className)}${
            item.slug && item.slug === currentSlug ? ' aria-current="page"' : ''
          }>${escapeHtml(item.label)}</a>`,
      )
      .join('\n');

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
    <link rel="stylesheet" href="${prefix}site.css">
  </head>
  <body class="${bodyClass}">
    <a class="skip-link" href="#content">本文へスキップ / Skip to content</a>
    <header class="masthead">
      <div class="masthead-inner">
        <a class="brand" href="${home}">
          <img class="brand-mark" src="${prefix}icon.svg" alt="" width="28" height="28">
          <span class="brand-text"><b>Iroha PDF</b><span>Docs</span></span>
        </a>
        <nav class="masthead-nav" aria-label="Site">
${navigation}
        </nav>
      </div>
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
          <a href="${prefix}${publishedPath('privacy')}">${escapeHtml(`${baseUrl}/privacy/`)}</a> です。
        </p>
      </div>
    </footer>
  </body>
</html>
`;
  }

  /** Every document, grouped as on the landing page, with the open one marked. */
  function documentNavigation(current, lang) {
    const groups = SECTIONS.map((section) => {
      const items = section.documents
        .map(
          (document) =>
            `              <li><a href="../${document.slug}/"${
              document.slug === current.slug ? ' aria-current="page"' : ''
            }>${escapeHtml(document.label)}</a></li>`,
        )
        .join('\n');
      return `          <div class="doc-nav-group">
            <p class="doc-nav-heading" id="doc-nav-${section.id}">${escapeHtml(sectionTitle(section, lang))}</p>
            <ul aria-labelledby="doc-nav-${section.id}">
${items}
            </ul>
          </div>`;
    }).join('\n');

    return `        <nav class="doc-nav" id="doc-nav" aria-label="Documents">
          <p class="doc-nav-title">${escapeHtml(STRINGS[lang].otherDocuments)}</p>
${groups}
        </nav>`;
  }

  function contentsList(headings) {
    const items = headings
      .map(
        (heading) =>
          `              <li class="toc-h${heading.level}"><a href="#${escapeHtml(heading.id)}">` +
          `${inlineLabel(heading.text)}</a></li>`,
      )
      .join('\n');
    return `            <ul>
${items}
            </ul>`;
  }

  /**
   * Puts the collapsed contents list under the document's title rather than
   * above it, so the first thing on the page is what the page is. A document
   * with no title heading gets the list first instead.
   */
  function withContentsAfterTitle(html, inlineContents) {
    const end = html.indexOf('</h1>');
    if (end === -1) return `${inlineContents}${html}`;
    const cut = end + '</h1>'.length;
    return `${html.slice(0, cut)}\n${inlineContents}${html.slice(cut)}`;
  }

  /**
   * The contents list is emitted twice and CSS shows one of them. A wide screen
   * has room for it beside the text, always open; a narrow one would otherwise
   * spend its whole first screen on it, so there it is a closed disclosure.
   * `<details>` cannot be made open-by-default at one width only without a
   * script, and this site ships none.
   */
  function contents(headings, strings) {
    const entries = headings.filter((heading) => heading.level === 2 || heading.level === 3);
    if (entries.length < 2) return { inline: '', rail: '' };
    const list = contentsList(entries);
    return {
      inline: `          <details class="toc toc-inline">
            <summary>${escapeHtml(strings.contents)}</summary>
            <nav aria-label="${escapeHtml(strings.contents)}">
${list}
            </nav>
          </details>
`,
      rail: `        <aside class="toc toc-rail">
          <nav aria-label="${escapeHtml(strings.contents)}">
            <p class="toc-title">${escapeHtml(strings.contents)}</p>
${list}
          </nav>
        </aside>
`,
    };
  }

  /** The documents before and after this one, in catalogue order. */
  function pager(current, strings) {
    const index = DOCUMENTS.findIndex((document) => document.slug === current.slug);
    const link = (document, className, caption) =>
      document
        ? `            <a class="${className}" href="../${document.slug}/">`
          + `<span>${escapeHtml(caption)}</span><b>${escapeHtml(document.label)}</b></a>`
        : '';
    const links = [
      link(DOCUMENTS[index - 1], 'pager-previous', strings.previous),
      link(DOCUMENTS[index + 1], 'pager-next', strings.next),
    ].filter(Boolean);
    return `          <nav class="pager" aria-label="${escapeHtml(strings.otherDocuments)}">
${links.join('\n')}
          </nav>`;
  }

  /**
   * @param {object} document A catalogue entry.
   * @param {object} rendered
   * @param {string} rendered.html The document body.
   * @param {string|null} rendered.title Its first heading.
   * @param {Array<{level: number, id: string, text: string}>} rendered.headings
   * @param {'ja'|'en'} rendered.lang
   */
  function documentPage(document, { html, title, headings, lang }) {
    const strings = STRINGS[lang];
    const section = SECTIONS.find((candidate) => candidate.id === document.section);
    const toc = contents(headings, strings);
    const sourceLink =
      `<a href="${REPOSITORY_URL}/blob/main/${document.source}" rel="noopener noreferrer">`
      + `<code>${escapeHtml(document.source)}</code></a>`;
    const sourceNote =
      lang === 'en'
        ? `This page is generated from ${sourceLink}. The site is rebuilt after every push to main.`
        : `この文書のソースは ${sourceLink} です。サイトはmainへのpushごとに再生成されます。`;

    const main = `      <div class="doc-shell">
        <div class="doc-main">
          <nav class="crumbs" aria-label="Breadcrumb">
            <a href="../">${escapeHtml(strings.documents)}</a>
            <span aria-hidden="true">/</span>
            <a href="../#${section.id}">${escapeHtml(sectionTitle(section, lang))}</a>
            <a class="crumbs-jump" href="#doc-nav">${escapeHtml(strings.otherDocuments)}</a>
          </nav>
          <article class="prose">
${withContentsAfterTitle(html, toc.inline)}
          </article>
${pager(document, strings)}
          <p class="source-note">${sourceNote}</p>
        </div>
${toc.rail}${documentNavigation(document, lang)}
      </div>
`;

    return layout({
      lang,
      title: `${title ?? document.label} — Iroha PDF`,
      // The summary is Markdown; a meta description is not.
      description: document.summary.replace(/`/g, ''),
      canonical: `${baseUrl}/${document.slug}/`,
      prefix: '../',
      bodyClass: 'page-doc',
      currentSlug: document.slug,
      main,
    });
  }

  function landingPage() {
    const quickLinks = QUICK_LINKS.map((link) => {
      const href = link.slug ? publishedPath(link.slug) : link.href;
      return `              <li>
                <a${linkAttributes(href, 'quick-link')}>
                  <span class="quick-label">${escapeHtml(link.label)}</span>
                  <span class="quick-detail">${escapeHtml(link.detail)}</span>
                </a>
              </li>`;
    }).join('\n');

    const facts = FACTS.map(
      (fact) => `          <div class="fact">
            <dt>${escapeHtml(fact.term)}<span>${escapeHtml(fact.termEnglish)}</span></dt>
            <dd>${escapeHtml(fact.detail)}</dd>
          </div>`,
    ).join('\n');

    const sections = SECTIONS.map((section) => {
      const cards = section.documents
        .map(
          (document) => `            <li>
              <a class="card" href="${document.slug}/">
                <span class="card-title">${escapeHtml(document.label)}${
                  document.stable ? '<span class="badge">安定URL</span>' : ''
                }</span>
                <span class="card-summary">${inlineLabel(document.summary)}</span>
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
${cards}
          </ul>
        </section>`;
    }).join('\n');

    const main = `      <section class="hero">
        <div class="hero-inner">
          <div class="hero-copy">
            <p class="eyebrow">${escapeHtml(HERO.eyebrow)}</p>
            <h1><img class="hero-mark" src="icon.svg" alt="" width="56" height="56">Iroha PDF</h1>
            <p class="lead">${escapeHtml(HERO.lead)}</p>
            <p class="lead-en" lang="en">${escapeHtml(HERO.leadEnglish)}</p>
            <p class="actions">
              <a class="button primary" href="${REPOSITORY_URL}/releases/latest" rel="noopener noreferrer">最新リリース / Latest release</a>
              <a class="button" href="${REPOSITORY_URL}" rel="noopener noreferrer">ソースコード / Source</a>
            </p>
            <p class="version">
              リポジトリの宣言バージョンは <b>v${escapeHtml(version)}</b> です。
              デスクトップ版は未署名のまま配布しており、正式リリースの可否は
              <a href="${publishedPath('release-gate')}">Release gate</a> が決めます。
            </p>
          </div>
          <nav class="quick" aria-labelledby="quick-title">
            <h2 id="quick-title">すぐ飛べるリンク<span>Quick links</span></h2>
            <ul class="quick-grid">
${quickLinks}
            </ul>
          </nav>
        </div>
      </section>
      <section class="facts" aria-label="Product facts">
        <dl class="facts-grid">
${facts}
        </dl>
      </section>
      <div class="sections" id="documents">
${sections}
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

  function notFoundPage() {
    const main = `      <section class="hero">
        <div class="hero-inner">
          <div class="hero-copy">
            <p class="eyebrow">404</p>
            <h1>ページが見つかりません</h1>
            <p class="lead" lang="en">That page is not part of this documentation site.</p>
            <p class="actions"><a class="button primary" href="${basePath}">ドキュメント一覧へ / All documents</a></p>
          </div>
        </div>
      </section>
`;
    return layout({
      lang: 'ja',
      title: 'Not found — Iroha PDF',
      description: SITE_DESCRIPTION,
      canonical: `${baseUrl}/404.html`,
      prefix: basePath,
      bodyClass: 'page-home page-404',
      main,
    });
  }

  function sitemap() {
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

  function robots() {
    return `User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml\n`;
  }

  return { documentPage, landingPage, notFoundPage, sitemap, robots };
}
