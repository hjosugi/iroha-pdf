/**
 * A Markdown renderer scoped to the syntax this repository's documents actually
 * use, so publishing the docs adds no dependency and no runtime script.
 *
 * The alternative was a static-site generator or a CDN-loaded renderer. Neither
 * is acceptable here: `apps/desktop/e2e/offline.spec.ts` and the CSP in
 * `tauri.conf.json` exist because this project refuses to fetch code it did not
 * ship, and the published site should not be the one place that rule lapses.
 * So the supported grammar is deliberately closed, and everything outside it is
 * emitted as literal text rather than guessed at:
 *
 *   ATX headings, fenced code, GFM tables, ordered/unordered/nested lists,
 *   GFM task-list items, thematic breaks, paragraphs, and the inline set
 *   `code`, **strong**, *emphasis*, [links](target) and bare http(s) URLs.
 *
 * Two omissions are on purpose. `_underscore_` emphasis is not supported
 * because the documents are full of identifiers like `PRIVACY_POLICY.md` and
 * `MANAGE_EXTERNAL_STORAGE`, and treating those as emphasis is a corruption
 * that is easy to miss in review. Raw HTML is not passed through either: every
 * `<` in the sources is either inside code (`operations-<device>.json`) or a
 * mistake, and escaping it is both safer and what the author meant.
 */

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const SAFE_SCHEME = /^(?:https?:|mailto:)/i;

/** Absolute targets are limited to schemes that cannot execute; relative ones pass through. */
function safeHref(href) {
  if (href === null || href === undefined) return null;
  const trimmed = String(href).trim();
  if (!trimmed) return null;
  if (HAS_SCHEME.test(trimmed) && !SAFE_SCHEME.test(trimmed)) return null;
  return trimmed;
}

export function isExternal(href) {
  return /^https?:/i.test(href);
}

/** Keeps CJK: these documents are bilingual and a romaji-only slug would drop whole headings. */
export function slugify(text) {
  const slug = text
    .toLowerCase()
    .replace(/`|\*|\[|\]|\(|\)/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'section';
}

const ESCAPABLE = '\\`*_[]()#|-.!>';

/**
 * `[text](target)`, with the bracket depth and one level of nested parentheses
 * tracked so a link label containing brackets does not end the label early.
 */
function matchLink(source, start) {
  let depth = 0;
  let index = start;
  for (; index < source.length; index += 1) {
    const character = source[index];
    if (character === '\\') {
      index += 1;
      continue;
    }
    if (character === '`') {
      const close = source.indexOf('`', index + 1);
      if (close === -1) return null;
      index = close;
      continue;
    }
    if (character === '[') depth += 1;
    else if (character === ']') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  if (depth !== 0 || source[index + 1] !== '(') return null;

  const label = source.slice(start + 1, index);
  let cursor = index + 2;
  let open = 1;
  for (; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    if (character === '(') open += 1;
    else if (character === ')') {
      open -= 1;
      if (open === 0) break;
    }
  }
  if (open !== 0) return null;
  return { label, target: source.slice(index + 2, cursor), end: cursor + 1 };
}

// Trailing punctuation is excluded so "see https://example.com." does not swallow the period.
const AUTOLINK = /^https?:\/\/[^\s<>`]*[^\s<>`.,;:!?)\]'"]/;

function anchor(href, inner) {
  const rel = isExternal(href) ? ' rel="noopener noreferrer"' : '';
  return `<a href="${escapeHtml(href)}"${rel}>${inner}</a>`;
}

/** Applied only to already-escaped plain text, never across a code span. */
function emphasise(escaped) {
  return escaped
    .replace(/\*\*(\S(?:[^*]*\S)?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(\S(?:[^*]*\S)?)\*/g, '<em>$1</em>');
}

export function renderInline(source, context = {}) {
  let html = '';
  let pending = '';
  let index = 0;

  const flush = () => {
    if (!pending) return;
    html += emphasise(escapeHtml(pending));
    pending = '';
  };

  while (index < source.length) {
    const character = source[index];

    if (character === '\\' && ESCAPABLE.includes(source[index + 1] ?? '')) {
      pending += source[index + 1];
      index += 2;
      continue;
    }

    if (character === '`') {
      let ticks = 0;
      while (source[index + ticks] === '`') ticks += 1;
      const fence = '`'.repeat(ticks);
      const close = source.indexOf(fence, index + ticks);
      if (close !== -1) {
        flush();
        html += `<code>${escapeHtml(source.slice(index + ticks, close))}</code>`;
        index = close + ticks;
        continue;
      }
    }

    if (character === '[') {
      const link = matchLink(source, index);
      if (link) {
        const resolved = context.resolveHref ? context.resolveHref(link.target) : link.target;
        const href = safeHref(resolved);
        if (href) {
          flush();
          html += anchor(href, renderInline(link.label, context));
          index = link.end;
          continue;
        }
      }
    }

    if (character === 'h' && (source.startsWith('http://', index) || source.startsWith('https://', index))) {
      const match = AUTOLINK.exec(source.slice(index));
      if (match) {
        flush();
        html += anchor(match[0], escapeHtml(match[0]));
        index += match[0].length;
        continue;
      }
    }

    pending += character;
    index += 1;
  }

  flush();
  return html;
}

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE = /^\s*(`{3,}|~{3,})\s*([^\s`]*)\s*$/;
const THEMATIC_BREAK = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const LIST_ITEM = /^(\s*)(?:([-*+])|(\d+)[.)])\s+(.*)$/;
const TASK_MARKER = /^\[([ xX])\]\s+/;
const CONTINUATION = /^\s+\S/;

function isTableDelimiter(line) {
  return line.includes('|') && /^\s*\|?(?:\s*:?-+:?\s*\|)*\s*:?-+:?\s*\|?\s*$/.test(line);
}

/** Splits a table row on unescaped pipes that are not inside a code span. */
function splitRow(line) {
  let body = line.trim();
  if (body.startsWith('|')) body = body.slice(1);
  if (body.endsWith('|') && !body.endsWith('\\|')) body = body.slice(0, -1);

  const cells = [];
  let cell = '';
  let inCode = false;
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (character === '\\' && body[index + 1] === '|') {
      cell += '|';
      index += 1;
      continue;
    }
    if (character === '`') inCode = !inCode;
    if (character === '|' && !inCode) {
      cells.push(cell.trim());
      cell = '';
      continue;
    }
    cell += character;
  }
  cells.push(cell.trim());
  return cells;
}

function alignments(delimiter) {
  return splitRow(delimiter).map((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return null;
  });
}

function alignAttribute(align) {
  return align ? ` class="align-${align}"` : '';
}

function buildTree(items) {
  const root = { children: [] };
  const stack = [{ indent: -1, node: root }];
  for (const item of items) {
    while (stack.length > 1 && item.indent <= stack[stack.length - 1].indent) stack.pop();
    const node = { item, children: [] };
    stack[stack.length - 1].node.children.push(node);
    stack.push({ indent: item.indent, node });
  }
  return root.children;
}

function renderNodes(nodes, context) {
  const html = [];
  let index = 0;
  while (index < nodes.length) {
    const ordered = nodes[index].item.ordered;
    const run = [];
    while (index < nodes.length && nodes[index].item.ordered === ordered) {
      run.push(nodes[index]);
      index += 1;
    }

    const tag = ordered ? 'ol' : 'ul';
    const isTaskList = run.every((node) => node.item.task !== null);
    const start = ordered && run[0].item.number !== 1 ? ` start="${run[0].item.number}"` : '';
    html.push(`<${tag}${isTaskList ? ' class="task-list"' : ''}${start}>`);

    for (const node of run) {
      const parts = [];
      if (node.item.task !== null) {
        parts.push(
          `<input type="checkbox" disabled${node.item.task ? ' checked' : ''}` +
            ` aria-label="${node.item.task ? 'done' : 'not done'}">`,
        );
      }
      parts.push(renderInline(node.item.text, context));
      if (node.children.length > 0) parts.push(renderNodes(node.children, context));
      html.push(`<li>${parts.join(' ')}</li>`);
    }

    html.push(`</${tag}>`);
  }
  return html.join('\n');
}

/**
 * @param {string} source Markdown text.
 * @param {{resolveHref?: (target: string) => string}} [context]
 * @returns {{html: string, title: string|null, headings: Array<{level: number, id: string, text: string}>}}
 */
export function renderMarkdown(source, context = {}) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  const headings = [];
  const usedIds = new Map();
  let title = null;
  let index = 0;

  const uniqueId = (text) => {
    const base = slugify(text);
    const seen = usedIds.get(base) ?? 0;
    usedIds.set(base, seen + 1);
    return seen === 0 ? base : `${base}-${seen}`;
  };

  const startsBlock = (line) =>
    !line.trim() ||
    HEADING.test(line) ||
    FENCE.test(line) ||
    THEMATIC_BREAK.test(line) ||
    LIST_ITEM.test(line);

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1][0];
      const language = fence[2];
      const body = [];
      index += 1;
      while (index < lines.length && !new RegExp(`^\\s*${marker}{${fence[1].length},}\\s*$`).test(lines[index])) {
        body.push(lines[index]);
        index += 1;
      }
      index += 1;
      const className = language ? ` class="language-${escapeHtml(language)}"` : '';
      html.push(`<pre><code${className}>${escapeHtml(body.join('\n'))}\n</code></pre>`);
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2];
      const id = uniqueId(text);
      const inner = renderInline(text, context);
      if (level === 1 && title === null) title = text;
      headings.push({ level, id, text });
      // No permalink on the title: the page's own URL already is that link.
      const permalink =
        level === 1
          ? ''
          : `<a class="heading-anchor" href="#${escapeHtml(id)}" aria-label="Link to this section">#</a>`;
      html.push(`<h${level} id="${escapeHtml(id)}">${inner}${permalink}</h${level}>`);
      index += 1;
      continue;
    }

    if (THEMATIC_BREAK.test(line)) {
      html.push('<hr>');
      index += 1;
      continue;
    }

    if (line.includes('|') && index + 1 < lines.length && isTableDelimiter(lines[index + 1])) {
      const header = splitRow(line);
      const align = alignments(lines[index + 1]);
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        rows.push(splitRow(lines[index]));
        index += 1;
      }
      const head = header
        .map((cell, column) => `<th${alignAttribute(align[column])}>${renderInline(cell, context)}</th>`)
        .join('');
      const body = rows
        .map(
          (row) =>
            `<tr>${header
              .map(
                (_, column) =>
                  `<td${alignAttribute(align[column])}>${renderInline(row[column] ?? '', context)}</td>`,
              )
              .join('')}</tr>`,
        )
        .join('\n');
      html.push(
        `<div class="table-scroll"><table>\n<thead><tr>${head}</tr></thead>\n<tbody>\n${body}\n</tbody>\n</table></div>`,
      );
      continue;
    }

    if (LIST_ITEM.test(line)) {
      const items = [];
      while (index < lines.length && lines[index].trim()) {
        const item = LIST_ITEM.exec(lines[index]);
        if (item) {
          const [, indent, bullet, number, rest] = item;
          const task = TASK_MARKER.exec(rest);
          items.push({
            indent: indent.length,
            ordered: bullet === undefined,
            number: number === undefined ? null : Number(number),
            task: task ? task[1].toLowerCase() === 'x' : null,
            text: task ? rest.slice(task[0].length) : rest,
          });
          index += 1;
          continue;
        }
        // A wrapped line under the previous bullet, not a new block.
        if (items.length > 0 && CONTINUATION.test(lines[index])) {
          items[items.length - 1].text += `\n${lines[index].trim()}`;
          index += 1;
          continue;
        }
        break;
      }
      html.push(renderNodes(buildTree(items), context));
      continue;
    }

    const paragraph = [];
    while (index < lines.length && !startsBlock(lines[index])) {
      if (lines[index].includes('|') && index + 1 < lines.length && isTableDelimiter(lines[index + 1])) break;
      paragraph.push(lines[index]);
      index += 1;
    }
    html.push(`<p>${renderInline(paragraph.join('\n'), context)}</p>`);
  }

  return { html: html.join('\n'), title, headings };
}
