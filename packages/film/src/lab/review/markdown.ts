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

const tableRow = (line: string): string =>
  `<tr>${line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => `<td>${inline(cell.trim())}</td>`)
    .join('')}</tr>`;

/** The HTML being written: the lists and the table open, and the paragraph
 *  or list item still taking lines, its words gathered. */
const writer = () => {
  const out: Array<string> = [];
  let depth = 0;
  let table = false;
  let tag: 'p' | 'li' | 'none' = 'none';
  let words: Array<string> = [];
  const flush = () => {
    if (tag !== 'none') out.push(`<${tag}>${inline(words.join(' '))}</${tag}>`);
    tag = 'none';
    words = [];
  };
  const closeLists = (to: number) => {
    while (depth > to) {
      out.push('</ul>');
      depth -= 1;
    }
  };
  const closeTable = () => {
    if (table) out.push('</table>');
    table = false;
  };
  /** Ends the block open, and the lists past `to` deep. */
  const end = (to: number) => {
    flush();
    closeLists(to);
  };
  return {
    row: (line: string) => {
      end(0);
      if (!table) out.push('<table>');
      table = true;
      out.push(tableRow(line));
    },
    item: (indent: string, text: string) => {
      closeTable();
      flush();
      const want = Math.floor(indent.length / 2) + 1;
      for (; depth < want; depth += 1) out.push('<ul>');
      closeLists(want);
      tag = 'li';
      words = [text];
    },
    heading: (level: number, text: string) => {
      closeTable();
      end(0);
      out.push(`<h${level}>${inline(text)}</h${level}>`);
    },
    blank: () => {
      closeTable();
      end(0);
    },
    /** A line of words: it goes on in the paragraph or item open, else opens one. */
    words: (line: string) => {
      closeTable();
      if (tag === 'none') tag = 'p';
      words.push(line.trim());
    },
    done: () => {
      end(0);
      closeTable();
      return out.join('');
    },
  };
};

/** Markdown as HTML (escaped throughout). Lines that follow one another make
 *  one paragraph, and a line under a list item (indented or not) goes on in
 *  that item, as Markdown reads them: a blank line, a heading, a list item or
 *  a table row ends either. */
export const markdownHtml = (text: string): string => {
  const html = writer();
  for (const line of text.split('\n')) {
    if (TABLE_ROW.test(line)) {
      if (!TABLE_RULE.test(line)) html.row(line);
      continue;
    }
    const item = Option.fromNullishOr(LIST_ITEM.exec(line));
    const heading = Option.fromNullishOr(HEADING.exec(line));
    if (Option.isSome(item)) html.item(String(item.value[1]), String(item.value[2]));
    else if (Option.isSome(heading))
      html.heading(String(heading.value[1]).length, String(heading.value[2]));
    else if (line.trim() === '') html.blank();
    else html.words(line);
  }
  return html.done();
};
