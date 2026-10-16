// A variant's notes and a folder's blurb and docs, markdown read as the
// review shows it: headings, paragraphs, nested and numbered lists, tables,
// fenced and indented code, quotes, **bold**, *italic* and `code`. Every
// character of the text is escaped before any tag is added, so a doc can
// never put its own HTML (or a script) into the page; links stay text.

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
const LIST_ITEM = /^(\s*)([-*]|\d+\.) (.*)$/;
const HEADING = /^(#{1,4}) (.*)$/;
/** A fence's opening: three or more backticks or tildes, at most three spaces in. */
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
/** A line of indented code: four spaces or a tab in, the rest its code. */
const INDENTED = /^(?: {4}|\t)(.*)$/;
/** A quote's line: its marker (at most three spaces in, a space after it dropped), the rest its words. */
const QUOTE = /^ {0,3}> ?(.*)$/;

const tableRow = (line: string): string =>
  `<tr>${line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => `<td>${inline(cell.trim())}</td>`)
    .join('')}</tr>`;

type List = 'ul' | 'ol';

/** A list item's list: a number's is numbered. */
const listOf = (marker: string): List => {
  if (/^\d/.test(marker)) return 'ol';
  return 'ul';
};

/** A list's opening tag: a numbered one that does not start at 1 says where it does. */
const opening = (list: List, marker: string): string => {
  const from = Number.parseInt(marker, 10);
  if (list === 'ol' && from !== 1) return `<ol start="${from}">`;
  return `<${list}>`;
};

/** Code as it stands, every line kept. */
const pre = (lines: ReadonlyArray<string>): string =>
  `<pre><code>${escapeHtml(lines.join('\n'))}</code></pre>`;

/** Whether `line` starts a block of its own, so it cannot go on in a quote's last paragraph. */
const startsBlock = (line: string): boolean =>
  [TABLE_ROW, LIST_ITEM, HEADING, FENCE, QUOTE].some((starts) => starts.test(line));

/** The HTML being written: the lists and the table open, and the paragraph
 *  or list item still taking lines, its words gathered. Each list open has
 *  its last item open too, so a list under it is written inside it. */
const writer = () => {
  const out: Array<string> = [];
  const lists: Array<List> = [];
  let table = false;
  let tag: 'p' | 'li' | 'none' = 'none';
  let words: Array<string> = [];
  // A rest that ended a list: the indented line after it is no code.
  let afterList = false;
  const flush = () => {
    if (tag === 'p') out.push(`<p>${inline(words.join(' '))}</p>`);
    if (tag === 'li') out.push(inline(words.join(' ')));
    tag = 'none';
    words = [];
  };
  const closeLists = (to: number) => {
    for (const list of lists.splice(to).reverse()) out.push(`</li></${list}>`);
  };
  const closeTable = () => {
    if (table) out.push('</table>');
    table = false;
  };
  /** Ends every block open: the paragraph or item, the lists and the table. */
  const end = () => {
    flush();
    closeLists(0);
    closeTable();
    afterList = false;
  };
  return {
    end,
    /** Whether an indented line here is code: nothing open, nor a list just ended, for it to go on in. */
    codeMay: () => tag === 'none' && lists.length === 0 && table === false && !afterList,
    row: (line: string) => {
      flush();
      closeLists(0);
      afterList = false;
      if (!table) out.push('<table>');
      table = true;
      out.push(tableRow(line));
    },
    item: (indent: string, marker: string, text: string) => {
      closeTable();
      flush();
      afterList = false;
      const list = listOf(marker);
      // An item nests one list deeper at most than the one open.
      const want = Math.min(Math.floor(indent.length / 2) + 1, lists.length + 1);
      closeLists(want);
      if (lists.length === want && lists[want - 1] !== list) closeLists(want - 1);
      if (lists.length === want) out.push('</li><li>');
      else {
        out.push(opening(list, marker), '<li>');
        lists.push(list);
      }
      tag = 'li';
      words = [text];
    },
    heading: (level: number, text: string) => {
      end();
      out.push(`<h${level}>${inline(text)}</h${level}>`);
    },
    blank: () => {
      const listed = lists.length > 0 || afterList;
      end();
      afterList = listed;
    },
    /** A line of words: it goes on in the paragraph or item open, else opens one. */
    words: (line: string) => {
      closeTable();
      afterList = false;
      if (tag === 'none') tag = 'p';
      words.push(line.trim());
    },
    /** A block written whole (code, a quote): it ends what is open first. */
    block: (html: string) => {
      end();
      out.push(html);
    },
    done: () => {
      end();
      return out.join('');
    },
  };
};

type Writer = ReturnType<typeof writer>;

/** What runs on over the lines to come: a fence's code, indented code, or a quote's lines. */
type Held =
  | { readonly _tag: 'None' }
  | { readonly _tag: 'Fence'; readonly marker: string; readonly lines: Array<string> }
  | { readonly _tag: 'Code'; readonly lines: Array<string>; blanks: number }
  | { readonly _tag: 'Quote'; readonly lines: Array<string> };

const NONE: Held = { _tag: 'None' };

/** Whether `line` closes the fence opened by `marker`: its character, as many or more, and nothing else. */
const closes = (marker: string, line: string): boolean => {
  const fence = Option.fromNullishOr(FENCE.exec(line));
  return Option.exists(
    fence,
    (f) => String(f[1]).startsWith(marker) && line.trim().replaceAll(marker.charAt(0), '') === '',
  );
};

/** A line of words or a list item, a heading, a table row or a rest, in the flow. */
const flowLine = (html: Writer, line: string) => {
  if (TABLE_ROW.test(line)) {
    if (!TABLE_RULE.test(line)) html.row(line);
    return;
  }
  const item = Option.fromNullishOr(LIST_ITEM.exec(line));
  const heading = Option.fromNullishOr(HEADING.exec(line));
  if (Option.isSome(item))
    html.item(String(item.value[1]), String(item.value[2]), String(item.value[3]));
  else if (Option.isSome(heading))
    html.heading(String(heading.value[1]).length, String(heading.value[2]));
  else if (line.trim() === '') html.blank();
  else html.words(line);
};

/** The lines read in turn: a fence, indented code and a quote held until they end. */
const reader = (html: Writer) => {
  let held: Held = NONE;
  const release = () => {
    if (held._tag === 'Fence') html.block(pre(held.lines));
    if (held._tag === 'Code') html.block(pre(held.lines));
    if (held._tag === 'Quote')
      html.block(`<blockquote>${markdownHtml(held.lines.join('\n'))}</blockquote>`);
    held = NONE;
  };
  /** A line in a fence: its code, or its close. */
  const fenced = (fence: Extract<Held, { _tag: 'Fence' }>, line: string) => {
    if (closes(fence.marker, line)) release();
    else fence.lines.push(line);
  };
  /** A line after indented code: more of it (rests in it kept once code follows), or its end. */
  const coded = (code: Extract<Held, { _tag: 'Code' }>, line: string): boolean => {
    const more = Option.fromNullishOr(INDENTED.exec(line));
    if (Option.isSome(more)) {
      code.lines.push(...Array.from({ length: code.blanks }, () => ''), String(more.value[1]));
      code.blanks = 0;
      return true;
    }
    if (line.trim() === '') {
      code.blanks += 1;
      return true;
    }
    release();
    return false;
  };
  /** A line after a quote's: more of it (its marker, or words going on in its last paragraph), or its end. */
  const quoted = (quote: Extract<Held, { _tag: 'Quote' }>, line: string): boolean => {
    const more = Option.fromNullishOr(QUOTE.exec(line));
    const last = quote.lines.at(-1) ?? '';
    if (Option.isSome(more)) quote.lines.push(String(more.value[1]));
    else if (line.trim() !== '' && last.trim() !== '' && !startsBlock(line)) quote.lines.push(line);
    else {
      release();
      return line.trim() === '';
    }
    return true;
  };
  /** A line nothing holds: it may open a fence, a quote or code, else it is the flow's. */
  const opens = (line: string) => {
    const fence = Option.fromNullishOr(FENCE.exec(line));
    const quote = Option.fromNullishOr(QUOTE.exec(line));
    const code = Option.filter(Option.fromNullishOr(INDENTED.exec(line)), () => html.codeMay());
    if (Option.isSome(fence)) {
      html.end();
      held = { _tag: 'Fence', marker: String(fence.value[1]), lines: [] };
    } else if (Option.isSome(quote)) {
      html.end();
      held = { _tag: 'Quote', lines: [String(quote.value[1])] };
    } else if (Option.isSome(code))
      held = { _tag: 'Code', lines: [String(code.value[1])], blanks: 0 };
    else flowLine(html, line);
  };
  const read = (line: string) => {
    if (held._tag === 'Fence') return fenced(held, line);
    if (held._tag === 'Code' && coded(held, line)) return;
    if (held._tag === 'Quote' && quoted(held, line)) return;
    opens(line);
  };
  return {
    read,
    done: () => {
      release();
      return html.done();
    },
  };
};

/** Markdown as HTML (escaped throughout). Lines that follow one another make
 *  one paragraph, and a line under a list item (indented or not) goes on in
 *  that item, as Markdown reads them: a blank line, a heading, a list item, a
 *  table row, a fence or a quote ends either. A fence's lines (to its close,
 *  or the doc's end) and lines indented four after a rest are code, kept as
 *  they are; a quote's lines are a quote, read as Markdown of their own. */
export const markdownHtml = (text: string): string => {
  const lines = reader(writer());
  for (const line of text.split('\n')) lines.read(line);
  return lines.done();
};
