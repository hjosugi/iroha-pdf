#!/usr/bin/env node
/**
 * Builds the GitHub Pages documentation site from the Markdown already in this
 * repository. No generator, no theme, no runtime script, no off-origin request:
 * the output is static HTML, one stylesheet, and two icons copied from
 * `assets/branding/`.
 *
 *   node site/build.mjs [--out <dir>]
 *
 * `SITE_BASE_URL` sets the absolute origin used for canonical links,
 * sitemap.xml and the 404 page; the workflow passes the value
 * `actions/configure-pages` resolves. Everything else a page links to is
 * relative, so the output also works from a subdirectory or a local static
 * server without a rebuild.
 *
 * This file is the part that touches the file system. What the site contains
 * is `catalog.mjs`, what a page looks like is `templates.mjs`, how Markdown
 * becomes HTML is `markdown.mjs`, and where a link ends up is `links.mjs`.
 */

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { argv, env, exit } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BASE_URL, DOCUMENTS, REPOSITORY_URL } from './catalog.mjs';
import { createLinkResolver } from './links.mjs';
import { renderMarkdown } from './markdown.mjs';
import { createTemplates } from './templates.mjs';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));

/** Files copied through unchanged. One source of truth for the mark: all are committed assets. */
const STATIC_FILES = [
  ['assets/branding/iroha-icon.svg', 'icon.svg'],
  ['apps/mobile/assets/images/icon.png', 'apple-touch-icon.png'],
  ['site/assets/site.css', 'site.css'],
];

/** Picks the document element language from the text itself; these docs are bilingual. */
function detectLanguage(text) {
  const cjk = (text.match(/[぀-ヿ㐀-鿿]/gu) ?? []).length;
  const latin = (text.match(/[A-Za-z]/gu) ?? []).length;
  return cjk * 6 > latin ? 'ja' : 'en';
}

/**
 * @param {object} options
 * @param {string} options.outDir Emptied, then filled.
 * @param {string} options.baseUrl Absolute URL the site is served from.
 * @returns {Promise<number>} How many pages were written.
 */
export async function buildSite({ outDir, baseUrl }) {
  const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const templates = createTemplates({ baseUrl: baseUrl.replace(/\/+$/, ''), version });
  const resolverFor = createLinkResolver({ root, documents: DOCUMENTS, repositoryUrl: REPOSITORY_URL });
  const issueUrl = (number) => `${REPOSITORY_URL}/issues/${number}`;

  const pages = new Map([
    ['index.html', templates.landingPage()],
    ['404.html', templates.notFoundPage()],
  ]);
  for (const document of DOCUMENTS) {
    const markdown = await readFile(path.join(root, document.source), 'utf8');
    const rendered = renderMarkdown(markdown, { resolveHref: resolverFor(document), issueUrl });
    pages.set(
      `${document.slug}/index.html`,
      templates.documentPage(document, { ...rendered, lang: detectLanguage(markdown) }),
    );
  }

  const files = new Map([
    ...pages,
    ['sitemap.xml', templates.sitemap()],
    ['robots.txt', templates.robots()],
    // Belt and braces: Pages does not run Jekyll over an uploaded artifact, but
    // a future change of deployment method should not start eating files.
    ['.nojekyll', ''],
  ]);

  // Rendered completely before the first write, so a document that fails to
  // render leaves the previous output in place instead of half a site.
  await rm(outDir, { recursive: true, force: true });
  for (const [relativePath, contents] of files) {
    const target = path.join(outDir, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
  for (const [source, target] of STATIC_FILES) {
    await cp(path.join(root, source), path.join(outDir, target));
  }

  return pages.size;
}

async function main() {
  const outIndex = argv.indexOf('--out');
  const outDir = path.resolve(outIndex === -1 ? path.join(root, 'site/dist') : argv[outIndex + 1]);
  const pageCount = await buildSite({ outDir, baseUrl: env.SITE_BASE_URL || DEFAULT_BASE_URL });

  const where = path.relative(root, outDir);
  console.log(`Built ${pageCount} pages into ${where.startsWith('..') ? outDir : where}`);
}

if (argv[1] && path.resolve(argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    exit(1);
  });
}
