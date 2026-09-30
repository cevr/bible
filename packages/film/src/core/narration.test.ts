import { describe, expect, test } from 'bun:test';
import { Option, Result } from 'effect';
import { DuplicateMark, TurnInvalid } from './errors.ts';
import { layout } from './layout.ts';
import type { Timings, Cast, Reader } from './schema.ts';

/** No recorded takes: every scene is estimated. */
const noTakes: Timings = { voice: '', scenes: {} };
import {
  endsClause,
  endsSentence,
  estimate,
  hashText,
  linesOf,
  parse,
  takeScript,
  voiceFor,
  voiceKey,
  wordsFromAlignment,
} from './narration.ts';
import { unmeasured } from './voiced.ts';

/** A line read that must parse. */
const read = (text: string) => Result.getOrThrow(parse('s', text));

describe('narration', () => {
  test('marks are removed from speech and point at the next word', () => {
    const p = read('God {speak}spoke, and {so}it was so.');
    expect(p.spoken).toBe('God spoke, and it was so.');
    expect(p.marks.get('speak')).toBe(1);
    expect(p.marks.get('so')).toBe(3);
  });

  test('one rule says where a sentence or a clause ends, whatever quote or bracket closes it', () => {
    for (const w of ['so.', 'so?', 'so!', 'so.”', "so.'", 'so.)', 'so.]', 'so."'])
      expect([w, endsSentence(w)]).toEqual([w, true]);
    for (const w of ['so,', 'so;', 'so:', 'so—', 'so–', 'so…', "so,'", 'so,]'])
      expect([w, endsClause(w), endsSentence(w)]).toEqual([w, true, false]);
    expect(endsSentence('so')).toBe(false);
    // The estimate pauses on the same ends: longer after a sentence than a clause.
    const gap = (text: string) => {
      const [a, b] = estimate(text);
      return (b?.start ?? 0) - (a?.end ?? 0);
    };
    expect(gap("one.' two")).toBeGreaterThan(gap('one… two'));
    expect(gap('one… two')).toBeGreaterThan(gap('one two'));
  });

  test('a duplicate mark is an authoring error naming its scene', () => {
    expect(Result.getFailure(parse('s', '{a}one {a}two'))).toEqual(
      Option.some(DuplicateMark.make({ scene: 's', mark: 'a' })),
    );
  });

  test("alignment characters regroup into the script's words", () => {
    const text = 'Look and live.';
    const chars = [...text];
    const starts = chars.map((_, i) => i * 0.1);
    const ends = chars.map((_, i) => i * 0.1 + 0.1);
    const words = Result.getOrThrow(wordsFromAlignment(text, chars, starts, ends));
    expect(words.map((w) => w.text)).toEqual(['Look', 'and', 'live.']);
    expect(words[2]?.start).toBeCloseTo(0.9);
  });

  test('an alignment that regroups into other words is a typed failure', () => {
    const r = wordsFromAlignment('Look and live.', [...'Lookandlive.'], [], []);
    expect(Result.isFailure(r) && r.failure._tag).toBe('AlignmentMismatch');
  });

  test('a take is used only while its text is unchanged', () => {
    const spoken = 'Look and live.';
    const take = {
      hash: hashText(spoken),
      file: 'a.mp3',
      duration: 2,
      words: unmeasured(estimate(spoken)),
      source: 'elevenlabs' as const,
    };
    const timings = { voice: 'v', scenes: { s: take } };
    expect(Result.getOrThrow(voiceFor('s', 'Look and {live}live.', timings)).recorded).toBe(true);
    expect(Result.getOrThrow(voiceFor('s', 'Look and die.', timings)).recorded).toBe(false);
  });

  test('a take changes with its words, not with its marks', () => {
    const spoken = 'Look and live.';
    const take = {
      hash: hashText(spoken),
      file: 'a.mp3',
      duration: 2,
      words: unmeasured(estimate(spoken)),
      source: 'elevenlabs' as const,
    };
    const timings = { voice: 'v', scenes: { s: take } };
    expect(Result.getOrThrow(voiceFor('s', '{look}Look and {live}live.', timings)).recorded).toBe(
      true,
    );
  });

  test('scenes are laid end to end and sized by their speech', () => {
    const draw = () => {};
    const placed = Result.getOrThrow(
      layout(
        [
          { id: 'a', say: 'One two three.', lead: 0.5, tail: 1, draw },
          { id: 'b', min: 4, draw },
        ],
        noTakes,
      ),
    );
    const a = placed[0];
    const b = placed[1];
    expect(a?.start).toBe(0);
    expect(a?.dur).toBeCloseTo(0.5 + (a?.voice.duration ?? 0) + 1);
    expect(b?.start).toBeCloseTo(a?.dur ?? 0);
    expect(b?.dur).toBe(4);
  });
});

const reader: Reader = { voiceId: 'r', model: 'eleven_v3', settings: { stability: 0.5 } };
const cast: Cast = {
  model: 'eleven_v3',
  settings: { stability: 0.5 },
  voices: [
    { name: 'lead', voiceId: 'L' },
    { name: 'ask', voiceId: 'A' },
  ],
};

describe('turns', () => {
  const line = "That's the law. {@ask}So where does that {stuck}leave us? {@lead}Stuck.";

  test('a turn hands the next word to another voice, and is not spoken', () => {
    const p = read(line);
    expect(p.spoken).toBe("That's the law. So where does that leave us? Stuck.");
    expect(p.turns).toEqual([
      { voice: 'ask', word: 3 },
      { voice: 'lead', word: 9 },
    ]);
    expect(p.marks.get('stuck')).toBe(7);
  });

  test('two turns before one word, or a turn at the end, is an authoring error naming its scene', () => {
    expect(Result.getFailure(parse('s', 'One {@ask}{@lead}two.'))).toEqual(
      Option.some(
        TurnInvalid.make({
          scene: 's',
          voice: 'lead',
          reason: 'follows another turn before any word',
        }),
      ),
    );
    expect(Result.getFailure(parse('s', 'One two. {@ask}'))).toEqual(
      Option.some(TurnInvalid.make({ scene: 's', voice: 'ask', reason: 'has no word after it' })),
    );
  });

  test('the take script carries the turns, and is the spoken text without them', () => {
    expect(takeScript(read(line))).toBe(
      "That's the law. {@ask}So where does that leave us? {@lead}Stuck.",
    );
    expect(takeScript(read('Look and {live}live.'))).toBe('Look and live.');
  });

  test('moving a turn changes the take; moving a mark does not', () => {
    const moved = "That's the law. So {@ask}where does that leave us? {@lead}Stuck.";
    expect(hashText(takeScript(read(moved)))).not.toBe(hashText(takeScript(read(line))));
    const marked = line.replace('{stuck}', '');
    expect(hashText(takeScript(read(marked)))).toBe(hashText(takeScript(read(line))));
  });

  test("a cast reads a line per turn, the first by the cast's first voice", () => {
    const lines = Result.getOrThrow(linesOf('s', read(line), cast));
    expect(lines).toEqual([
      { name: 'lead', voiceId: 'L', text: "That's the law." },
      { name: 'ask', voiceId: 'A', text: 'So where does that leave us?' },
      { name: 'lead', voiceId: 'L', text: 'Stuck.' },
    ]);
  });

  test('a turn to the voice already reading continues its line', () => {
    const lines = Result.getOrThrow(
      linesOf('s', read('{@lead}One. {@ask}Two. {@ask}Three.'), cast),
    );
    expect(lines.map((l) => [l.name, l.text])).toEqual([
      ['lead', 'One.'],
      ['ask', 'Two. Three.'],
    ]);
  });

  test('one voice reads the whole take', () => {
    const lines = Result.getOrThrow(linesOf('s', read('Look and {live}live.'), reader));
    expect(lines).toEqual([{ name: '', voiceId: 'r', text: 'Look and live.' }]);
    expect(Result.getOrThrow(linesOf('s', read(''), cast))).toEqual([]);
  });

  test('a turn to a voice the film does not have names the voices it does', () => {
    const unknown = linesOf('s', read('One. {@narrator}Two.'), cast);
    expect(Result.isFailure(unknown) && unknown.failure).toMatchObject({
      _tag: 'UnknownVoice',
      scene: 's',
      voice: 'narrator',
      known: ['lead', 'ask'],
    });
    const single = linesOf('s', read('One. {@ask}Two.'), reader);
    expect(Result.isFailure(single) && single.failure).toMatchObject({ voice: 'ask', known: [] });
  });

  test("a cast's key names every voice, so recasting one re-records the film", () => {
    expect(voiceKey(reader)).toBe('r/eleven_v3/{"stability":0.5}');
    expect(voiceKey(cast)).toBe('lead=L,ask=A/eleven_v3/{"stability":0.5}');
    const recast = { ...cast, voices: [cast.voices[0], { name: 'ask', voiceId: 'B' }] } as const;
    expect(voiceKey(recast)).not.toBe(voiceKey(cast));
  });

  test('a dialogue alignment splits words where each line starts', () => {
    // The API joins the lines with nothing between them.
    const chars = [...'Stuck.So where?Yes.'];
    const at = chars.map((_, i) => i * 0.1);
    const words = Result.getOrThrow(
      wordsFromAlignment('Stuck. So where? Yes.', chars, at, at, [0, 6, 15]),
    );
    expect(words.map((w) => w.text)).toEqual(['Stuck.', 'So', 'where?', 'Yes.']);
    expect(words[1]?.start).toBeCloseTo(0.6);
  });

  test('a recorded take keeps its turns for the captions', () => {
    const parsed = read(line);
    const take = {
      hash: hashText(takeScript(parsed)),
      file: 'a.mp3',
      duration: 4,
      words: unmeasured(estimate(parsed.spoken)),
      source: 'elevenlabs' as const,
    };
    const voice = Result.getOrThrow(voiceFor('s', line, { voice: 'v', scenes: { s: take } }));
    expect(voice.recorded).toBe(true);
    expect(voice.turns).toEqual(parsed.turns);
    // The same words under the old, turnless hash are another take.
    const old = { ...take, hash: hashText(parsed.spoken) };
    expect(
      Result.getOrThrow(voiceFor('s', line, { voice: 'v', scenes: { s: old } })).recorded,
    ).toBe(false);
  });
});

describe('hashText', () => {
  // Takes and the score are keyed by this hash: a change to it re-records every take.
  test('is FNV-1a as eight hex digits, pinned', () => {
    expect(['', 'sheep', 'Hi there.'].map(hashText)).toEqual(['811c9dc5', '07cc25f4', '5b6d78ca']);
  });
});
