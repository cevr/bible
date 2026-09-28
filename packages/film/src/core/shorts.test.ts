import { describe, expect, test } from 'bun:test';
import { Array as Arr, Option, Result, Schema } from 'effect';
import { type Placed, layout } from './layout.ts';
import { hashText } from './narration.ts';
import { Shorts, type Short, type Timings } from './schema.ts';
import {
  type ResolvedShort,
  SHORT_LAYOUT,
  SHORT_PREROLL,
  hookAlpha,
  resolveShort,
  shortFilmTime,
  shortKey,
  shortPage,
  shortPieces,
} from './shorts.ts';

const draw = () => {};
/** No recorded takes: every scene is estimated. */
const noTakes: Timings = { voice: '', scenes: {} };
const placed = layout(
  [
    {
      id: 'a',
      say: 'One two {three}three four {five}five six.',
      timeline: { lift: { mark: 'three', dur: 0.6 } },
      draw,
    },
    { id: 'b', say: 'Seven {eight}eight nine ten.', draw },
  ],
  noTakes,
);
const a = Option.getOrThrow(Arr.get(placed, 0));
const b = Option.getOrThrow(Arr.get(placed, 1));
const fps = 30;

/** A mark's film time. */
const markAt = (p: Placed, name: string) =>
  p.start + p.speechStart + Option.getOrThrow(Option.fromNullishOr(p.voice.marks.get(name)));
/** A named cue, scene-local. */
const cueOf = (p: Placed, name: string) =>
  Option.getOrThrow(Option.fromNullishOr(p.cues.get(name)));
/** The `i`th span of a resolved short. */
const spanOf = (cut: ResolvedShort, i: number) => Option.getOrThrow(Arr.get(cut.spans, i));
const lengthOf = (span: { readonly from: number; readonly to: number }) => span.to - span.from;

const short = (spans: Short['spans']): Short => ({ id: 'cut', title: 'A cut', spans });
const resolved = (spans: Short['spans']) =>
  Result.getOrThrow(resolveShort(placed, short(spans), fps));

/** The failure's tag, or `ok`. */
const outcome = <A, E extends { readonly _tag: string }>(r: Result.Result<A, E>) =>
  Result.match(r, { onSuccess: () => 'ok', onFailure: (e) => e._tag });

const onFrame = (t: number) => Math.round(t * fps) / fps;

describe('shorts', () => {
  test('a span resolves its marks, cues and landmarks to film time, each on its frame', () => {
    const cut = resolved([
      { scene: 'a', from: { mark: 'three' }, to: { cue: 'lift' } },
      { scene: 'b', from: { scene: 'speech' }, to: { mark: 'eight' } },
    ]);
    const first = spanOf(cut, 0);
    const second = spanOf(cut, 1);
    expect(first.from).toBe(onFrame(markAt(a, 'three')));
    // A cue as the end of a span is the cue's end.
    expect(first.to).toBe(onFrame(a.start + cueOf(a, 'lift').end));
    expect(first.at).toBe(0);
    expect(second.from).toBe(onFrame(b.start + b.speechStart));
    // Back to back: the second starts where the first ends, in short time.
    expect(second.at).toBeCloseTo(lengthOf(first), 9);
    expect(cut.duration).toBeCloseTo(lengthOf(first) + lengthOf(second), 9);
    // Every span is a whole number of frames, so picture and sound cut alike.
    for (const s of cut.spans) expect(Math.abs((lengthOf(s) * fps) % 1)).toBeLessThan(1e-6);
  });

  test('a span that opens on a word opens SHORT_PREROLL before it is heard, not on the pause the aligner gave it', () => {
    // "So," aligned 0–0.9, heard from 0.6; "back" (the mark) aligned 0.9–2.3, heard from 1.9.
    const say = 'So, {back}back to it.';
    const heardAt: ReadonlyArray<readonly [number, number, number, number]> = [
      [0, 0.9, 0.6, 0.9],
      [0.9, 2.3, 1.9, 2.3],
      [2.3, 2.6, 2.3, 2.6],
      [2.6, 3, 2.6, 2.9],
    ];
    const words = say
      .replace('{back}', '')
      .split(' ')
      .map((text, i) => {
        const [start, end, on, off] = heardAt[i] ?? [0, 0, 0, 0];
        return { text, start, end, voiced: { start: on, end: off } };
      });
    const take = {
      hash: hashText('So, back to it.'),
      file: 'a.mp3',
      duration: 3,
      words,
      source: 'elevenlabs' as const,
    };
    const film = layout([{ id: 'a', say, lead: 0.5, draw }], { voice: 'v', scenes: { a: take } });
    const p = Option.getOrThrow(Arr.get(film, 0));
    const at = (spans: Short['spans']) => Result.getOrThrow(resolveShort(film, short(spans), fps));
    const voice = p.start + p.speechStart;
    // From the mark: the word's voice less the preroll, not its aligned 0.9.
    const marked = spanOf(
      at([{ scene: 'a', from: { mark: 'back' }, to: { scene: 'speechEnd' } }]),
      0,
    );
    expect(marked.from).toBe(onFrame(voice + 1.9 - SHORT_PREROLL));
    // From the speech: the first word's voice less the preroll.
    const spoken = at([{ scene: 'a', from: { scene: 'speech' }, to: { mark: 'back' } }]);
    expect(spanOf(spoken, 0).from).toBe(onFrame(voice + 0.6 - SHORT_PREROLL));
    // A span's end stays where it is marked; the scene's start is not a word.
    expect(spanOf(spoken, 0).to).toBe(onFrame(voice + 0.9));
    const whole = at([{ scene: 'a', from: { scene: 'start' }, to: { scene: 'end' } }]);
    expect(spanOf(whole, 0).from).toBe(onFrame(p.start));
  });

  test('a cue as the start of a span is its start, unless it names an edge', () => {
    const lift = cueOf(a, 'lift');
    const from = (point: Short['spans'][0]['from']) =>
      spanOf(resolved([{ scene: 'a', from: point, to: { scene: 'end' } }]), 0).from;
    expect(from({ cue: 'lift' })).toBe(onFrame(a.start + lift.start));
    expect(from({ cue: 'lift', edge: 'end' })).toBe(onFrame(a.start + lift.end));
  });

  test('an unknown scene, mark or cue, or an empty span, fails naming what the film has', () => {
    const tag = (spans: Short['spans']) => outcome(resolveShort(placed, short(spans), fps));
    expect(tag([{ scene: 'z', from: { scene: 'start' }, to: { scene: 'end' } }])).toBe(
      'ShortUnknownScene',
    );
    expect(tag([{ scene: 'a', from: { mark: 'nope' }, to: { scene: 'end' } }])).toBe(
      'ShortUnknownMark',
    );
    expect(tag([{ scene: 'a', from: { scene: 'start' }, to: { cue: 'nope' } }])).toBe(
      'ShortUnknownCue',
    );
    expect(tag([{ scene: 'a', from: { mark: 'five' }, to: { mark: 'three' } }])).toBe(
      'ShortSpanEmpty',
    );
    const error = Result.match(
      resolveShort(
        placed,
        short([{ scene: 'a', from: { mark: 'nope' }, to: { scene: 'end' } }]),
        fps,
      ),
      { onSuccess: () => '', onFailure: (e) => e.message },
    );
    expect(error).toBe('short "cut": scene "a" has no mark {nope}; its marks are {three} {five}');
  });

  const twoSpans = () =>
    resolved([
      { scene: 'b', from: { mark: 'eight' }, to: { scene: 'speechEnd' } },
      { scene: 'a', from: { mark: 'three' }, to: { mark: 'five' } },
    ]);

  test('short time maps to film time span by span', () => {
    const cut = twoSpans();
    const first = spanOf(cut, 0);
    const second = spanOf(cut, 1);
    expect(shortFilmTime(cut, 0)).toBe(first.from);
    expect(shortFilmTime(cut, 0.5)).toBeCloseTo(first.from + 0.5, 9);
    expect(shortFilmTime(cut, second.at)).toBe(second.from);
    expect(shortFilmTime(cut, second.at + 0.2)).toBeCloseTo(second.from + 0.2, 9);
  });

  test('a range of the short is the film pieces under it, in short order', () => {
    const cut = twoSpans();
    const first = spanOf(cut, 0);
    const second = spanOf(cut, 1);
    expect(shortPieces(cut, 0, cut.duration)).toEqual([
      { start: first.from, duration: lengthOf(first) },
      { start: second.from, duration: lengthOf(second) },
    ]);
    const tail = shortPieces(cut, lengthOf(first) - 0.1, lengthOf(first) + 0.1);
    expect(tail.length).toBe(2);
    expect(tail[0]?.start).toBeCloseTo(first.to - 0.1, 9);
    expect(tail[1]?.duration).toBeCloseTo(0.1, 9);
  });

  test('the hook is set from the first frame, held, then faded once', () => {
    const { hold, fade } = SHORT_LAYOUT.hook;
    expect(hold + fade).toBeGreaterThanOrEqual(2);
    expect(hold + fade).toBeLessThanOrEqual(3);
    expect(hookAlpha(0)).toBe(1);
    expect(hookAlpha(hold)).toBe(1);
    expect(hookAlpha(hold + fade / 2)).toBeCloseTo(0.5, 9);
    expect(hookAlpha(hold + fade)).toBeCloseTo(0, 9);
    expect(hookAlpha(hold + fade + 0.1)).toBe(0);
    expect(hookAlpha(40)).toBe(0);
  });

  test('the page is the film at its own density, 9:16, encoded to 1080×1920', () => {
    expect(shortPage(1920)).toEqual({ width: 1920, height: 3414, scale: 0.5625 });
    expect(shortPage(1080)).toEqual({ width: 1080, height: 1920, scale: 1 });
    expect(shortKey('film', 'cut')).toBe('film/shorts/cut');
  });

  test('shorts.ts decodes: ids are unique slugs and every short has a span', () => {
    const decode = Schema.decodeUnknownResult(Shorts);
    const span = { scene: 'a', from: { scene: 'start' }, to: { scene: 'end' } };
    const ok = (shorts: ReadonlyArray<object>) => Result.isSuccess(decode(shorts));
    expect(ok([{ id: 'one', title: 'One', spans: [span] }])).toBe(true);
    expect(ok([{ id: 'one', title: 'One', spans: [] }])).toBe(false);
    expect(ok([{ id: 'One Two', title: 'x', spans: [span] }])).toBe(false);
    expect(
      ok([
        { id: 'one', title: 'One', spans: [span] },
        { id: 'one', title: 'Again', spans: [span] },
      ]),
    ).toBe(false);
    // A point names one anchor.
    expect(
      ok([{ id: 'one', title: 'One', spans: [{ ...span, from: { mark: 'x', cue: 'y' } }] }]),
    ).toBe(false);
  });
});
