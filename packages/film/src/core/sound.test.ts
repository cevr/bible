import { describe, expect, test } from 'bun:test';
import { Option, Result, Schema } from 'effect';
import { filmEnd, layout } from './layout.ts';
import { UnknownCue, UnknownMark } from './errors.ts';
import { Cue, type Music, Score, type Timings } from './schema.ts';
import {
  MAX_CHUNK_MS,
  MUSIC_TAIL,
  movementSpans,
  cueTime,
  musicKey,
  musicPlan,
  playedOption,
  scoreOptions,
} from './sound.ts';

/** No recorded takes: every scene is estimated. */
const noTakes: Timings = { voice: '', scenes: {} };

/** The failure's tag, or `ok`. */
const outcome = <A, E extends { readonly _tag: string }>(r: Result.Result<A, E>) =>
  Result.match(r, { onSuccess: () => 'ok', onFailure: (e) => e._tag });

const draw = () => {};
const placed = Result.getOrThrow(
  layout(
    [
      {
        id: 'a',
        say: 'Look {live}and live.',
        lead: 0.5,
        tail: 1,
        timeline: { lift: { mark: 'live', offset: 0.2, dur: 0.6 } },
        draw,
      },
      { id: 'b', min: 4, draw },
      { id: 'c', min: 5, draw },
    ],
    noTakes,
  ),
);

const music: Music = {
  model: 'music_v2_5',
  styles: ['piano'],
  avoid: ['vocals'],
  movements: [
    { from: 'a', name: 'Open', styles: ['sparse'] },
    { from: 'c', name: 'Close', styles: ['warm'] },
  ],
};

describe('sound', () => {
  test('a cue lands on its mark, after the scene lead, plus its offset', () => {
    const a = placed[0];
    const live = a?.voice.marks.get('live') ?? NaN;
    expect(
      Result.getOrThrow(cueTime({ scene: 'a', mark: 'live', offset: 0.25 }, placed)),
    ).toBeCloseTo(0.5 + live + 0.25);
    expect(Result.getOrThrow(cueTime({ scene: 'c', at: 'start' }, placed))).toBe(
      placed[2]?.start ?? NaN,
    );
  });

  test('a named cue lands on the start or end of the cue the picture reads', () => {
    const lift = placed[0]?.cues.get('lift');
    const start = lift?.start ?? NaN;
    expect(Result.getOrThrow(cueTime({ scene: 'a', cue: 'lift' }, placed))).toBe(start);
    expect(
      Result.getOrThrow(cueTime({ scene: 'a', cue: 'lift', edge: 'end' }, placed)),
    ).toBeCloseTo(start + 0.6);
    expect(
      Result.getOrThrow(cueTime({ scene: 'a', cue: 'lift', offset: 0.1 }, placed)),
    ).toBeCloseTo(start + 0.1);
  });

  test('a landmark lands where the scene’s voice starts or ends, or on its start or end', () => {
    const a = placed[0];
    const at = (landmark: 'start' | 'speech' | 'speechEnd' | 'end') =>
      Result.getOrThrow(cueTime({ scene: 'a', at: landmark }, placed));
    expect(at('start')).toBe(0);
    expect(at('speech')).toBe(0.5);
    expect(at('speechEnd')).toBe(0.5 + (a?.voice.duration ?? NaN));
    expect(at('end')).toBe(a?.dur ?? NaN);
    expect(Result.getOrThrow(cueTime({ scene: 'b', at: 'speech', offset: 0.2 }, placed))).toBe(
      (placed[1]?.start ?? NaN) + 0.2,
    );
  });

  test('an unknown scene, mark or cue is an authoring error naming what the scene has', () => {
    expect(outcome(cueTime({ scene: 'z', at: 'start' }, placed))).toBe('UnknownScene');
    expect(Result.getFailure(cueTime({ scene: 'a', mark: 'nope' }, placed))).toEqual(
      Option.some(UnknownMark.make({ scene: 'a', mark: 'nope', by: 'sound', known: ['live'] })),
    );
    expect(Result.getFailure(cueTime({ scene: 'a', cue: 'nope' }, placed))).toEqual(
      Option.some(UnknownCue.make({ scene: 'a', cue: 'nope', by: 'sound', known: ['lift'] })),
    );
  });

  test('a cue names one point: a cue and a mark, or an edge on a mark, do not decode', () => {
    const decodes = (cue: Readonly<Record<string, string | number>>) =>
      Result.isSuccess(Schema.decodeUnknownResult(Cue)(cue));
    expect(decodes({ scene: 'a', cue: 'lift', mark: 'live' })).toBe(false);
    expect(decodes({ scene: 'a', mark: 'live', edge: 'end' })).toBe(false);
    expect(decodes({ scene: 'a', at: 'speech', cue: 'lift' })).toBe(false);
    expect(decodes({ scene: 'a', cue: 'lift', edge: 'end', offset: -0.1 })).toBe(true);
    expect(decodes({ scene: 'a', mark: 'live', word: 'live' })).toBe(true);
  });

  test('movements cover the whole film, split at their scenes, and the last runs past its end', () => {
    const plan = Result.getOrThrow(musicPlan(music, placed));
    const ms = plan.chunks.map((c) => c.duration_ms);
    // The composed ending lands after the cut, so the mix's fade-out, not the
    // music's own decay, is what the film's last seconds hear.
    expect(ms.reduce((x, y) => x + y, 0)).toBe(Math.round((filmEnd(placed) + MUSIC_TAIL) * 1000));
    expect(ms[0]).toBe(Math.round((placed[2]?.start ?? 0) * 1000));
  });

  test('every movement carries the film-wide styles ahead of its own', () => {
    const [open] = Result.getOrThrow(musicPlan(music, placed)).chunks;
    expect(open?.positive_styles).toEqual(['piano', 'sparse']);
    expect(open?.negative_styles).toEqual(['vocals']);
    expect(open?.text).toBe('[Open]');
  });

  test('a movement naming no scene is refused, the first one too', () => {
    const lost = { ...music, movements: [{ from: 'nowhere', name: 'Lost', styles: [] }] };
    expect(outcome(musicPlan(lost, placed))).toBe('UnknownScene');
  });

  test('movementSpans gives every movement its length or its refusal', () => {
    const three = {
      ...music,
      movements: [
        { from: 'a', name: 'Open', styles: [] },
        { from: 'b', name: 'Middle', styles: [] },
        { from: 'c', name: 'Close', styles: [] },
      ],
    };
    const spans = Result.getOrThrow(movementSpans(three, placed));
    expect(
      spans.map((r) => Result.match(r, { onSuccess: (a) => a.ms, onFailure: (e) => e._tag })),
    ).toEqual([
      // Scene a's take runs under the API's shortest chunk.
      'MovementTooShort',
      Math.round((placed[2]?.start ?? 0) * 1000) - Math.round((placed[1]?.start ?? 0) * 1000),
      Math.round((filmEnd(placed) + MUSIC_TAIL) * 1000) -
        Math.round((placed[2]?.start ?? 0) * 1000),
    ]);
  });

  test('a movement naming no scene fails as an act does: the first one, with what the film has', () => {
    const lost = movementSpans(
      {
        ...music,
        movements: [
          { from: 'x', name: 'X', styles: [] },
          { from: 'a', name: 'A', styles: [] },
        ],
      },
      placed,
    );
    expect(Result.getFailure(lost)).toMatchObject(
      Option.some({ _tag: 'UnknownScene', scene: 'x', known: ['a', 'b', 'c'] }),
    );
  });

  test('a movement out of film order fails as an act does, naming it', () => {
    const shuffled = {
      ...music,
      movements: [
        { from: 'a', name: 'one', styles: [] },
        { from: 'c', name: 'two', styles: [] },
        { from: 'b', name: 'three', styles: [] },
      ],
    };
    expect(Result.getFailure(movementSpans(shuffled, placed))).toMatchObject(
      Option.some({ _tag: 'PartOutOfOrder', part: 'three', from: 'b', after: 'two' }),
    );
    const backwards = { ...music, movements: [...music.movements].reverse() };
    expect(outcome(musicPlan(backwards, placed))).toBe('PartOutOfOrder');
  });

  test('a movement longer than the API composes in one chunk is refused', () => {
    const long = Result.getOrThrow(layout([{ id: 'a', min: 130 }], noTakes));
    const one = { ...music, movements: [{ from: 'a', name: 'Whole', styles: [] }] };
    expect(outcome(musicPlan(one, long))).toBe('MovementTooLong');
    expect(MAX_CHUNK_MS).toBe(120_000);
  });

  test('keys change with the request: the model and the plan', () => {
    const plan = Result.getOrThrow(musicPlan(music, placed));
    expect(musicKey({ ...music }, plan)).toBe(musicKey(music, plan));
    expect(musicKey({ ...music, model: 'music_v2' }, plan)).not.toBe(musicKey(music, plan));
  });
});

describe('score options', () => {
  const score: Score = {
    play: 'piano',
    under: -18,
    alone: -6,
    options: { piano: music, pads: { ...music, styles: ['pads'] } },
  };

  test('each option in the order declared; the mix plays the named one unless asked for another', () => {
    expect(scoreOptions(score).map((o) => o.name)).toEqual(['piano', 'pads']);
    const played = (asked: Option.Option<string>) =>
      Result.match(playedOption(score, asked), {
        onSuccess: (o) => o.name,
        onFailure: (e) => `${e._tag} ${e.known.join(',')}`,
      });
    expect(played(Option.none())).toBe('piano');
    expect(played(Option.some('pads'))).toBe('pads');
    expect(played(Option.some('organ'))).toBe('ScoreUnknown piano,pads');
  });

  test('a score must play one of its options', () => {
    const decode = Schema.decodeUnknownResult(Score);
    expect(Result.isSuccess(decode(score))).toBe(true);
    expect(Result.isFailure(decode({ ...score, play: 'organ' }))).toBe(true);
  });
});
