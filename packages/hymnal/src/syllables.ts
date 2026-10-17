/**
 * A hymn's words as a singer sings them: how many syllables each word may
 * take, and the word cut into that many pieces to print under the notes.
 *
 * Counts come from the CMU pronouncing dictionary, with the contractions a
 * singer makes (fire, our and power in one syllable, glo-rious in two), the
 * hymnal's elisions (o'er, heav'n, vict'ry), its archaic endings (-eth,
 * -est, didst) and compounds built from known words. A word none of these
 * reach is counted by rule.
 */

import { dictionary } from 'cmu-pronouncing-dictionary';
import { syllable } from 'syllable';

const DICTIONARY: Readonly<Record<string, string>> = dictionary;

/** Archaic forms the dictionary lacks, each one syllable. */
const ARCHAIC = new Set([
  'canst',
  'couldst',
  'didst',
  'dost',
  'doth',
  'hadst',
  'nought',
  'shouldst',
  'wast',
  'wert',
  'wouldst',
]);

/** The endings a stem takes, and the syllables each adds to it. */
const ENDINGS: ReadonlyArray<readonly [RegExp, (stem: string) => number]> = [
  [/eth$/, () => 1],
  [/est$/, () => 1],
  [/'s$/, (stem) => (/(s|z|x|ch|sh)$/.test(stem) ? 1 : 0)],
  [/s$/, () => 0],
  [/ed$/, (stem) => (/[td]$/.test(stem) ? 1 : 0)],
  [/ness$/, () => 1],
  [/less$/, () => 1],
  [/ful$/, () => 1],
  [/ly$/, () => 1],
  [/er$/, () => 1],
  [/ing$/, () => 1],
  [/some$/, () => 1],
  [/st$/, () => 0],
];

const vowelsIn = (phonemes: string) => (phonemes.match(/\d/g) ?? []).length;

/**
 * Vowels a singer may run together: a diphthong before an unstressed R
 * (fire, our, power) and an unstressed I before a schwa (glorious, obedience).
 */
const MERGES = /(?:AY|AW|OW)\d (?:[A-Z]+ )?ER0|(?:IY|IH)\d (?:AH|ER)0/g;

/** The counts the dictionary gives a word: its own first, then fewer as sung or as its variants say. */
const known = (word: string): readonly number[] | undefined => {
  const phonemes = DICTIONARY[word];
  if (phonemes === undefined) return undefined;
  const own = vowelsIn(phonemes);
  const counts = [own];
  for (let i = 2; i <= 4; i++) {
    const variant = DICTIONARY[`${word}(${i})`];
    // A variant with more syllables is an abbreviation ("us" as U.S.), never sung.
    if (variant !== undefined && vowelsIn(variant) < own) counts.push(vowelsIn(variant));
  }
  const merges = phonemes.match(MERGES)?.length ?? 0;
  for (let k = 1; k <= merges; k++) counts.push(own - k);
  return [...new Set(counts)];
};

const nuclei = (word: string) => word.replace(/e$/, '').match(/[aeiouy]+/g)?.length ?? 1;

const stemmed = (word: string): readonly number[] | undefined => {
  for (const [ending, adds] of ENDINGS) {
    if (!ending.test(word)) continue;
    const stem = word.replace(ending, '');
    const stems = [stem, `${stem}e`, stem.replace(/(.)\1$/, '$1'), stem.replace(/i$/, 'y')];
    for (const candidate of stems.filter((s) => s.length >= 2)) {
      const counts = known(candidate);
      if (counts !== undefined) return counts.map((n) => n + adds(candidate));
    }
  }
  for (let cut = 3; cut <= word.length - 3; cut++) {
    const [head, tail] = [known(word.slice(0, cut)), known(word.slice(cut))];
    if (head?.[0] !== undefined && tail?.[0] !== undefined) return [head[0] + tail[0]];
  }
  return undefined;
};

/** A word as the dictionary keys it: lower case, letters and inner apostrophes. */
const normal = (word: string): string =>
  word
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z']/g, '')
    .replace(/^'+|'+$/g, '');

/**
 * The syllables a word may be sung in, the likeliest first; an empty list
 * for a token with no letters.
 */
export const counts = (token: string): readonly number[] => {
  const word = normal(token);
  if (word === '') return [];
  if (word.includes("'") && DICTIONARY[word] === undefined) {
    // o'er, e'er, whate'er: the elided e joins the vowel before it.
    const joined = word.replace(/([aeiou])'e([rn])/g, '$1$2').replace(/'s$/, '');
    if (joined.includes("'")) return [nuclei(joined.replace(/'/g, ''))];
    const own = known(joined) ?? stemmed(joined);
    return [own === undefined ? nuclei(joined) : Math.min(...own)];
  }
  const own = known(word) ??
    known(word.replace(/our$/, 'or')) ??
    (ARCHAIC.has(word) ? [1] : undefined) ??
    stemmed(word) ?? [syllable(word)];
  // An -ed the hymns may sing as its own syllable (bless-ed, belov-ed).
  const sungEd = /[^aeiouytd]ed$/.test(word) && / [DT]$/.test(DICTIONARY[word] ?? '');
  const first = own[0];
  return sungEd && first !== undefined ? [...new Set([...own, first + 1])] : own;
};

// ----------------------------------------------------------------------------
// Stress
// ----------------------------------------------------------------------------

/** Words of one syllable spoken without stress: articles, prepositions, conjunctions, possessives. */
const WEAK = new Set([
  'a',
  'an',
  'the',
  'of',
  'to',
  'in',
  'on',
  'at',
  'by',
  'for',
  'with',
  'from',
  'as',
  'and',
  'but',
  'or',
  'nor',
  'my',
  'thy',
  'his',
  'her',
  'its',
  'our',
  'your',
  'their',
]);

/** Endings that add an unstressed syllable to a stem (reign-eth, glo-ri-fied). */
const WEAK_ENDINGS = /(?:eth|est|ing|ness|less|ful|ly|er|ed)$/;

/** Each syllable's stress as the dictionary marks it, when one of its entries has `count` vowels. */
const marked = (word: string, count: number): readonly boolean[] | undefined => {
  for (const key of [word, `${word}(2)`, `${word}(3)`, `${word}(4)`]) {
    const digits = DICTIONARY[key]?.match(/\d/g);
    if (digits?.length === count) return digits.map((digit) => digit !== '0');
  }
  return undefined;
};

/**
 * Which of a token's syllables are stressed, sung in `count` syllables: from
 * the dictionary, or a stem's and an unstressed ending's; undefined when
 * neither knows the word in that many.
 */
export const stresses = (token: string, count: number): readonly boolean[] | undefined => {
  const word = normal(token);
  if (word === '' || count < 1) return undefined;
  if (count === 1) return [!WEAK.has(word)];
  const own = marked(word, count);
  if (own !== undefined || !WEAK_ENDINGS.test(word)) return own;
  const stem = word.replace(WEAK_ENDINGS, '');
  const stems = [stem, `${stem}e`, stem.replace(/(.)\1$/, '$1'), stem.replace(/i$/, 'y')];
  const found = stems.map((candidate) => marked(candidate, count - 1)).find((s) => s !== undefined);
  return found === undefined ? undefined : [...found, false];
};

// ----------------------------------------------------------------------------
// Cutting a word for print
// ----------------------------------------------------------------------------

/**
 * Consonant pairs and triples that open a syllable together, as "bl" in
 * "bless". An s before a stop stays behind inside a word (sus-tain, mas-ter,
 * dis-tress), as hymnals print it.
 */
const ONSETS = new Set([
  'bl',
  'br',
  'ch',
  'cl',
  'cr',
  'dr',
  'dw',
  'fl',
  'fr',
  'gl',
  'gr',
  'kn',
  'ph',
  'pl',
  'pr',
  'qu',
  'sh',
  'sl',
  'sm',
  'sn',
  'sw',
  'th',
  'tr',
  'tw',
  'wh',
  'wr',
  'chr',
  'shr',
  'thr',
]);

/** Vowel pairs that may be two syllables (cre-a-tion, glo-ri-ous, al-le-lu-ia). */
const HIATUS = new Set(['ia', 'io', 'iu', 'ea', 'eo', 'ua', 'uo', 'ue', 'ui', 'ie', 'oe', 'ai']);

/** Endings printed as their own syllable when what is left is a word (reign-eth, sing-ing). */
const SYLLABIC = ['ing', 'eth', 'est', 'ness', 'less', 'ful', 'ment', 'ly', 'er', 'ed'];

/** Endings that add no syllable: they stay on the stem's last piece (crea-tures). */
const SILENT = ["'s", 's', 'ed', 'st'];

/**
 * Vowels that close their syllable over one consonant when stressed (ev-er,
 * moth-er, hon-or: a short o is AA spelled o), and R-coloured ones (for-ev-er).
 */
const closes = (vowel: string | undefined, spelled: string) =>
  vowel !== undefined &&
  (/^(?:AE|EH|IH|AH|UH)[12]$/.test(vowel) ||
    // The dictionary hears an unstressed a before r as R-coloured too (a-round).
    (/^ER\d$/.test(vowel) && spelled !== 'a') ||
    (/^AA[12]$/.test(vowel) && spelled === 'o'));

interface Nucleus {
  readonly start: number;
  readonly end: number;
}

const isKnown = (stem: string) =>
  DICTIONARY[stem] !== undefined || DICTIONARY[`${stem}e`] !== undefined;

const unstressed = (phonemes: string | undefined) => phonemes?.replace(/\d/g, '');

/**
 * Whether a word is its stem and an ending: an unknown word (reigneth) on a
 * known stem, or a known one that sounds as its stem does (redeem-er, but
 * not fath-er).
 */
const isEnding = (word: string, stem: string): boolean => {
  if (!isKnown(stem)) return false;
  const own = unstressed(DICTIONARY[word]);
  if (own === undefined) return true;
  const base = unstressed(DICTIONARY[stem] ?? DICTIONARY[`${stem}e`]);
  return base !== undefined && own.startsWith(`${base} `);
};

const vowelGroups = (letters: string): Nucleus[] => {
  const groups: Nucleus[] = [];
  // gh after a vowel is silent and belongs to it (might, though).
  for (const match of letters.matchAll(/[aeiouy]+(?:gh)?/g)) {
    // A word-initial y before a vowel is a consonant (yet, ye).
    const consonantY = match.index === 0 && /^y[aeiou]/.test(match[0]);
    groups.push({ start: match.index + (consonantY ? 1 : 0), end: match.index + match[0].length });
  }
  const last = groups.at(-1);
  // A final silent e (grace, alone), but not -le (ta-ble) and not the only vowel (the, be).
  const silentE =
    last !== undefined &&
    groups.length > 1 &&
    last.start === letters.length - 1 &&
    letters.endsWith('e') &&
    !/[^aeiouy]le$/.test(letters);
  return silentE ? groups.slice(0, -1) : groups;
};

/** Splits vowel groups at hiatus pairs, leftmost first, until there are `count` nuclei. */
const splitGroups = (letters: string, groups: readonly Nucleus[], count: number): Nucleus[] => {
  const out = [...groups];
  for (let i = 0; i < out.length && out.length < count; i++) {
    const group = out[i];
    if (group === undefined) continue;
    for (let cut = group.start + 1; cut < group.end; cut++) {
      const pair = letters.slice(cut - 1, cut + 1);
      // -tion, -sion, -cious: the i belongs to the consonant before it.
      const palatal = /^i/.test(pair) && /[tcsx]/.test(letters[cut - 2] ?? '');
      if (!HIATUS.has(pair) || palatal) continue;
      out.splice(i, 1, { start: group.start, end: cut }, { start: cut, end: group.end });
      break;
    }
  }
  return out;
};

/** Joins the two nuclei with the fewest letters between them until there are `count`. */
const joinGroups = (groups: readonly Nucleus[], count: number): Nucleus[] => {
  const out = [...groups];
  const gap = (i: number) => (out[i + 1]?.start ?? 0) - (out[i]?.end ?? 0);
  while (out.length > count && out.length > 1) {
    let best = 0;
    for (let i = 1; i < out.length - 1; i++) if (gap(i) <= gap(best)) best = i;
    const [a, b] = [out[best], out[best + 1]];
    if (a === undefined || b === undefined) break;
    out.splice(best, 2, { start: a.start, end: b.end });
  }
  return out;
};

/**
 * Where the consonants between two nuclei divide: one consonant opens the
 * next syllable unless the vowel before is short and stressed; more divide
 * before an onset they can begin together, else before the last.
 */
const boundary = (letters: string, left: Nucleus, right: Nucleus, vowel: string | undefined) => {
  const between = letters.slice(left.end, right.start);
  if (between.length === 0) return right.start;
  // th, sh, ch, ph sound as one consonant (moth-er).
  if (between.length === 1 || /^[tscp]h$/.test(between)) {
    const closed = letters.slice(left.end - 2, left.end) === 'gh' || between === 'x';
    const spelled = letters.slice(left.start, left.end);
    return closed || closes(vowel, spelled) ? left.end + between.length : left.end;
  }
  if (between === 'ck') return right.start;
  for (const size of [3, 2]) {
    if (between.length >= size && ONSETS.has(between.slice(-size))) return right.start - size;
  }
  return right.start - 1;
};

/** Cuts a word into at most `count` pieces by its vowels, its apostrophes kept with the letters before them. */
const byVowels = (word: string, count: number): string[] => {
  const kept = [...word].flatMap((c, i) => (c === "'" ? [] : [i]));
  const letters = kept
    .map((i) => word[i] ?? '')
    .join('')
    .toLowerCase();
  let groups = vowelGroups(letters);
  if (groups.length < count) groups = splitGroups(letters, groups, count);
  if (groups.length > count) groups = joinGroups(groups, count);
  const entries = [letters, `${letters}e`].flatMap((w) =>
    ['', '(2)', '(3)', '(4)'].map((n) => DICTIONARY[`${w}${n}`]),
  );
  const aligned = entries
    .map((phonemes) => phonemes?.split(' ').filter((p) => /\d$/.test(p)))
    .find((vowels) => vowels?.length === groups.length);
  const cuts: number[] = [];
  for (let i = 1; i < groups.length; i++) {
    const [left, right] = [groups[i - 1], groups[i]];
    if (left !== undefined && right !== undefined) {
      cuts.push(boundary(letters, left, right, aligned?.[i - 1]));
    }
  }
  const at = (cut: number) => kept[cut] ?? word.length;
  return [0, ...cuts]
    .map((from, i) =>
      word.slice(i === 0 ? 0 : at(from), i < cuts.length ? at(cuts[i] ?? 0) : word.length),
    )
    .filter((p) => p !== '');
};

/** A word cut as its stem and an ending: the ending its own piece, or kept on the stem's last. */
const byEnding = (word: string, count: number): string[] | undefined => {
  const lower = word.toLowerCase();
  for (const ending of SILENT) {
    const stem = lower.slice(0, -ending.length);
    if (
      lower.endsWith(ending) &&
      stem.length >= 3 &&
      isEnding(lower, stem) &&
      counts(stem).includes(count)
    ) {
      const pieces = cut(word.slice(0, -ending.length), count);
      return [...pieces.slice(0, -1), `${pieces.at(-1) ?? ''}${word.slice(-ending.length)}`];
    }
  }
  for (const ending of SYLLABIC) {
    const stem = lower.slice(0, -ending.length);
    // -er on a short stem, or on one ending in a cluster other than ng, is no
    // ending: the word divides by its vowels (wa-ter, mas-ter, af-ter).
    const cluster =
      ending === 'er' && (stem.length < 4 || (/[^aeiouy]{2}$/.test(stem) && !stem.endsWith('ng')));
    if (
      lower.endsWith(ending) &&
      stem.length >= 2 &&
      !cluster &&
      isEnding(lower, stem) &&
      counts(stem).includes(count - 1)
    ) {
      return [...cut(word.slice(0, -ending.length), count - 1), word.slice(-ending.length)];
    }
  }
  return undefined;
};

/** A word the dictionary does not know, cut as two words it does (for-ev-er-more). */
const byCompound = (word: string, count: number): string[] | undefined => {
  const lower = word.toLowerCase();
  if (DICTIONARY[lower] !== undefined) return undefined;
  for (let at = 3; at <= lower.length - 3; at++) {
    const [head, tail] = [known(lower.slice(0, at))?.[0], known(lower.slice(at))?.[0]];
    if (head !== undefined && tail !== undefined && head + tail === count) {
      return [...cut(word.slice(0, at), head), ...cut(word.slice(at), tail)];
    }
  }
  return undefined;
};

/** Cuts a word of letters and apostrophes into at most `count` pieces. */
const cut = (word: string, count: number): string[] => {
  if (count <= 1) return [word];
  // whate'er, where'er: the elided e'er is its own syllable.
  const elided = word.toLowerCase().search(/e'(?:er|en)$/);
  if (elided > 0) return [...cut(word.slice(0, elided), count - 1), word.slice(elided)];
  if (word.includes("'")) return byVowels(word, count);
  return byEnding(word, count) ?? byCompound(word, count) ?? byVowels(word, count);
};

/**
 * Cuts a token into at most `count` pieces to print under its notes,
 * punctuation kept on the first and last: "glorious" in three is glo-ri-ous.
 * A word cut into fewer pieces than it has notes holds its last piece over
 * the rest (fire on two notes).
 */
export const split = (token: string, count: number): readonly string[] => {
  const match = /^([^a-z']*)([a-z'’]*[a-z])([^a-z]*)$/i.exec(token);
  if (match === null || count <= 1) return [token];
  const [, lead = '', word = '', trail = ''] = match;
  const pieces = cut(word.replace(/’/g, "'"), count);
  return pieces.map(
    (piece, i) => `${i === 0 ? lead : ''}${piece}${i === pieces.length - 1 ? trail : ''}`,
  );
};
