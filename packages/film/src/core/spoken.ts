// The words a take is checked by: a line as it is said, so a correct reading
// is never a mismatch for how it was written down. Numbers are one token of
// digits however they were said or written ("144,000", "one hundred and
// forty-four thousand", "144 thousand"; a year in pairs, "eighteen
// eighty-eight"); a scripture reference is its numbers ("3:1-4", "chapter
// three verses one through four"); an abbreviation is the word it stands for
// ("Mrs." and "Missus"); and a name the transcriber writes another way is the
// script's, where the script says so (`heardAs`). Both sides are read the
// same way, so what is left is what was really said differently.
//
// Pure: the take check (`lineError`) runs in the tools and the tests alike.

import { Array as Arr, Option } from 'effect';
import { wordError } from './align.ts';
import { normalizeWords } from './narration.ts';
import type { HeardAs } from './schema.ts';

const UNITS = new Map(
  [
    'zero',
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
    'ten',
    'eleven',
    'twelve',
    'thirteen',
    'fourteen',
    'fifteen',
    'sixteen',
    'seventeen',
    'eighteen',
    'nineteen',
  ].map((word, n) => [word, n] as const),
);

const TENS = new Map(
  ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'].map(
    (word, n) => [word, (n + 2) * 10] as const,
  ),
);

const SCALES = new Map([
  ['thousand', 1e3],
  ['million', 1e6],
  ['billion', 1e9],
]);

/** Abbreviations, as the words they are read as. */
const ABBREVIATIONS = new Map([
  ['mr', 'mister'],
  ['mrs', 'missus'],
  ['dr', 'doctor'],
  ['st', 'saint'],
  ['jr', 'junior'],
  ['sr', 'senior'],
  ['vs', 'versus'],
  ['etc', 'etcetera'],
]);

/** Said before a reference's numbers, and nothing without them. */
const REFERENCE_WORDS = ['chapter', 'chapters', 'verse', 'verses'];

/** Said between two numbers for a range: `1-4` is "one to four". */
const RANGE_WORDS = ['to', 'through', 'thru'];

const isDigits = (token: string) => /^\d+$/.test(token);

const isNumberWord = (token: string) =>
  UNITS.has(token) || TENS.has(token) || token === 'hundred' || SCALES.has(token);

const isNumber = (token: string) => isDigits(token) || isNumberWord(token);

/**
 * A run of number words and digits as one token of digits: `one hundred
 * forty four thousand` is `144000`, and numbers said one after another join
 * (`eighteen eighty eight` is `1888`, `three one four` is `314`), as the
 * digits `1888` and `3:1-4` do.
 */
const digitsOf = (run: ReadonlyArray<string>): string => {
  const parts: Array<string> = [];
  let total = 0;
  let current = 0;
  let open = false;
  const close = () => {
    if (open) parts.push(String(total + current));
    total = 0;
    current = 0;
    open = false;
  };
  const add = (n: number, fits: boolean) => {
    if (open && !fits) close();
    current += n;
    open = true;
  };
  for (const token of run) {
    if (isDigits(token)) {
      close();
      current = Number(token);
      open = true;
      continue;
    }
    const unit = Option.fromNullishOr(UNITS.get(token));
    if (Option.isSome(unit)) {
      // After a hundred or a scale, or a units digit after the tens.
      const afterTens = current % 10 === 0 && current % 100 >= 20 && unit.value < 10;
      add(unit.value, current % 100 === 0 || afterTens);
      continue;
    }
    const tens = Option.fromNullishOr(TENS.get(token));
    if (Option.isSome(tens)) {
      add(tens.value, current % 100 === 0);
      continue;
    }
    if (token === 'hundred') {
      current = Math.max(1, current) * 100;
      open = true;
      continue;
    }
    const scale = Option.fromNullishOr(SCALES.get(token));
    if (Option.isSome(scale)) {
      total += Math.max(1, current) * scale.value;
      current = 0;
      open = true;
    }
  }
  close();
  return parts.join('');
};

/**
 * `text` as the take check reads it: `normalizeWords`, with digit groups
 * joined (`144,000`), abbreviations read out, the words said around a
 * reference's numbers dropped, and every run of numbers one token of digits.
 */
export const spokenWords = (text: string): ReadonlyArray<string> => {
  const tokens = normalizeWords(text.replace(/(\d)[,\u00a0\u202f](?=\d{3}(?!\d))/g, '$1')).map(
    (t) => Option.getOrElse(Option.fromNullishOr(ABBREVIATIONS.get(t)), () => t),
  );
  const at = (i: number) => Option.getOrElse(Arr.get(tokens, i), () => '');
  // "chapter" and "verses" before a number, "to" and "through" between two.
  const kept = tokens.filter(
    (t, i) =>
      !(REFERENCE_WORDS.includes(t) && isNumber(at(i + 1))) &&
      !(RANGE_WORDS.includes(t) && isNumber(at(i - 1)) && isNumber(at(i + 1))),
  );
  const out: Array<string> = [];
  let run: Array<string> = [];
  for (const [i, t] of kept.entries()) {
    const next = Option.getOrElse(Arr.get(kept, i + 1), () => '');
    // "and" inside a number ("one hundred and four") is part of it.
    if (isNumber(t) || (t === 'and' && run.length > 0 && isNumber(next))) {
      run.push(t);
      continue;
    }
    if (run.length > 0) out.push(digitsOf(run));
    run = [];
    out.push(t);
  }
  if (run.length > 0) out.push(digitsOf(run));
  return out;
};

/**
 * `heard` with every way the script says a name is heard (`heardAs`) read as
 * the script's word, longest first.
 */
const asScript = (heard: ReadonlyArray<string>, heardAs: HeardAs): ReadonlyArray<string> => {
  const aliases = Object.entries(heardAs)
    .flatMap(([word, ways]) =>
      ways.map((way) => ({ way: spokenWords(way), word: spokenWords(word) })),
    )
    .filter((a) => a.way.length > 0)
    .toSorted((a, b) => b.way.length - a.way.length);
  const out: Array<string> = [];
  let i = 0;
  while (i < heard.length) {
    const found = Arr.findFirst(aliases, (a) =>
      a.way.every((w, k) => Arr.get(heard, i + k).pipe(Option.contains(w))),
    );
    if (Option.isSome(found)) {
      out.push(...found.value.word);
      i += found.value.way.length;
      continue;
    }
    out.push(Arr.getUnsafe(heard, i));
    i += 1;
  }
  return out;
};

/**
 * How far what was `heard` is from the `script`'s line, 0 to 1: the word
 * error between the two as said (`spokenWords`), with the names the script
 * lists in `heardAs` read as its own.
 */
export const lineError = (script: string, heard: string, heardAs: HeardAs): number =>
  wordError(spokenWords(script), asScript(spokenWords(heard), heardAs));
