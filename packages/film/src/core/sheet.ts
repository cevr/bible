// The reading sheet: the script as the narrator reads it into a microphone.
// Each beat with words is one take, saved under the name `takes import` reads
// (`<beat>.wav`); its marks are stripped, a turn names who reads on, a
// quotation is set apart with the source whose words it is, and each sentence
// ends in a breath (`/`). Written as Markdown and as a page to print.
//
// Pure: the CLI reads the script and the quotes, and writes what this returns.

import { Array as Arr, Option } from 'effect';
import { normalizeWords, parse } from './narration.ts';
import { isAbbreviation } from './spoken.ts';

/** A verified quotation (a film's `quotes.jsonl`): whose words, where they are. */
export interface Quote {
  readonly ref: string;
  readonly author: string;
  readonly text: string;
}

/** A beat of the script as the sheet reads it. */
export interface ScriptLine {
  readonly id: string;
  readonly say?: string;
  readonly cite: ReadonlyArray<string>;
}

/** A stretch of a beat: words to read, or a quotation set apart. */
export type Part =
  | { readonly _tag: 'Line'; readonly voice: Option.Option<string>; readonly text: string }
  | { readonly _tag: 'Quotation'; readonly text: string; readonly by: Option.Option<string> };

export interface SheetBeat {
  readonly id: string;
  /** The name to save the take under, for `takes import`. */
  readonly file: string;
  readonly parts: ReadonlyArray<Part>;
  /** The beat's sources, as the script cites them. */
  readonly sources: ReadonlyArray<string>;
}

/** A quotation mark: “…”. */
const QUOTATION = /(“[^”]*”)/;

/** Whether `words` appear, in order and together, in `within`. */
const holds = (within: ReadonlyArray<string>, words: ReadonlyArray<string>): boolean =>
  words.length > 0 &&
  Arr.makeBy(Math.max(0, within.length - words.length + 1), (i) => i).some((i) =>
    words.every((w, k) => within[i + k] === w),
  );

/** The source a quotation's words are verified in: `author, ref`. */
const sourceOf = (quotes: ReadonlyArray<Quote>, text: string): Option.Option<string> => {
  const words = normalizeWords(text);
  return Option.map(
    Arr.findFirst(quotes, (q) => holds(normalizeWords(q.text), words)),
    (q) => `${q.author}, ${q.ref}`,
  );
};

/** A sentence ends in a breath; an abbreviation's full stop (`Mrs.`, `St.`) ends none. */
const breathe = (text: string): string =>
  text.replace(/(\S*)([.?!])\s+(?=\S)/g, (all, word: string, stop: string) => {
    if (stop === '.' && isAbbreviation(word)) return all;
    return `${word}${stop} / `;
  });

/** One voice's words split at its quotations. */
const partsOf = (
  voice: Option.Option<string>,
  text: string,
  quotes: ReadonlyArray<Quote>,
): ReadonlyArray<Part> =>
  text
    .split(QUOTATION)
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0)
    .map((piece, i, all): Part => {
      if (QUOTATION.test(piece))
        return { _tag: 'Quotation', text: piece, by: sourceOf(quotes, piece) };
      // Only the first stretch of a voice's words carries its name.
      const named = Option.filter(voice, () => all.findIndex((p) => !QUOTATION.test(p)) === i);
      return { _tag: 'Line', voice: named, text: breathe(piece) };
    });

/** The words of a line, cut where each turn hands it on. */
const voicesOf = (say: string) => {
  const parsed = parse(say);
  const words = parsed.spoken.split(' ');
  const starts = [0, ...parsed.turns.map((t) => t.word).filter((w) => w > 0)];
  return starts.map((from, k) => ({
    voice: Option.map(
      Arr.findFirst(parsed.turns, (t) => t.word === from),
      (t) => t.voice,
    ),
    text: words
      .slice(
        from,
        Option.getOrElse(Arr.get(starts, k + 1), () => words.length),
      )
      .join(' '),
  }));
};

/** The sheet's beats: every beat with words, in script order. */
export const sheetBeats = (
  script: ReadonlyArray<ScriptLine>,
  quotes: ReadonlyArray<Quote>,
): ReadonlyArray<SheetBeat> =>
  script.flatMap((beat) =>
    Option.toArray(
      Option.map(
        Option.filter(Option.fromNullishOr(beat.say), (say) => parse(say).spoken.length > 0),
        (say): SheetBeat => ({
          id: beat.id,
          file: `${beat.id}.wav`,
          parts: voicesOf(say).flatMap((v) => partsOf(v.voice, v.text, quotes)),
          sources: beat.cite,
        }),
      ),
    ),
  );

const HOW_TO =
  'Read each beat as its own take and save it under the name shown, then run `film takes import <film> <folder>`. `/` is a breath. A quotation is set apart: read it as quoted.';

/** A line's text, with its reader when a turn names one. */
const spoken = (voice: Option.Option<string>, text: string, name: (v: string) => string) =>
  Option.match(voice, { onNone: () => text, onSome: (v) => `${name(v.toUpperCase())} ${text}` });

const markdownPart = (part: Part): string => {
  if (part._tag === 'Line') return spoken(part.voice, part.text, (v) => `**${v}:**`);
  return Option.match(part.by, {
    onNone: () => `> ${part.text}`,
    onSome: (by) => `> ${part.text}\n> — ${by}`,
  });
};

/** The sheet as Markdown. */
export const sheetMarkdown = (film: string, beats: ReadonlyArray<SheetBeat>): string =>
  [
    `# ${film}: reading sheet`,
    HOW_TO,
    ...beats.map((beat, i) =>
      [
        `## ${i + 1}. ${beat.id}`,
        `Save as \`${beat.file}\``,
        ...beat.parts.map(markdownPart),
        ...Arr.filter([`Sources: ${beat.sources.join('; ')}`], () => beat.sources.length > 0),
      ].join('\n\n'),
    ),
  ].join('\n\n') + '\n';

const escape = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const htmlPart = (part: Part): string => {
  if (part._tag === 'Line')
    return `<p>${spoken(part.voice, escape(part.text), (v) => `<b>${escape(v)}:</b>`)}</p>`;
  const by = Option.match(part.by, {
    onNone: () => '',
    onSome: (source) => `<cite>— ${escape(source)}</cite>`,
  });
  return `<blockquote><p>${escape(part.text)}</p>${by}</blockquote>`;
};

const STYLE = `
:root { color-scheme: light; --ink: #1d1b16; --muted: #6b6457; --rule: #d8d1c2; --paper: #fdfbf6; }
body { margin: 0 auto; max-width: 42rem; padding: 2rem 1rem; background: var(--paper); color: var(--ink);
  font: 1.25rem/1.7 Georgia, 'Times New Roman', serif; }
h1 { font-size: 1.6rem; margin: 0 0 .5rem; }
.how { color: var(--muted); font-size: 1rem; }
section { border-top: 1px solid var(--rule); padding: 1rem 0; break-inside: avoid; }
h2 { font: 600 1rem/1.4 system-ui, sans-serif; margin: 0; display: flex; justify-content: space-between; gap: 1rem; }
h2 code { font-weight: 400; color: var(--muted); }
blockquote { margin: .5rem 0 .5rem 1.5rem; padding-left: 1rem; border-left: 3px solid var(--rule); font-style: italic; }
blockquote p { margin: 0; }
cite { display: block; font: .85rem/1.4 system-ui, sans-serif; color: var(--muted); font-style: normal; }
.sources { font: .85rem/1.4 system-ui, sans-serif; color: var(--muted); }
@media print { body { background: none; font-size: 13pt; } section { page-break-inside: avoid; } }
`;

/** The sheet as a page to print. */
export const sheetHtml = (film: string, beats: ReadonlyArray<SheetBeat>): string => {
  const sections = beats.map((beat, i) => {
    const sources = Arr.filter(
      [`<p class="sources">Sources: ${escape(beat.sources.join('; '))}</p>`],
      () => beat.sources.length > 0,
    );
    return [
      `<section id="${escape(beat.id)}">`,
      `<h2><span>${i + 1}. ${escape(beat.id)}</span><code>${escape(beat.file)}</code></h2>`,
      ...beat.parts.map(htmlPart),
      ...sources,
      '</section>',
    ].join('\n');
  });
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escape(film)}: reading sheet</title>`,
    `<style>${STYLE}</style>`,
    '</head>',
    '<body>',
    `<h1>${escape(film)}: reading sheet</h1>`,
    `<p class="how">${escape(HOW_TO)}</p>`,
    ...sections,
    '</body>',
    '</html>',
    '',
  ].join('\n');
};
