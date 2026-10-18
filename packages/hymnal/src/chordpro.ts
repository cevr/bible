/**
 * Chord charts in the ChordPro dialect the hand charts write: words split by
 * spaces and a word's syllables by `-`; `[X]` before a syllable is a chord at
 * its start; ` ~[X]` after a syllable is a change under or after it; a
 * syllable that follows such changes inside its word is written ` -` and the
 * syllable. Sections are `{start_of_verse: Verse <n> …}` and
 * `{start_of_chorus: Refrain …}`; a label with `(guitar)` holds the guitar
 * level, any other the full harmony.
 *
 * A syllable's own `\`, `-`, `~`, `[`, `]` and spaces are written escaped
 * with `\`. Reading fails on a token it cannot read: it never drops one.
 */

import { Effect, Schema } from 'effect';

import * as Chord from './chord.js';
import type { Sung } from './hymn.js';

export class ChartError extends Schema.TaggedError<ChartError>()('ChartError', {
  line: Schema.Int,
  reason: Schema.String,
}) {}

class Unreadable {
  constructor(
    readonly line: number,
    readonly reason: string,
  ) {}
}

export interface Syllable {
  readonly text: string;
  /** The word's place in its line. */
  readonly word: number;
  /** The chord at its start, when one is written there. */
  readonly start: string | undefined;
  /** The changes after its start, in order. */
  readonly later: readonly string[];
}

export interface Section {
  readonly label: string;
  /** Stanza n, or the refrain. */
  readonly part: number | 'refrain';
  readonly level: 'full' | 'guitar';
  readonly lines: ReadonlyArray<ReadonlyArray<Syllable>>;
}

/** A syllable's chords as one string: `Gm7/Bb~C~C7`, `~C` with no chord at its start, `-` for none. */
export const chords = (syllable: Pick<Syllable, 'start' | 'later'>): string =>
  syllable.start === undefined && syllable.later.length === 0
    ? '-'
    : `${syllable.start ?? ''}${syllable.later.map((chord) => `~${chord}`).join('')}`;

const escape = (text: string) => text.replace(/[\\\-~[\]\s]/g, (c) => `\\${c}`);

/** A compiled syllable's chords at a level, spelled in a key, as a chart writes them. */
export const chartChords = (
  syllable: Sung['lines'][number][number],
  level: 'full' | 'guitar',
  key: Chord.Key,
): Pick<Syllable, 'start' | 'later'> => {
  const placed = syllable[level] ?? [];
  const [first] = placed;
  const start = first !== undefined && first.at === 0 ? first : undefined;
  return {
    start: start === undefined ? undefined : Chord.format(start.chord, key),
    later: placed.filter((p) => p !== start).map((p) => Chord.format(p.chord, key)),
  };
};

/** One level of a sung part as a chart section's lines. */
export const render = (part: Sung, key: Chord.Key, level: 'full' | 'guitar'): string =>
  part.lines
    .map((line) => {
      let out = '';
      line.forEach((syllable, i) => {
        const { start, later } = chartChords(syllable, level, key);
        const before = line[i - 1];
        const joined = before !== undefined && before.word === syllable.word;
        const heldBefore = before !== undefined && (before[level] ?? []).some((p) => p.at > 0);
        if (before !== undefined) out += joined ? (heldBefore ? ' -' : '-') : ' ';
        if (start !== undefined) out += `[${start}]`;
        out += escape(syllable.text);
        for (const chord of later) out += ` ~[${chord}]`;
      });
      return out;
    })
    .join('\n');

type Fail = (reason: string) => never;

/** Splits a line into tokens at unescaped spaces; an escape with nothing after it is unreadable. */
const tokens = (line: string, fail: Fail): string[] => {
  const out: string[] = [];
  let token = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i] ?? '';
    if (c === '\\') {
      const next = line[i + 1] ?? fail(`an escape with nothing after it in "${line}"`);
      token += c + next;
      i += 1;
    } else if (/\s/.test(c)) {
      if (token !== '') out.push(token);
      token = '';
    } else token += c;
  }
  if (token !== '') out.push(token);
  return out;
};

/** Reads a `[X]` at `i`: the chord and where the syllable's text starts. */
const chordAt = (token: string, i: number, fail: Fail): [string | undefined, number] => {
  if (token[i] !== '[') return [undefined, i];
  const close = token.indexOf(']', i);
  if (close < 0) fail(`unclosed chord in "${token}"`);
  const chord = token.slice(i + 1, close);
  if (chord === '') fail(`empty chord in "${token}"`);
  return [chord, close + 1];
};

/** Reads a syllable's text from `i` to the next unescaped `-`: the text and where it ends. */
const textAt = (token: string, from: number, fail: Fail): [string, number] => {
  let text = '';
  let i = from;
  while (i < token.length && token[i] !== '-') {
    const c = token[i] ?? '';
    if (c === '[' || c === ']' || c === '~') fail(`unreadable "${c}" in "${token}"`);
    const escaped = c === '\\';
    text += escaped ? (token[i + 1] ?? '') : c;
    i += escaped ? 2 : 1;
  }
  if (text === '') fail(`a syllable with no text in "${token}"`);
  return [text, i];
};

/** Reads `[X]text-[Y]text…`: each syllable's chord at its start and its text. */
const syllablesOf = (token: string, fail: Fail) => {
  const out: Array<{ start: string | undefined; text: string }> = [];
  let i = 0;
  do {
    const [start, from] = chordAt(token, i, fail);
    const [text, end] = textAt(token, from, fail);
    out.push({ start, text });
    i = end + 1;
  } while (i <= token.length);
  return out;
};

/** Reads one line of a section: its words' syllables and their chords. */
const lineOf = (line: string, fail: Fail): Syllable[] => {
  const out: Syllable[] = [];
  let word = -1;
  for (const token of tokens(line, fail)) {
    if (token.startsWith('~')) {
      if (!/^(?:~\[[^\]]+\])+$/.test(token)) fail(`unreadable change "${token}"`);
      const changes = [...token.matchAll(/~\[([^\]]+)\]/g)].map((m) => m[1] ?? '');
      const last = out.pop() ?? fail(`a change before any syllable: "${token}"`);
      out.push({ ...last, later: [...last.later, ...changes] });
      continue;
    }
    const continues = token.startsWith('-');
    if (continues && word < 0) fail(`a continuation before any word: "${token}"`);
    if (!continues) word += 1;
    for (const { start, text } of syllablesOf(continues ? token.slice(1) : token, fail)) {
      out.push({ text, word, start, later: [] });
    }
  }
  return out;
};

const sectionOf = (label: string, lines: Syllable[][], fail: Fail): Section => {
  const verse = /verse\s+(\d+)/i.exec(label)?.[1];
  const refrain = /refrain|chorus/i.test(label);
  if (!refrain && verse === undefined) fail(`a section that is no verse or refrain: "${label}"`);
  return {
    label,
    part: refrain ? 'refrain' : Number(verse),
    level: /\(guitar\)/i.test(label) ? 'guitar' : 'full',
    lines,
  };
};

/** The directives a chart may give outside a section; they say nothing the golden reads. */
const METADATA: ReadonlySet<string> = new Set(['title', 'subtitle', 'key', 'time', 'comment']);
const SECTIONS: ReadonlySet<string> = new Set([
  'start_of_verse',
  'end_of_verse',
  'start_of_chorus',
  'end_of_chorus',
]);

const read = (chart: string): readonly Section[] => {
  const sections: Section[] = [];
  let open: { label: string; lines: Syllable[][] } | undefined;
  const lines = chart.split('\n');
  lines.forEach((raw, index) => {
    const fail: Fail = (reason) => {
      throw new Unreadable(index + 1, reason);
    };
    const line = raw.trim();
    const [, name, value = ''] = /^\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}$/i.exec(line) ?? [];
    if (name === undefined && line.startsWith('{')) fail(`an unreadable directive: "${line}"`);
    if (name !== undefined && METADATA.has(name)) {
      if (open !== undefined) fail(`a {${name}} inside a section`);
    } else if (name !== undefined && !SECTIONS.has(name)) {
      fail(`an unknown directive: "${line}"`);
    } else if (name === 'start_of_verse' || name === 'start_of_chorus') {
      if (open !== undefined) fail('a section inside a section');
      open = { label: value, lines: [] };
    } else if (name === 'end_of_verse' || name === 'end_of_chorus') {
      const ended = open ?? fail('an end with no section');
      sections.push(sectionOf(ended.label, ended.lines, fail));
      open = undefined;
    } else if (name === undefined && line !== '') {
      const section = open ?? fail(`words outside a section: "${line}"`);
      section.lines.push(lineOf(line, fail));
    }
  });
  if (open !== undefined) throw new Unreadable(lines.length, 'a section with no end');
  return sections;
};

/** Reads a chart's sections, failing on the first token or line it cannot read. */
export const parse = (chart: string): Effect.Effect<readonly Section[], ChartError> =>
  Effect.try({
    try: () => read(chart),
    catch: (error) =>
      error instanceof Unreadable
        ? ChartError.make({ line: error.line, reason: error.reason })
        : ChartError.make({ line: 0, reason: String(error) }),
  });
