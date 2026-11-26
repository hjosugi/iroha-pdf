/**
 * Where a link written in a Markdown file points once that file is a page.
 *
 * In the repository a document links to its neighbours by path, and GitHub
 * resolves the path. On the site the same text has to become one of three
 * things, and picking the wrong one is a 404 that no build step would notice:
 *
 *  - another published document  → that document's directory on this site;
 *  - any other file or directory → its page on GitHub, which is still a working
 *    link rather than a dead relative one;
 *  - nothing at all              → an error, here, while it is cheap to fix.
 *
 * The last case is the reason this module reads the file system. A link to a
 * file that was since renamed still looks fine in review; failing the build is
 * the only place it gets noticed before a reader does.
 */

import { statSync } from 'node:fs';
import path from 'node:path';

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** Scheme-qualified, protocol-relative and same-page targets already mean what they say. */
function isSelfDescribing(target) {
  return !target || HAS_SCHEME.test(target) || target.startsWith('#') || target.startsWith('//');
}

/**
 * @param {object} options
 * @param {string} options.root Absolute path of the repository checkout.
 * @param {Array<{source: string, slug: string}>} options.documents The published documents.
 * @param {string} options.repositoryUrl `https://github.com/<owner>/<name>`.
 * @returns {(document: {source: string}) => (target: string) => string}
 */
export function createLinkResolver({ root, documents, repositoryUrl }) {
  const bySource = new Map(documents.map((document) => [document.source, document]));

  return (document) => {
    const fromDirectory = path.posix.dirname(document.source);

    return (target) => {
      if (isSelfDescribing(target)) return target;

      const [rawPath, fragment = ''] = target.split('#');
      const suffix = fragment ? `#${fragment}` : '';
      const resolved = path.posix
        .normalize(path.posix.join(fromDirectory, rawPath))
        .replace(/\/+$/, '');

      const published = bySource.get(resolved);
      if (published) return `../${published.slug}/${suffix}`;

      const entry = resolved.startsWith('..')
        ? undefined
        : statSync(path.join(root, resolved), { throwIfNoEntry: false });
      if (!entry) {
        throw new Error(
          `${document.source} links to "${target}", which is not a file in this repository`
            + ` (looked for ${resolved}). Fix the path, or write the full URL if it is meant`
            + ' to leave the repository.',
        );
      }
      const view = entry.isDirectory() ? 'tree' : 'blob';
      return `${repositoryUrl}/${view}/main/${resolved}${suffix}`;
    };
  };
}
