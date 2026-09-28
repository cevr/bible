// A short's captions: the words in phrases of two to four, each phrase
// shown from its first word to the next phrase, words inside a quotation
// flagged so the page can light them as they are read.

import { describe, expect, test } from 'bun:test';
import { Result } from 'effect';
import { layout } from './layout.ts';
import { hashText } from './narration.ts';
import { PHRASE_HOLD, phraseCues, phrasesOf, quotedWords, shortPhrases } from './phrases.ts';
import type { Word } from './schema.ts';
import { resolveShort } from './shorts.ts';

/** Words half a second apart, each 0.4 s long. */
const said = (text: string, from = 0): Array<Word> =>
  text.split(' ').map((t, i) => ({ text: t, start: from + i * 0.5, end: from + i * 0.5 + 0.4 }));

const texts = (phrases: ReturnType<typeof phrasesOf>) =>
  phrases.map((p) => p.words.map((w) => w.text).join(' '));

describe('phrasesOf', () => {
  test('two to four words, broken at a sentence and balanced inside it', () => {
    expect(texts(phrasesOf(said('Paul says we are justified. But I am still guilty.')))).toEqual([
      'Paul says we',
      'are justified.',
      'But I am',
      'still guilty.',
    ]);
  });

  test('a clause ends a phrase at its comma when both sides hold two words', () => {
    expect(
      texts(phrasesOf(said('It shows the stain perfectly, but you cannot wash your face'))),
    ).toEqual(['It shows the', 'stain perfectly,', 'but you cannot', 'wash your face']);
  });

  test('a one-word sentence joins the sentence after it, never another voice', () => {
    expect(texts(phrasesOf(said('Right? And yet the Bible says')))).toEqual([
      'Right? And yet',
      'the Bible says',
    ]);
    // A turn to another voice starts a phrase: the lone word joins its own voice's next sentence.
    const turn = said('Wait, a cover-up? Fair. It just means');
    expect(texts(phrasesOf(turn, new Set([3])))).toEqual([
      'Wait, a cover-up?',
      'Fair. It just means',
    ]);
    // With the next sentence in another voice, it stays alone.
    expect(texts(phrasesOf(turn, new Set([3, 4])))).toEqual([
      'Wait, a cover-up?',
      'Fair.',
      'It just means',
    ]);
  });

  test('a phrase shows from its first word until the next, and holds after the last', () => {
    const phrases = phrasesOf(said('One two three four five six'));
    expect(phrases.map((p) => [p.start, p.end])).toEqual([
      [0, 1.5],
      [1.5, 2.5 + 0.4 + PHRASE_HOLD],
    ]);
  });
});

describe('quotedWords', () => {
  test('flags every word from an opening curly quote to its closing one', () => {
    const words = said('Isaiah said: “All our righteousnesses are as filthy rags.” And the law');
    expect(quotedWords(words)).toEqual([
      false,
      false,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      false,
      false,
    ]);
  });
});

describe('shortPhrases', () => {
  const draw = () => {};
  const placed = layout(
    [
      { id: 'a', say: 'One two {three}three four five six.', draw },
      { id: 'b', say: 'He said “seven eight nine” {ten}ten eleven.', draw },
    ],
    { voice: '', scenes: {} },
  );

  test('the words under each span, on the short clock, quotations flagged', () => {
    const short = Result.getOrThrow(
      resolveShort(
        placed,
        {
          id: 'cut',
          title: 'Cut',
          spans: [
            { scene: 'b', from: { scene: 'speech' }, to: { mark: 'ten' } },
            { scene: 'a', from: { mark: 'three' }, to: { scene: 'speechEnd' } },
          ],
        },
        30,
      ),
    );
    const phrases = shortPhrases(placed, short);
    const words = phrases.flatMap((p) => p.words);
    expect(words.map((w) => w.text)).toEqual([
      'He',
      'said',
      '“seven',
      'eight',
      'nine”',
      'three',
      'four',
      'five',
      'six.',
    ]);
    expect(words.map((w) => w.quoted)).toEqual([
      false,
      false,
      true,
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
    // On the short's clock, in order, inside the short.
    expect(words[0]?.start).toBeGreaterThanOrEqual(0);
    for (let i = 1; i < words.length; i++)
      expect(words[i]?.start ?? 0).toBeGreaterThan(words[i - 1]?.start ?? 0);
    // No phrase crosses a join: the second span's words start a phrase.
    expect(phrases.some((p) => p.words[0]?.text === 'three')).toBe(true);
    // Each phrase ends by its span's end.
    const joinAt = short.spans[1]?.at ?? 0;
    for (const p of phrases) if (p.start < joinAt) expect(p.end).toBeLessThanOrEqual(joinAt + 1e-9);
  });

  test("a span's first phrase shows on its first frame, however the word's time rounds", () => {
    // `three` sits between frames: the span starts on the frame nearest it.
    const short = Result.getOrThrow(
      resolveShort(
        placed,
        {
          id: 'cut',
          title: 'Cut',
          spans: [{ scene: 'a', from: { mark: 'three' }, to: { scene: 'speechEnd' } }],
        },
        7,
      ),
    );
    const phrases = shortPhrases(placed, short);
    expect(phrases[0]?.words[0]?.text).toBe('three');
    expect(phrases[0]?.start).toBe(0);
    // Each phrase shows by the frame its first word falls in, and none overlaps the next.
    for (const p of phrases) expect(p.start).toBeLessThanOrEqual(p.words[0]?.start ?? 0);
    for (let i = 1; i < phrases.length; i++)
      expect(phrases[i - 1]?.end ?? 0).toBeLessThanOrEqual(phrases[i]?.start ?? 0);
  });

  test('the sidecar is the phrases, as shown', () => {
    const cues = phraseCues(phrasesOf(said('One two three four five six')));
    expect(cues.map((c) => c.text)).toEqual(['One two three', 'four five six']);
  });

  test('a phrase shows when its first word is heard, and its words are timed by the voice', () => {
    // The aligner starts "Justified?" at 0 with the pause before it; the voice comes at 0.87 s.
    const say = 'Justified? But I am still guilty.';
    const heardAt: ReadonlyArray<readonly [number, number, number, number]> = [
      [0, 2.3, 0.87, 1.9],
      [2.3, 2.6, 2.4, 2.6],
      [2.6, 2.7, 2.6, 2.7],
      [2.7, 2.9, 2.7, 2.9],
      [2.9, 3.3, 2.95, 3.3],
      [3.3, 3.9, 3.3, 3.8],
    ];
    const words = say.split(' ').map((text, i) => {
      const [start, end, on, off] = heardAt[i] ?? [0, 0, 0, 0];
      return { text, start, end, voiced: { start: on, end: off } };
    });
    const take = {
      hash: hashText(say),
      file: 'a.mp3',
      duration: 4,
      words,
      source: 'elevenlabs' as const,
    };
    const film = layout([{ id: 'a', say, lead: 0.5, draw }], { voice: 'v', scenes: { a: take } });
    const short = Result.getOrThrow(
      resolveShort(
        film,
        {
          id: 'cut',
          title: 'Cut',
          spans: [{ scene: 'a', from: { scene: 'speech' }, to: { scene: 'speechEnd' } }],
        },
        30,
      ),
    );
    const phrases = shortPhrases(film, short);
    const first = phrases[0]?.words[0];
    expect(first).toEqual({ text: 'Justified?', start: 0.87, end: 1.9, quoted: false });
    // Shown on the frame nearest the voice, not on the short's first frame.
    expect(phrases[0]?.start).toBeCloseTo(0.87 - 0.5 / 30 - 1e-6, 6);
    expect(phrases.flatMap((p) => p.words).map((w) => w.start)).toEqual(
      heardAt.map(([, , on]) => on),
    );
  });
});
