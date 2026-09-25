import { describe, expect, test } from 'bun:test';
import { Array as Arr, Option, Result } from 'effect';
import { layout } from '../core/layout.ts';
import { hashText, voiceKey } from '../core/narration.ts';
import type { Music, Sound, Timed, Timings } from '../core/schema.ts';
import { effectKey, filmEnd, musicKey, musicPlan } from '../core/sound.ts';
import {
  type LayoutFinding,
  type Sample,
  effectFindings,
  frameFindings,
  lateCues,
  layoutSamples,
  mergeFindings,
  musicFindings,
  overlapArea,
  pastFrame,
  staleTakes,
  staticFindings,
} from './check.ts';
import { inkMark, testFilm, testVoice, textBox } from './testing.ts';

const frame = { width: 1920, height: 1080 };
const noTakes: Timings = { voice: '', scenes: {} };
const sample: Sample = { scene: 'a', frame: 30, time: 1, at: 'mark go' };
const tags = (fs: ReadonlyArray<{ readonly _tag: string }>) => fs.map((f) => f._tag);

describe('overlapArea', () => {
  test('two lines drawn over each other share their common box', () => {
    expect(overlapArea(textBox('a', 0, 0, 100, 40), textBox('b', 50, 20, 100, 40))).toBeCloseTo(
      50 * 20,
    );
  });

  test('lines that meet by no more than the tolerance do not overlap', () => {
    expect(overlapArea(textBox('a', 0, 0, 100, 40), textBox('b', 0, 37, 100, 40))).toBe(0);
    expect(overlapArea(textBox('a', 0, 0, 100, 40), textBox('b', 97, 0, 100, 40))).toBe(0);
    expect(overlapArea(textBox('a', 0, 0, 100, 40), textBox('b', 0, 60, 100, 40))).toBe(0);
  });

  test('two stacked lines of a turned stamp stay apart, though their upright boxes overlap', () => {
    // "A MOST PRECIOUS" over "MESSAGE", both turned -0.2 rad about the stamp's middle.
    const turn = -0.2;
    const top = textBox('A MOST PRECIOUS', 560, 400, 800, 70, { rot: turn });
    const under = textBox('MESSAGE', 760, 480, 400, 70, { rot: turn });
    expect(top.y + top.h).toBeGreaterThan(under.y);
    expect(overlapArea(top, under)).toBe(0);
  });

  test('turned boxes that do cross still collide', () => {
    const a = textBox('a', 0, 0, 200, 50, { rot: 0.3 });
    const b = textBox('b', 20, 10, 200, 50, { rot: 0.3 });
    expect(overlapArea(a, b)).toBeGreaterThan(1000);
  });
});

describe('pastFrame', () => {
  test('a line cut off by an edge reaches past it', () => {
    expect(pastFrame(textBox('far', 1850, 500, 200, 40), 1920, 1080)).toEqual({
      left: 0,
      top: 0,
      right: 130,
      bottom: 0,
    });
  });

  test('a line wholly outside the frame is gone, not cut off', () => {
    const none = { left: 0, top: 0, right: 0, bottom: 0 };
    expect(pastFrame(textBox('far away', -740, 400, 170, 40), 1920, 1080)).toEqual(none);
    expect(pastFrame(textBox('merit', 1900, 1380, 150, 60), 1920, 1080)).toEqual(none);
  });
});

describe('frameFindings', () => {
  test('reports text over text and text off the frame, with where it was sampled', () => {
    const found = frameFindings(
      sample,
      {
        texts: [
          textBox('light', 960, 200, 200, 80),
          textBox('“Let there be light”', 200, 170, 850, 90),
          textBox('edge', -30, 900, 120, 40),
        ],
        inks: [],
      },
      frame,
    );
    expect(tags(found)).toEqual(['TextOverlap', 'TextOffFrame']);
    const [overlap] = found;
    expect(overlap).toMatchObject({
      scene: 'a',
      time: 1,
      at: 'mark go',
      a: 'light',
      b: '“Let there be light”',
      frames: 1,
    });
  });

  test('a fading line, or the same text twice, is not a collision', () => {
    const found = frameFindings(
      sample,
      {
        texts: [
          textBox('empty', 1400, 600, 150, 60, { alpha: 0.25 }),
          textBox('a gift', 1400, 600, 170, 70),
          textBox('a gift', 1402, 601, 170, 70),
          textBox('gone', -30, 900, 120, 40, { alpha: 0.1 }),
        ],
        inks: [],
      },
      frame,
    );
    expect(found).toEqual([]);
  });
});

describe('ink over text', () => {
  // MINNEAPOLIS under a masthead: its box, and a rule drawn through it.
  const city = textBox('MINNEAPOLIS', 700, 190, 520, 28, { order: 5 });
  const rule = (y: number, options: Parameters<typeof inkMark>[2] = {}) =>
    inkMark(
      'stroke',
      [
        [340, y],
        [800, y + 1],
        [1580, y],
      ],
      { order: 3, ...options },
    );

  test('a stroke through a line of text is a finding, measured along the crossing', () => {
    const found = frameFindings(sample, { texts: [city], inks: [rule(200), rule(212)] }, frame);
    expect(tags(found)).toEqual(['InkOverText']);
    expect(found[0]).toMatchObject({ text: 'MINNEAPOLIS', strokes: 2 });
    // Each rule runs the box's full width, 520 px: 2 × ~520.
    expect(found[0]).toMatchObject({ length: expect.closeTo(1040, -2) });
  });

  test('the segment test, not the bounds: a stroke whose box overlaps but whose line passes by is fine', () => {
    // A bend round the box's top-left corner: its bounds reach into the box, its line never does.
    const past = inkMark(
      'stroke',
      [
        [600, 100],
        [705, 170],
        [660, 240],
      ],
      { order: 3 },
    );
    expect(frameFindings(sample, { texts: [city], inks: [past] }, frame)).toEqual([]);
  });

  test('a stroke that grazes the box by no more than the tolerance, or is faint, is fine', () => {
    const grazing = rule(190 - 1, { width: 4 });
    const faint = rule(200, { alpha: 0.2 });
    expect(frameFindings(sample, { texts: [city], inks: [grazing, faint] }, frame)).toEqual([]);
  });

  test('light ink under the text is page texture; the same ink over it strikes it', () => {
    const greeked = rule(204, { alpha: 0.35 });
    expect(frameFindings(sample, { texts: [city], inks: [greeked] }, frame)).toEqual([]);
    const over = rule(204, { alpha: 0.35, order: 6 });
    expect(tags(frameFindings(sample, { texts: [city], inks: [over] }, frame))).toEqual([
      'InkOverText',
    ]);
  });

  test('a stroke that marks the text on purpose may cross it; another text it crosses is still found', () => {
    const strike = rule(204, { marks: 'MINNEAPOLIS' });
    expect(frameFindings(sample, { texts: [city], inks: [strike] }, frame)).toEqual([]);
    const other = textBox('1888', 1300, 196, 120, 30, { order: 6 });
    expect(tags(frameFindings(sample, { texts: [city, other], inks: [strike] }, frame))).toEqual([
      'InkOverText',
    ]);
  });

  test('a plate drawn over the stroke hides it; a plate drawn under it does not', () => {
    const plate = (order: number) =>
      inkMark(
        'plate',
        [
          [680, 180],
          [1240, 180],
          [1240, 230],
          [680, 230],
        ],
        { order },
      );
    expect(frameFindings(sample, { texts: [city], inks: [rule(200), plate(4)] }, frame)).toEqual(
      [],
    );
    expect(
      tags(frameFindings(sample, { texts: [city], inks: [plate(2), rule(200)] }, frame)),
    ).toEqual(['InkOverText']);
  });
});

describe('plates off the frame', () => {
  const tag = (x: number, order = 1) =>
    inkMark(
      'fill',
      [
        [x, 500],
        [x + 300, 500],
        [x + 300, 580],
        [x, 580],
      ],
      { order },
    );

  test('a plate carrying text, cut by the edge, is a finding', () => {
    const found = frameFindings(
      sample,
      { texts: [textBox('merit', 1700, 520, 120, 40, { order: 2 })], inks: [tag(1680)] },
      frame,
    );
    expect(found).toMatchObject([{ _tag: 'PlateOffFrame', text: 'merit' }]);
    expect(found[0]).toMatchObject({ right: 60 });
  });

  test('a plate with no text on it, a backdrop, a panel half the frame high, or text drawn before it, is not', () => {
    const panel = inkMark(
      'fill',
      [
        [1110, 340],
        [2010, 340],
        [2010, 1120],
        [1110, 1120],
      ],
      { order: 1 },
    );
    expect(
      frameFindings(
        sample,
        { texts: [textBox('far away', 1420, 400, 170, 40, { order: 2 })], inks: [panel] },
        frame,
      ),
    ).toEqual([]);
    const sheet = inkMark(
      'fill',
      [
        [-50, -40],
        [1980, -40],
        [1980, 1100],
        [-50, 1100],
      ],
      { order: 1 },
    );
    const found = frameFindings(
      sample,
      {
        texts: [
          textBox('sky', 900, 500, 120, 40, { order: 2 }),
          textBox('under', 1700, 520, 90, 40),
        ],
        inks: [tag(1680), sheet],
      },
      frame,
    );
    expect(found).toEqual([]);
  });

  test('a plate on its way in or out is not: it moves by the next frame, or its text is past the edge too', () => {
    const merit = textBox('merit', 1700, 520, 120, 40, { order: 2 });
    const moving = frameFindings(sample, { texts: [merit], inks: [tag(1680)] }, frame, {
      texts: [{ ...merit, x: 1680 }],
      inks: [tag(1660)],
    });
    expect(moving).toEqual([]);
    const leaving = frameFindings(
      sample,
      { texts: [textBox('merit', 1880, 520, 120, 40, { order: 2 })], inks: [tag(1860)] },
      frame,
    );
    expect(tags(leaving)).toEqual(['TextOffFrame']);
  });
});

describe('mergeFindings', () => {
  test('one finding per pair and scene: the worst sample, counting every frame that shows it', () => {
    const at = (time: number, dy: number): LayoutFinding => {
      const found = frameFindings(
        { ...sample, time },
        { texts: [textBox('a', 0, 0, 100, 40), textBox('b', 0, dy, 100, 40)], inks: [] },
        frame,
      );
      return Option.getOrThrow(Arr.head(found));
    };
    const merged = mergeFindings([at(1, 30), at(2, 10), at(3, 20)]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ _tag: 'TextOverlap', time: 2, frames: 3 });
  });
});

describe('layoutSamples', () => {
  const scenes: ReadonlyArray<Timed> = [
    { id: 'one', say: 'Hello {go}there friend', timeline: { pop: { mark: 'go', dur: 0.5 } } },
    { id: 'two', say: 'And {late}then', enter: { kind: 'fade', dur: 1 }, lead: 0.2, tail: 0.3 },
  ];
  const placed = layout(scenes, noTakes);

  test('every mark, cue edge and the 60% point, as frames inside the scene', () => {
    const one = layoutSamples(placed, 30).filter((s) => s.scene === 'one');
    expect(one.map((s) => s.at)).toEqual(['mark go, cue pop start', 'cue pop end', '60%']);
    for (const s of one) expect(s.time).toBeCloseTo(s.frame / 30);
  });

  test('a moment inside the entering transition waits for it to settle', () => {
    const [two] = placed.slice(1);
    const late = layoutSamples(placed, 30).find((s) => s.at.includes('mark late'));
    // {late} falls 0.2 s into a 1 s fade: sampled on the first settled frame.
    expect(late?.frame).toBe(Math.ceil(((two?.start ?? 0) + 1) * 30 - 1e-6));
  });
});

// ---------------------------------------------------------------------------
// Static

const take = (text: string) => ({ hash: hashText(text), file: 'x.mp3', duration: 2, words: [] });

describe('staleTakes', () => {
  const scenes: ReadonlyArray<Timed> = [
    { id: 'kept', say: 'Still {m}the same' },
    { id: 'edited', say: 'Now it says more' },
    { id: 'new', say: 'Never read' },
    { id: 'quiet' },
  ];
  const timings: Timings = {
    voice: voiceKey(testVoice),
    scenes: { kept: take('Still the same'), edited: take('Now it says') },
  };

  test('a missing take, and a take of other text, are stale; marks never are', () => {
    expect(staleTakes(testFilm(scenes, timings)).map((s) => [s.scene, s.reason])).toEqual([
      ['edited', 'text changed'],
      ['new', 'missing'],
    ]);
  });

  test('another voice makes every take stale', () => {
    const film = testFilm(scenes, { ...timings, voice: 'someone-else' });
    expect(staleTakes(film).map((s) => s.reason)).toEqual([
      'voice changed',
      'voice changed',
      'missing',
    ]);
  });
});

describe('lateCues', () => {
  test('a cue that ends after its scene', () => {
    const placed = layout(
      [{ id: 's', min: 4, timeline: { ok: { scene: 'start', dur: 4 }, over: { scene: 'end' } } }],
      noTakes,
    );
    expect(lateCues(placed)).toEqual([]);
    const late = layout(
      [{ id: 's', min: 4, timeline: { over: { scene: 'end', offset: -0.5, dur: 1 } } }],
      noTakes,
    );
    expect(lateCues(late).map((c) => [c.scene, c.cue, c.end])).toEqual([['s', 'over', 4.5]]);
  });
});

const soundScenes: ReadonlyArray<Timed> = [
  { id: 'open', min: 8, timeline: { hit: { scene: 'start', offset: 1 } } },
  { id: 'middle', min: 2 },
  { id: 'close', min: 8 },
];
const placedSound = layout(soundScenes, noTakes);
const music = (acts: Music['acts']): Music => ({
  model: 'music_v2',
  styles: [],
  avoid: [],
  acts,
  gain: 0.5,
});

describe('musicFindings', () => {
  const inOrder = music([
    { from: 'open', name: 'Opening', styles: [] },
    { from: 'close', name: 'Closing', styles: [] },
  ]);
  const hash = musicKey(inOrder, Result.getOrThrow(musicPlan(inOrder, placedSound)));

  test('a current score is fine; a re-timed one is stale; an unmade one is missing', () => {
    expect(
      musicFindings(inOrder, placedSound, { music: { hash, file: 'm.mp3' }, effects: {} }),
    ).toEqual([]);
    const stale = musicFindings(inOrder, placedSound, {
      music: { hash: 'old', file: 'm.mp3' },
      effects: {},
    });
    expect(stale).toMatchObject([
      { _tag: 'AssetStale', asset: 'music', stored: 'old', wanted: hash },
    ]);
    expect(tags(musicFindings(inOrder, placedSound, { effects: {} }))).toEqual(['AssetMissing']);
  });

  test('every act out of order or under 3 s is reported, not just the first', () => {
    const found = musicFindings(
      music([
        { from: 'open', name: 'Opening', styles: [] },
        { from: 'close', name: 'Closing', styles: [] },
        { from: 'middle', name: 'Middle', styles: [] },
        { from: 'middle', name: 'Coda', styles: [] },
      ]),
      placedSound,
      { effects: {} },
    );
    const acts = found.map((f) => {
      if (f._tag === 'ActTooShort') return [f._tag, f.act];
      return [f._tag];
    });
    expect(acts).toEqual([
      ['ActTooShort', 'Closing'],
      ['ActTooShort', 'Middle'],
    ]);
  });

  test('an act naming no scene', () => {
    const found = musicFindings(
      music([{ from: 'nowhere', name: 'Lost', styles: [] }]),
      placedSound,
      { effects: {} },
    );
    expect(found).toMatchObject([{ _tag: 'UnknownScene', scene: 'nowhere' }]);
  });
});

describe('effectFindings', () => {
  test('every placement naming an unknown scene, cue or mark, and every stale effect', () => {
    const hit = { prompt: 'a hit', secs: 1, at: [{ scene: 'open', cue: 'hit' }] };
    const sound: Sound = {
      effects: {
        hit,
        lost: {
          prompt: 'lost',
          secs: 1,
          at: [
            { scene: 'nowhere' },
            { scene: 'open', cue: 'nope' },
            { scene: 'open', mark: 'nope' },
          ],
        },
      },
    };
    const found = effectFindings(sound, placedSound, {
      effects: { hit: { hash: effectKey(hit), file: 'h.mp3' }, lost: { hash: 'x', file: 'l.mp3' } },
    });
    expect(tags(found)).toEqual(['UnknownScene', 'UnknownCue', 'UnknownMark', 'AssetStale']);
  });
});

describe('staticFindings', () => {
  const film = {
    ...testFilm(soundScenes, { voice: '', scenes: {} }),
    scenes: [...soundScenes, { id: 'said', say: 'Words' }],
    sound: Option.some<Sound>({
      effects: { hit: { prompt: 'a hit', secs: 1, at: [{ scene: 'open', cue: 'hit' }] } },
    }),
  };
  const placed = layout(film.scenes, film.timings);

  test('stale work is an error, an unmade sound a warning', () => {
    expect(
      staticFindings(film, placed, { allowStale: false }, Option.none()).map((r) => [
        r.level,
        r.finding._tag,
      ]),
    ).toEqual([
      ['error', 'TakeStale'],
      ['warning', 'AssetMissing'],
    ]);
  });

  test('--allow-stale turns stale work into warnings', () => {
    expect(
      staticFindings(film, placed, { allowStale: true }, Option.none()).map((r) => r.level),
    ).toEqual(['warning', 'warning']);
  });
});

describe('the audio master', () => {
  const scenes: ReadonlyArray<Timed> = [
    { id: 'said', say: 'Hi there.' },
    { id: 'quiet', min: 3 },
  ];
  const recorded: Timings = { voice: voiceKey(testVoice), scenes: { said: take('Hi there.') } };
  const film = testFilm(scenes, recorded);
  const placed = layout(scenes, recorded);
  const end = filmEnd(placed);
  const found = (master: Option.Option<number>, allowStale = false) =>
    staticFindings(film, placed, { allowStale }, master).map((r) => [r.level, r.finding._tag]);

  test('a master as long as the film, within a frame, passes', () => {
    expect(found(Option.some(end))).toEqual([]);
    expect(found(Option.some(end + 0.01))).toEqual([]);
  });

  test('no master, once every take is recorded, is AudioMissing', () => {
    expect(found(Option.none())).toEqual([['error', 'AudioMissing']]);
  });

  test('a master cut short by an interrupted mix, or mixed for another cut, is AudioStale', () => {
    expect(found(Option.some(end - 1))).toEqual([['error', 'AudioStale']]);
    expect(found(Option.some(end + 1))).toEqual([['error', 'AudioStale']]);
  });

  test('--allow-stale reports them as warnings', () => {
    expect(found(Option.none(), true)).toEqual([['warning', 'AudioMissing']]);
    expect(found(Option.some(end - 1), true)).toEqual([['warning', 'AudioStale']]);
  });

  test('a film with a take still to record has no master to check', () => {
    const unrecorded = testFilm(scenes, noTakes);
    const laid = layout(scenes, noTakes);
    const tagsOf = staticFindings(unrecorded, laid, { allowStale: true }, Option.none()).map(
      (r) => r.finding._tag,
    );
    expect(tagsOf).toEqual(['TakeStale']);
  });
});
