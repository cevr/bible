// A full-screen card (CRAFT rule 1) sets the take's own words, each as it is
// heard, the payoff large on its own line; over its cue it is the whole frame
// in place of the scene, hard cut in and out, and its flood grows from the
// highlight over the lit scene. A verse's phrase highlights in reading order
// and says where on the frame it sits. Laid out on estimates (no take), drawn
// into the stand-in.

import { describe, expect, test } from 'bun:test';
import { Result } from 'effect';
import { type CardStyle, cardWords, floodBox, fullCard, verse } from './card.ts';
import { createFilm, drawing } from './film.ts';
import { recorder, withDom } from './fixtures/stand-in.ts';
import { type ProbeSink, probing } from './probe.ts';
import { filmCaptions } from '../core/captions.ts';
import { estimate } from '../core/narration.ts';
import { voicedAt } from '../core/voiced.ts';

const LINE = 'Job asked it: {job}How should man be just with God?';

/**
 * The line's words as an estimate times them, each heard 0.15 s into its span
 * (as a take's are, its aligned start leading the voice), and its one mark at
 * the aligned start.
 */
const voice = () => {
  const words = estimate('Job asked it: How should man be just with God?').map((w) => ({
    ...w,
    voiced: voicedAt(w.start + 0.15, w.end),
  }));
  return { words, marks: new Map([['job', words[3]?.start ?? 0]]) };
};

const STYLE: CardStyle = {
  ground: '#0e1010',
  type: { family: 'x', size: 60, color: '#f2e9d7' },
  payoffScale: 2.5,
  payoffColor: '#e6b347',
};

/** A stand-in 1920 × 1080 context, every character 10 px a 60 px size (scaled with the font). */
const context = () =>
  recorder(1920, 1080, {
    measure: (font, text) => text.length * 0.5 * Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 10),
  });

const hand = () => ({ boil: 0, seed: 1 });

describe('cardWords', () => {
  test("sets the take's words from the mark, each at its voice, the payoff marked", () => {
    const v = voice();
    const words = Result.getOrThrow(cardWords('job', v, 0.5, { from: 'job', payoff: 'just' }));
    expect(words.map((w) => w.text)).toEqual([
      'How',
      'should',
      'man',
      'be',
      'just',
      'with',
      'God?',
    ]);
    expect(words.filter((w) => w.payoff).map((w) => w.text)).toEqual(['just']);
    // At the voice's onset, not the aligned start that leads it.
    expect(words[0]?.at).toBeCloseTo(0.5 + (v.words[3]?.start ?? 0) + 0.15, 9);
  });

  test('names the mark or the payoff the line lacks', () => {
    const v = voice();
    const lost = cardWords('job', v, 0, { from: 'nowhere', payoff: 'just' });
    expect(Result.isFailure(lost) && lost.failure).toContain('{nowhere}');
    const unsaid = cardWords('job', v, 0, { from: 'job', payoff: 'grace' });
    expect(Result.isFailure(unsaid) && unsaid.failure).toContain('"grace"');
  });
});

describe("the card's layout", () => {
  const words = Result.getOrThrow(cardWords('job', voice(), 0, { from: 'job', payoff: 'just' }));

  /** Every word the card sets, once all are heard, where the check reads it. */
  const setIn = (style: CardStyle) => {
    const { ctx } = context();
    const sink: ProbeSink = { texts: [], inks: [] };
    probing(ctx, { sink, scene: 'job', dx: 0, alpha: 1 }, () =>
      fullCard({ ctx, w: 1920, h: 1080, t: 99, hand }, words, style),
    );
    return sink.texts;
  };

  test('sets the payoff alone on its line at its scale, the lead-in inside the margins', () => {
    const set = setIn(STYLE);
    const payoff = set.find((x) => x.text === 'just');
    const lead = set.find((x) => x.text === 'How');
    expect((payoff?.w ?? 0) / (lead?.w ?? 1)).toBeCloseTo((4 / 3) * 2.5, 6);
    // Alone on its line: no other word shares its height on the frame.
    const across = (x: { y: number; h: number }) =>
      set.filter((o) => o.y < x.y + x.h && x.y < o.y + o.h);
    expect(across(payoff ?? { y: 0, h: 0 }).map((x) => x.text)).toEqual(['just']);
    for (const x of set) {
      expect(x.x).toBeGreaterThanOrEqual(1920 * 0.09 - 1e-9);
      expect(x.x + x.w).toBeLessThanOrEqual(1920 * 0.91 + 1e-9);
    }
    // Reading order, three lines: each below the one before.
    const tops = [...new Set(set.map((x) => x.y))];
    expect(tops).toEqual(tops.toSorted((a, b) => a - b));
    expect(tops).toHaveLength(3);
  });

  test('centres the block on the frame and cases the words as the look asks', () => {
    const set = setIn({ ...STYLE, case: 'lower', align: 'center' });
    const top = Math.min(...set.map((x) => x.y));
    const bottom = Math.max(...set.map((x) => x.y + x.h));
    expect(Math.abs((top + bottom) / 2 - 540)).toBeLessThan(60);
    const payoff = set.find((x) => x.text === 'just');
    expect((payoff?.x ?? 0) + (payoff?.w ?? 0) / 2).toBeCloseTo(960, 6);
    expect(set.at(-1)?.text).toBe('god?');
  });
});

describe('fullCard', () => {
  const words = Result.getOrThrow(cardWords('job', voice(), 0, { from: 'job', payoff: 'just' }));

  /** The words `fullCard` puts down at scene second `t`, as the check reads them. */
  const shownAt = (t: number, style: CardStyle = STYLE) => {
    const { ctx, fills } = context();
    const sink: ProbeSink = { texts: [], inks: [] };
    probing(ctx, { sink, scene: 'job', dx: 0, alpha: 1 }, () =>
      fullCard({ ctx, w: 1920, h: 1080, t, hand }, words, style),
    );
    return { texts: sink.texts.map((x) => x.text), fills };
  };

  test('grounds the whole frame and sets each word only once it is heard', () => {
    const before = shownAt((words[0]?.at ?? 0) - 0.01);
    expect(before.texts).toEqual([]);
    expect(before.fills[0]?.rect).toEqual([0, 0, 1920, 1080]);
    expect(before.fills[0]?.style).toBe('#0e1010');
    const mid = shownAt((words[4]?.at ?? 0) + 0.2);
    expect(mid.texts).toEqual(['How', 'should', 'man', 'be', 'just']);
    expect(shownAt(99).texts).toHaveLength(words.length);
  });

  test("draws the payoff's treatment once it is heard, with its box", () => {
    const boxes: Array<{ readonly since: number; readonly w: number }> = [];
    const style: CardStyle = {
      ...STYLE,
      treatment: { draw: (_ctx, box, since) => void boxes.push({ since, w: box.w }) },
    };
    shownAt((words[4]?.at ?? 0) - 0.01, style);
    expect(boxes).toEqual([]);
    shownAt((words[4]?.at ?? 0) + 0.3, style);
    expect(boxes).toHaveLength(1);
    expect(boxes[0]?.since).toBeCloseTo(0.3, 9);
    expect(boxes[0]?.w).toBe(4 * 0.5 * 150);
  });
});

describe('verse', () => {
  const v = {
    text: 'I know it is so of a truth: but how should man be just with God?',
    phrase: 'how should man be just with God?',
  };
  const style = {
    type: { family: 'x', size: 40, color: '#222' },
    width: 700,
    highlight: '#a7d7e8',
  };

  test("highlights the phrase in reading order and gives its box on the frame, through the context's transform", () => {
    const { ctx, fills } = context();
    ctx.translate(100, 50);
    ctx.scale(2, 2);
    const none = verse(ctx, v, style, { x: 0, y: 40, highlight: 0 }, hand());
    expect(fills.filter((f) => f.style === '#a7d7e8')).toHaveLength(0);
    const all = verse(ctx, v, style, { x: 0, y: 40, highlight: 1 }, hand());
    const lit = fills.filter((f) => f.style === '#a7d7e8');
    expect(lit).toHaveLength(7);
    expect(all).toEqual(none);
    // On the frame: the phrase's own box, through the context's transform.
    const plain = verse(context().ctx, v, style, { x: 0, y: 40, highlight: 1 }, hand());
    expect(all.x).toBeCloseTo(100 + 2 * plain.x, 9);
    expect(all.y).toBeCloseTo(50 + 2 * plain.y, 9);
    expect(all.w).toBeCloseTo(2 * plain.w, 9);
    expect(all.h).toBeCloseTo(2 * plain.h, 9);
    // The phrase runs over two lines; the box is its last line's alone.
    expect(new Set(lit.map((f) => f.rect[1])).size).toBe(2);
    expect(plain.h).toBeCloseTo(40 * 1.25, 9);
    const lastRow = lit.filter((f) => f.rect[1] === lit.at(-1)?.rect[1]);
    const span =
      Math.max(...lastRow.map((f) => f.rect[0] + f.rect[2])) -
      Math.min(...lastRow.map((f) => f.rect[0]));
    expect(all.w).toBeCloseTo(2 * span, 9);
    const half = recorder(1920, 1080);
    verse(half.ctx, v, style, { x: 0, y: 40, highlight: 0.5 }, hand());
    const swept = half.fills.filter((f) => f.style === '#a7d7e8');
    expect(swept.length).toBeGreaterThan(0);
    expect(swept.length).toBeLessThan(7);
  });

  test('sets the words the highlight covers again in its own ink, as the same lines, once it covers any', () => {
    const lines = (highlight: number) => {
      const sink: ProbeSink = { texts: [], inks: [] };
      const { ctx } = context();
      probing(ctx, { sink, scene: 'job', dx: 0, alpha: 1 }, () =>
        verse(ctx, v, { ...style, lit: '#fdf3dc' }, { x: 0, y: 40, highlight }, hand()),
      );
      return sink.texts.map((x) => [x.text, x.hand]);
    };
    const plain = lines(0);
    expect(plain.length).toBeGreaterThan(1);
    expect(lines(0.5)).toEqual([...plain, ...plain]);
  });

  test("joins a line's highlight into one bar when its pad meets across the spaces, and pads it above and below", () => {
    const { ctx, fills } = context();
    // A space is 20 px at this size: 10 each side meets the next word's.
    const box = verse(
      ctx,
      v,
      { ...style, pad: { x: 10, y: 6 } },
      { x: 0, y: 40, highlight: 1 },
      hand(),
    );
    const lit = fills.filter((f) => f.style === '#a7d7e8');
    expect(lit).toHaveLength(2);
    for (const f of lit) expect(f.rect[3]).toBeCloseTo(40 * 1.25 + 12, 9);
    // The flood's box is the joined bar of the last line.
    const last = lit.at(-1)?.rect ?? [0, 0, 0, 0];
    expect([box.x, box.y, box.w, box.h]).toEqual([...last]);
  });

  test('stops the frame where the phrase is not a run of the verse as printed', () => {
    const { ctx } = context();
    expect(() =>
      verse(
        ctx,
        { ...v, phrase: 'how shall man be just' },
        style,
        { x: 0, y: 40, highlight: 1 },
        hand(),
      ),
    ).toThrow('"how shall man be just"');
  });
});

test('a flood grows from its box to the whole frame', () => {
  const from = { x: 600, y: 500, w: 400, h: 60 };
  expect(floodBox(from, 1920, 1080, 0)).toEqual(from);
  expect(floodBox(from, 1920, 1080, 1)).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
});

describe('a scene with a card', () => {
  /** A film of one scene with a card over `card` and a flood over `flood`, logging which draws ran. */
  const carded = () => {
    const ran: string[] = [];
    const scene = drawing({
      timeline: {
        flood: { mark: 'job', dur: 0.3, ends: true },
        card: { mark: 'job', until: { at: 'speechEnd' }, untilOffset: 0.4 },
      },
      draw: () => {
        ran.push('scene');
        return { x: 800, y: 500, w: 300, h: 50 };
      },
      cards: [
        {
          cue: 'card',
          from: 'job',
          payoff: 'just',
          flood: { cue: 'flood' },
          draw: (_f, words) => void ran.push(`card:${words.length}`),
        },
      ],
    });
    const film = createFilm({
      title: 'card',
      paper: { base: '#fff', tone: '#000', seed: 1 },
      shade: '#000',
      scenes: [{ id: 'job', say: LINE, ...scene }],
    });
    return { film, ran };
  };

  test('is the card alone over its cue, the scene over its flood with the card on top, else the scene', () => {
    const { film, ran } = carded();
    const p = film.placed[0];
    const card = p?.cues.get('card') ?? { start: Number.NaN, end: Number.NaN };
    const flood = p?.cues.get('flood') ?? { start: Number.NaN, dur: Number.NaN };
    expect(card.end).toBeGreaterThan(card.start);
    expect(flood.dur).toBeGreaterThan(0);
    const at = (t: number) => {
      ran.length = 0;
      withDom(() => film.render(recorder().ctx, (p?.start ?? 0) + t), { record: false });
      // A scene's first frame may draw twice (its breath guessed, then known): once is what shows.
      return [...new Set(ran)];
    };
    expect(at(0.1)).toEqual(['scene']);
    expect(at(flood.start + flood.dur / 2)).toEqual(['scene', 'card:7']);
    expect(at(card.start + 0.01)).toEqual(['card:7']);
    expect(at(card.end - 0.01)).toEqual(['card:7']);
    expect(at(card.end + 0.01)).toEqual(['scene']);
  });

  /**
   * A film whose scene's highlight moves with the scene's time, and the
   * flood's clip at `at` (of the flood cue) once the frames at `before` were
   * drawn on the same film: the rect laid just before the card is drawn.
   */
  const floodAt = (
    at: (flood: { readonly start: number; readonly end: number }) => number,
    before: ReadonlyArray<number>,
  ) => {
    const log: Array<string | ReadonlyArray<number>> = [];
    const scene = drawing({
      timeline: {
        flood: { mark: 'job', dur: 0.6, ends: true },
        card: { mark: 'job', until: { at: 'speechEnd' }, untilOffset: 0.4 },
      },
      draw: (f) => ({ x: 100 + 400 * f.t, y: 500, w: 300, h: 50 }),
      cards: [
        {
          cue: 'card',
          from: 'job',
          payoff: 'just',
          flood: { cue: 'flood' },
          draw: () => void log.push('card'),
        },
      ],
    });
    const film = createFilm({
      title: 'card',
      paper: { base: '#fff', tone: '#000', seed: 1 },
      shade: '#000',
      scenes: [{ id: 'job', say: LINE, ...scene }],
    });
    const { ctx } = recorder();
    Object.assign(ctx, { rect: (...box: ReadonlyArray<number>) => void log.push(box) });
    const flood = film.placed[0]?.cues.get('flood') ?? { start: Number.NaN, end: Number.NaN };
    withDom(
      () => {
        for (const t of before) film.render(ctx, t);
        log.length = 0;
        film.render(ctx, at(flood));
      },
      { record: false },
    );
    return { clip: log[log.indexOf('card') - 1], flood };
  };

  test("grows its flood from the box the scene's draw returned on the same frame, whatever was drawn before", () => {
    const mid = (c: { start: number; end: number }) => (c.start + c.end) / 2;
    const early = (c: { start: number; end: number }) => c.start + 0.05;
    const alone = floodAt(mid, []).clip;
    expect(alone).toBeDefined();
    expect(floodAt(mid, [0.1, 3, 1.2]).clip).toEqual(alone);
    expect(floodAt(early, []).clip).not.toEqual(alone);
    // At the flood's start the clip is the box this frame's draw returned, exactly.
    const { clip, flood } = floodAt((c) => c.start, [2.5]);
    expect(clip).toEqual([100 + 400 * flood.start, 500, 300, 50]);
  });

  test('stops the frame where a flood holds but the scene drew no box to grow it from', () => {
    const scene = drawing({
      timeline: { flood: { mark: 'job', dur: 0.5, ends: true }, card: { mark: 'job', dur: 1 } },
      draw: () => undefined,
      cards: [
        {
          cue: 'card',
          from: 'job',
          payoff: 'just',
          flood: { cue: 'flood' },
          draw: () => undefined,
        },
      ],
    });
    const film = createFilm({
      title: 'card',
      paper: { base: '#fff', tone: '#000', seed: 1 },
      shade: '#000',
      scenes: [{ id: 'job', say: LINE, ...scene }],
    });
    const flood = film.placed[0]?.cues.get('flood') ?? { start: Number.NaN, dur: Number.NaN };
    expect(() =>
      withDom(() => film.render(recorder().ctx, flood.start + flood.dur / 2), { record: false }),
    ).toThrow('no box to flood from');
  });

  /** A captioned film of one scene whose card holds to its end and paints only a 5 px mark, no ground. */
  const bare = () => {
    const scene = drawing({
      timeline: { card: { mark: 'job', until: { at: 'end' } } },
      draw: (f) => void f.ctx.fillRect(0, 0, 1920, 1080),
      cards: [
        {
          cue: 'card',
          from: 'job',
          payoff: 'just',
          draw: (f) => void f.ctx.fillRect(10, 10, 5, 5),
        },
      ],
    });
    return createFilm({
      title: 'card',
      paper: { base: '#fff', tone: '#000', seed: 1 },
      shade: '#000',
      scenes: [{ id: 'job', say: LINE, ...scene }],
      captions: { font: '500 38px "x"', color: '#000', plate: '#fff' },
    });
  };

  test("lays the film's paper under the card, so a card frame is the same whatever was drawn before it", () => {
    const at = (film: ReturnType<typeof bare>, before: ReadonlyArray<number>) => {
      const card = film.placed[0]?.cues.get('card') ?? { start: Number.NaN };
      const r = recorder(1920, 1080);
      withDom(() => {
        for (const T of before) film.render(r.ctx, T);
        r.ops.length = 0;
        film.render(r.ctx, card.start + 0.2);
      });
      // Canvases told apart by size, not by the order they were made.
      return r.ops.map((op) =>
        op._tag === 'Image' ? { ...op, image: [op.image.width, op.image.height] } : op,
      );
    };
    const fresh = at(bare(), []);
    // First the paper, whole and opaque, at the identity: then the look's card.
    expect(fresh[0]).toMatchObject({
      _tag: 'Image',
      image: [1920, 1080],
      alpha: 1,
      comp: 'source-over',
    });
    expect(fresh[1]).toMatchObject({ _tag: 'Fill', rect: [10, 10, 5, 5] });
    expect(at(bare(), [0.1, 0.4])).toEqual(fresh);
  });

  test('draws no caption over a card, the caption track keeping the line', () => {
    const film = bare();
    const card = film.placed[0]?.cues.get('card') ?? { start: Number.NaN };
    const captioned = (T: number) => {
      const sink: ProbeSink = { texts: [], inks: [] };
      withDom(() => film.render(recorder().ctx, T, { captions: true, probe: sink }), {
        record: false,
      });
      return sink.texts.filter((x) => x.caption === true).map((x) => x.text);
    };
    expect(captioned(card.start - 0.1).length).toBeGreaterThan(0);
    expect(captioned(card.start + 0.1)).toEqual([]);
    expect(captioned(card.start + 1)).toEqual([]);
    const track = filmCaptions(film.placed, { from: 0, to: film.duration });
    expect(track.some((c) => c.text.includes('just') && c.end > card.start)).toBe(true);
  });

  test('leaves as the card when it holds to its scene end and the next scene enters on a transition', () => {
    const ran: string[] = [];
    const job = drawing({
      timeline: { card: { mark: 'job', until: { at: 'end' } } },
      draw: () => void ran.push('job'),
      cards: [{ cue: 'card', from: 'job', payoff: 'just', draw: () => void ran.push('card') }],
    });
    const next = drawing({ timeline: {}, draw: () => void ran.push('next') });
    const film = createFilm({
      title: 'card',
      paper: { base: '#fff', tone: '#000', seed: 1 },
      shade: '#000',
      scenes: [
        { id: 'job', say: LINE, ...job },
        { id: 'next', say: 'And then the next.', enter: { kind: 'fade', dur: 1 }, ...next },
      ],
    });
    const at = film.placed[1]?.start ?? Number.NaN;
    withDom(() => film.render(recorder().ctx, at + 0.5), { record: false });
    expect(new Set(ran)).toEqual(new Set(['card', 'next']));
  });

  test('stops the film where a flood would fall inside its way in, where it is never drawn', () => {
    const job = drawing({
      timeline: {
        flood: { at: 'start', dur: 0.3 },
        card: { mark: 'job', until: { at: 'end' } },
      },
      draw: () => ({ x: 0, y: 0, w: 10, h: 10 }),
      cards: [
        {
          cue: 'card',
          from: 'job',
          payoff: 'just',
          flood: { cue: 'flood' },
          draw: () => undefined,
        },
      ],
    });
    const first = drawing({ timeline: {}, draw: () => undefined });
    expect(() =>
      createFilm({
        title: 'card',
        paper: { base: '#fff', tone: '#000', seed: 1 },
        shade: '#000',
        scenes: [
          { id: 'first', say: 'First a line.', ...first },
          { id: 'job', say: LINE, enter: { kind: 'fade', dur: 1 }, ...job },
        ],
      }),
    ).toThrow('way in');
  });

  test('refuses an edit that moves the flood into its way in, as the film is refused it', () => {
    const job = drawing({
      timeline: {
        flood: { mark: 'job', dur: 0.3 },
        card: { mark: 'job', until: { at: 'end' } },
      },
      draw: () => ({ x: 0, y: 0, w: 10, h: 10 }),
      cards: [
        {
          cue: 'card',
          from: 'job',
          payoff: 'just',
          flood: { cue: 'flood' },
          draw: () => undefined,
        },
      ],
    });
    const first = drawing({ timeline: {}, draw: () => undefined });
    const film = createFilm({
      title: 'card',
      paper: { base: '#fff', tone: '#000', seed: 1 },
      shade: '#000',
      scenes: [
        { id: 'first', say: 'First a line.', ...first },
        { id: 'job', say: LINE, enter: { kind: 'fade', dur: 1 }, ...job },
      ],
    });
    expect(Result.isSuccess(film.edit('job', {}))).toBe(true);
    const moved = film.edit('job', { timeline: { flood: { at: 'start', dur: 0.3 } } });
    expect(Result.isFailure(moved) && moved.failure._tag).toBe('FloodInTransition');
    expect(Result.isFailure(moved) && moved.failure.message).toContain('way in');
  });

  test('eases the vignette in out of a card, which has none, rather than laying it on at once', () => {
    const job = drawing({
      timeline: { card: { mark: 'job', until: { at: 'end' } } },
      draw: () => undefined,
      cards: [
        {
          cue: 'card',
          from: 'job',
          payoff: 'just',
          draw: (f) => void f.ctx.fillRect(10, 10, 5, 5),
        },
      ],
    });
    const next = drawing({ timeline: {}, draw: () => undefined });
    const film = createFilm({
      title: 'card',
      paper: { base: '#fff', tone: '#000', seed: 1 },
      shade: '#000',
      scenes: [
        { id: 'job', say: LINE, ...job },
        { id: 'next', say: 'And then the next.', enter: { kind: 'fade', dur: 1 }, ...next },
      ],
    });
    const at = film.placed[1]?.start ?? Number.NaN;
    /** The alpha of each multiply over the whole frame at `T`. */
    const shades = (T: number) => {
      const r = recorder(1920, 1080);
      withDom(() => film.render(r.ctx, T));
      return r.ops.flatMap((op) =>
        op._tag === 'Image' && op.comp === 'multiply' && op.image.width === 1920 ? [op.alpha] : [],
      );
    };
    expect(shades(at - 0.02)).toEqual([]);
    for (const a of shades(at + 0.01)) expect(a).toBeLessThan(0.01);
    const mid = shades(at + 0.5);
    expect(mid.length).toBeGreaterThan(0);
    for (const a of mid) expect(a).toBeCloseTo(0.5, 2);
    expect(shades(at + 1.5)).toEqual([1]);
  });

  test("draws its flood within the look's own edge where it names one, at the box the flood has grown to", () => {
    const masks: Array<readonly [{ x: number; y: number; w: number; h: number }, number]> = [];
    const ran: string[] = [];
    const scene = drawing({
      timeline: {
        flood: { mark: 'job', dur: 0.6, ends: true },
        card: { mark: 'job', until: { at: 'speechEnd' }, untilOffset: 0.4 },
      },
      draw: () => ({ x: 100, y: 500, w: 300, h: 50 }),
      cards: [
        {
          cue: 'card',
          from: 'job',
          payoff: 'just',
          flood: {
            cue: 'flood',
            mask: (ctx, box, at) => {
              masks.push([box, at]);
              ran.push(`mask:${ctx.globalCompositeOperation}`);
            },
          },
          draw: () => void ran.push('card'),
        },
      ],
    });
    const film = createFilm({
      title: 'card',
      paper: { base: '#fff', tone: '#000', seed: 1 },
      shade: '#000',
      scenes: [{ id: 'job', say: LINE, ...scene }],
    });
    const flood = film.placed[0]?.cues.get('flood') ?? { start: Number.NaN, end: Number.NaN };
    withDom(() => film.render(recorder(1920, 1080).ctx, (flood.start + flood.end) / 2), {
      record: false,
    });
    // The card first, then the look's edge keeping it (destination-in).
    expect(ran).toEqual(['card', 'mask:destination-in']);
    const [box, at] = masks[0] ?? [{ x: 0, y: 0, w: 0, h: 0 }, Number.NaN];
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(1);
    expect(box).toEqual(floodBox({ x: 100, y: 500, w: 300, h: 50 }, 1920, 1080, at));
  });

  test('stops the film where the card names a payoff its line never says', () => {
    const scene = drawing({
      timeline: { card: { mark: 'job', dur: 1 } },
      draw: () => undefined,
      cards: [{ cue: 'card', from: 'job', payoff: 'grace', draw: () => undefined }],
    });
    expect(() =>
      createFilm({
        title: 'card',
        paper: { base: '#fff', tone: '#000', seed: 1 },
        shade: '#000',
        scenes: [{ id: 'job', say: LINE, ...scene }],
      }),
    ).toThrow('"grace"');
  });
});
