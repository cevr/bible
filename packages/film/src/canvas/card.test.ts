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
import { estimate } from '../core/narration.ts';
import { unmeasured } from '../core/voiced.ts';

const LINE = 'Job asked it: {job}How should man be just with God?';

/** The line's words as an estimate times them, heard over their spans, and its one mark. */
const voice = () => {
  const words = unmeasured(estimate('Job asked it: How should man be just with God?'));
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
    expect(words[0]?.at).toBeCloseTo(0.5 + (v.words[3]?.voiced.start ?? 0), 9);
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
      draw: () => void ran.push('scene'),
      card: {
        cue: 'card',
        from: 'job',
        payoff: 'just',
        flood: { cue: 'flood', from: () => ({ x: 800, y: 500, w: 300, h: 50 }) },
        draw: (_f, words) => void ran.push(`card:${words.length}`),
      },
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

  test('stops the film where the card names a payoff its line never says', () => {
    const scene = drawing({
      timeline: { card: { mark: 'job', dur: 1 } },
      draw: () => undefined,
      card: { cue: 'card', from: 'job', payoff: 'grace', draw: () => undefined },
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
