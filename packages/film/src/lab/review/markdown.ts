// A variant's notes and a folder's blurb and docs, markdown read as the
// review shows it: headings, paragraphs, nested lists, tables, **bold**, *italic* and
// `code`. Every character of the text is escaped before any tag is added, so
// a doc can never put its own HTML (or a script) into the page; links stay
// text.

import { Option } from 'effect';

/** `text` safe to put in HTML, attributes included. */
export const escapeHtml = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

/** One line's inline marks, on its escaped text. */
const inline = (text: string): string =>
  escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(^|\W)\*(\S.*?)\*(?=\W|$)/g, '$1<i>$2</i>')
    .replace(/`(.+?)`/g, '<code>$1</code>');

const TABLE_ROW = /^\s*\|/;
const TABLE_RULE = /^\s*\|[\s:|-]+\|\s*$/;
const LIST_ITEM = /^(\s*)(?:[-*]|\d+\.) (.*)$/;
const HEADING = /^(#{1,4}) (.*)$/;

/** Markdown as HTML (escaped throughout). */
export const markdownHtml = (text: string): string => {
  const out: Array<string> = [];
  let depth = 0;
  let table = false;
  const closeLists = (to: number) => {
    while (depth > to) {
      out.push('</ul>');
      depth -= 1;
    }
  };
  const closeTable = () => {
    if (!table) return;
    out.push('</table>');
    table = false;
  };
  for (const line of text.split('\n')) {
    if (TABLE_ROW.test(line)) {
      if (TABLE_RULE.test(line)) continue;
      closeLists(0);
      if (!table) out.push('<table>');
      table = true;
      const cells = line
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((cell) => `<td>${inline(cell.trim())}</td>`);
      out.push(`<tr>${cells.join('')}</tr>`);
      continue;
    }
    closeTable();
    const item = Option.fromNullishOr(LIST_ITEM.exec(line));
    if (Option.isSome(item)) {
      const want = Math.floor(String(item.value[1]).length / 2) + 1;
      while (depth < want) {
        out.push('<ul>');
        depth += 1;
      }
      closeLists(want);
      out.push(`<li>${inline(String(item.value[2]))}</li>`);
      continue;
    }
    closeLists(0);
    const heading = Option.fromNullishOr(HEADING.exec(line));
    if (Option.isSome(heading)) {
      const level = String(heading.value[1]).length;
      out.push(`<h${level}>${inline(String(heading.value[2]))}</h${level}>`);
      continue;
    }
    if (line.trim() !== '') out.push(`<p>${inline(line)}</p>`);
  }
  closeLists(0);
  closeTable();
  return out.join('');
};
