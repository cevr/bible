import { sceneMoments } from '../core/moments.ts';
import { describe, expect, test } from 'bun:test';
import { Array as Arr, Option, Result } from 'effect';
import { DEFAULT_TAIL, MIN_LEAD, layout } from '../core/layout.ts';
import { hashText, parse, takeScript, voiceKey } from '../core/narration.ts';
import type { Cast, Music, Probed, Sound, Timed, Timings } from '../core/schema.ts';
import { stroke } from '../canvas/ink.ts';
import { type ProbeSink, probing } from '../canvas/probe.ts';
import { effectKey, filmEnd, musicKey, musicPlan } from '../core/sound.ts';
import {
  type FrameFinding,
  HOLD,
  type Sample,
  effectFindings,
  farPins,
  frameFindings,
  heldStill,
  holdCandidates,
  holdGrid,
  holdTicks,
  layoutLevel,
  lateCues,
  layoutSamples,
  longSeams,
  MAX_SEAM,
  seamAfter,
  mergeFindings,
  musicFindings,
  overlapArea,
  pastFrame,
  staleTakes,
  STILL_DRIFT,
  staticFindings,
  stillSpan,
  unknownVoices,
} from './check.ts';
import { StaticHold } from './errors.ts';
import {
  holdScenes,
  holdTimings,
  inkMark,
  spokenTake,
  stubContext,
  testFilm,
  testVoice,
  textBox,
} from './testing.ts';

const frame = { width: 1920, height: 1080 };
const noTakes: Timings = { voice: '', scenes: {} };
const sample: Sample = { scene: 'a', frame: 30, time: 1, at: 'mark go' };
const tags = (fs: ReadonlyArray<{ readonly _tag: string }>) => fs.map((f) => f._tag);
/** Every finding but the ending's: these fixtures are too short for end screens (`check-ending.test.ts`). */
const besideEnding = (r: { readonly finding: { readonly _tag: string } }) =>
  r.finding._tag !== 'EndShort';

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

describe('a plate and the lines it carries', () => {
  // The declared card: one plate, three lines on it, and a line from elsewhere.
  const card = 'Justify / δικαιόω / declared righteous';
  const plate = inkMark('plate', [
    [650, 375],
    [1270, 375],
    [1270, 705],
    [650, 705],
  ]);
  const lines = [
    textBox(card, 650, 375, 620, 330, { order: 1 }),
    textBox('Justify', 800, 420, 320, 70, { order: 2, on: 1 }),
    textBox('δικαιόω', 820, 510, 280, 60, { order: 3, on: 1 }),
    textBox('declared righteous', 700, 600, 520, 60, { order: 4, on: 1 }),
  ];

  test('a plate carrying three lines does not collide with them', () => {
    expect(frameFindings(sample, { texts: lines, inks: [plate] }, frame)).toEqual([]);
  });

  test('a line from elsewhere over the plate does', () => {
    const stray = textBox('Let there be light', 1130, 505, 130, 60, { order: 5 });
    const found = frameFindings(sample, { texts: [...lines, stray], inks: [plate] }, frame);
    expect(found).toMatchObject([{ _tag: 'TextOverlap', a: card, b: 'Let there be light' }]);
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
    const marked = { ...city, hand: 11 };
    const strike = rule(204, { marks: [11] });
    expect(frameFindings(sample, { texts: [marked], inks: [strike] }, frame)).toEqual([]);
    const other = textBox('1888', 1300, 196, 120, 30, { order: 6, hand: 12 });
    expect(tags(frameFindings(sample, { texts: [marked, other], inks: [strike] }, frame))).toEqual([
      'InkOverText',
    ]);
  });

  test('marks binds to the one line it names, not to every line with the same words', () => {
    // Two GUILTY stamps; the strike is declared for the first and runs through the second.
    const first = textBox('GUILTY', 300, 400, 300, 60, { order: 5, hand: 21 });
    const second = textBox('GUILTY', 1200, 400, 300, 60, { order: 5, hand: 22 });
    const strike = inkMark(
      'stroke',
      [
        [1150, 430],
        [1550, 432],
      ],
      { order: 6, width: 12, marks: [21] },
    );
    const found = frameFindings(sample, { texts: [first, second], inks: [strike] }, frame);
    expect(tags(found)).toEqual(['InkOverText']);
    expect(found[0]).toMatchObject({ text: 'GUILTY', x: 1150 });
  });

  test('a wide stroke counts its width: 40 px of ink whose centre passes above 12 px text covers it', () => {
    const small = textBox('small print', 800, 500, 200, 12, { order: 5 });
    // Centre line 10 px above the text's top: the stroke's lower half covers 10 of its 12 px.
    const band = (width: number) =>
      inkMark(
        'stroke',
        [
          [700, 490],
          [1100, 490],
        ],
        { order: 6, width },
      );
    expect(tags(frameFindings(sample, { texts: [small], inks: [band(40)] }, frame))).toEqual([
      'InkOverText',
    ]);
    // A thin one on the same line stays clear of it.
    expect(frameFindings(sample, { texts: [small], inks: [band(8)] }, frame)).toEqual([]);
  });

  test('page texture is light AND thin: a light bar as wide as the letters under them is found', () => {
    // 0.5 opacity, drawn before the text, but 70 px wide across 28 px letters.
    const bar = rule(204, { alpha: 0.5, width: 70 });
    expect(tags(frameFindings(sample, { texts: [city], inks: [bar] }, frame))).toEqual([
      'InkOverText',
    ]);
    // The same light ink as a rule a third of the letters' height or less is texture.
    const greeked = rule(204, { alpha: 0.5, width: 9 });
    expect(frameFindings(sample, { texts: [city], inks: [greeked] }, frame)).toEqual([]);
  });

  test('ink at 0.3 opacity or less does not read over text and is not checked; above it is', () => {
    const over = (alpha: number) => rule(204, { alpha, order: 6 });
    expect(frameFindings(sample, { texts: [city], inks: [over(0.3)] }, frame)).toEqual([]);
    expect(tags(frameFindings(sample, { texts: [city], inks: [over(0.31)] }, frame))).toEqual([
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

  test('a plate over the text hides the edge of a wide stroke whose centre runs beside it', () => {
    // A caption on its plate, and a 60 px arm drawn before it whose centre
    // line runs 20 px below the plate: only the arm's edge reaches the words,
    // and the plate covers exactly that edge.
    const caption = textBox('and in the darkened void', 700, 960, 520, 60, { order: 5 });
    const plate = inkMark(
      'plate',
      [
        [700, 960],
        [1220, 960],
        [1220, 1020],
        [700, 1020],
      ],
      { order: 4 },
    );
    const arm = inkMark(
      'stroke',
      [
        [600, 1040],
        [1300, 1040],
      ],
      { order: 2, width: 60 },
    );
    expect(frameFindings(sample, { texts: [caption], inks: [arm, plate] }, frame)).toEqual([]);
    // Without the plate, its edge is over the words.
    expect(tags(frameFindings(sample, { texts: [caption], inks: [arm] }, frame))).toEqual([
      'InkOverText',
    ]);
  });

  test('fills over a stroke fade it by their opacity: hidden once what shows is 0.3 or less', () => {
    // A blanket fading out over an arm: at 0.74 the arm shows at 0.26 and
    // does not read; at 0.5 it shows at 0.5 and does; two 0.5 layers leave 0.25.
    const blanket = (alpha: number, order: number) =>
      inkMark(
        'fill',
        [
          [680, 180],
          [1240, 180],
          [1240, 230],
          [680, 230],
        ],
        { order, alpha },
      );
    const shown = (inks: ReadonlyArray<ReturnType<typeof inkMark>>) =>
      tags(frameFindings(sample, { texts: [city], inks: [rule(200), ...inks] }, frame));
    expect(shown([blanket(0.74, 4)])).toEqual([]);
    expect(shown([blanket(0.5, 4)])).toEqual(['InkOverText']);
    expect(shown([blanket(0.5, 4), blanket(0.5, 4.5)])).toEqual([]);
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

  test('a banner half the frame high but narrow is not a backdrop: cut by the edge, it is found', () => {
    // 300 × 600, 100 px past the right edge.
    const banner = inkMark(
      'fill',
      [
        [1720, 200],
        [2020, 200],
        [2020, 800],
        [1720, 800],
      ],
      { order: 1 },
    );
    const found = frameFindings(
      sample,
      { texts: [textBox('VERDICT', 1740, 480, 150, 40, { order: 2 })], inks: [banner] },
      frame,
    );
    expect(found).toMatchObject([{ _tag: 'PlateOffFrame', text: 'VERDICT', right: 100 }]);
  });

  test('a plate with no text on it, a backdrop, a panel half the frame wide and high, or text drawn before it, is not', () => {
    // One half of a split page: 960 wide, the frame's height and more.
    const panel = inkMark(
      'fill',
      [
        [1000, 340],
        [2010, 340],
        [2010, 1120],
        [1000, 1120],
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

  test('text wholly off the frame shows nothing, so the plate under it is not cut off', () => {
    // A room slid away left: its sheet still shows 10 px at the edge, its words are gone.
    const sheet = inkMark(
      'fill',
      [
        [-890, 340],
        [10, 340],
        [10, 1120],
        [-890, 1120],
      ],
      { order: 0 },
    );
    const gone = textBox('far away', -574, 402, 169, 39, { order: 2 });
    expect(frameFindings(sample, { texts: [gone], inks: [sheet] }, frame)).toEqual([]);
  });

  test('a band that runs past both opposite edges spans the frame: it may bleed', () => {
    // A stripe of sky the frame's width and 60 px more each side, a quote on it.
    const band = (left: number) =>
      inkMark(
        'fill',
        [
          [left, 170],
          [1980, 170],
          [1980, 430],
          [left, 430],
        ],
        { order: 1 },
      );
    const quote = textBox('must the Son of man be lifted up.', 549, 220, 822, 58, { order: 2 });
    expect(frameFindings(sample, { texts: [quote], inks: [band(-60)] }, frame)).toEqual([]);
    // Past one edge only, the same band is cut off.
    expect(tags(frameFindings(sample, { texts: [quote], inks: [band(40)] }, frame))).toEqual([
      'PlateOffFrame',
    ]);
  });
});

describe('text off its plate', () => {
  // A storyboard card declared as a plate, and its brief's line on it.
  const card = textBox('(the card)', 360, 250, 1200, 520, { order: 1 });
  const brief = (w: number, on = 1) =>
    textBox('a brief too long for its card', 420, 700, w, 40, { order: 2, on });

  test('a line running off the plate it is drawn on is a finding', () => {
    const found = frameFindings(sample, { texts: [card, brief(1300)], inks: [] }, frame);
    expect(found).toMatchObject([{ _tag: 'TextOffPlate', text: 'a brief too long for its card' }]);
    expect(found[0]).toMatchObject({ right: 160, left: 0, top: 0, bottom: 0 });
  });

  test('a line inside its plate, or past it by no more than the tolerance, is not', () => {
    expect(frameFindings(sample, { texts: [card, brief(1080)], inks: [] }, frame)).toEqual([]);
    expect(frameFindings(sample, { texts: [card, brief(1143)], inks: [] }, frame)).toEqual([]);
  });

  test('text over scenery (a fill it was not drawn on) has no plate to run off', () => {
    const sky = inkMark('fill', [
      [0, 0],
      [1920, 0],
      [1920, 400],
      [0, 400],
    ]);
    const quote = textBox('over the horizon', 800, 370, 400, 60, { order: 1 });
    expect(frameFindings(sample, { texts: [quote], inks: [sky] }, frame)).toEqual([]);
  });
});

describe('mergeFindings', () => {
  test('one finding per pair and scene: the worst sample, counting every frame that shows it', () => {
    const at = (time: number, dy: number): FrameFinding => {
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
    // Its own tail, so the 60% point falls after the cue whatever the default.
    {
      id: 'one',
      say: 'Hello {go}there friend',
      tail: 1,
      timeline: { pop: { mark: 'go', dur: 0.5 } },
    },
    { id: 'two', say: 'And {late}then', enter: { kind: 'fade', dur: 1 }, lead: 0.2, tail: 0.3 },
  ];
  const placed = layout(scenes, noTakes);

  test('every mark, cue edge and the 60% point, as frames inside the scene', () => {
    const one = layoutSamples(placed, 30).filter((s) => s.scene === 'one');
    expect(one.map((s) => s.at)).toEqual(['mark go, cue pop start', 'cue pop end', '60%']);
    for (const s of one) expect(s.time).toBeCloseTo(s.frame / 30);
  });

  test('without marks, as the look-book takes them: cue edges and the 60% point', () => {
    const one = sceneMoments(placed, 30, { marks: false }).filter((s) => s.scene === 'one');
    expect(one.map((s) => s.at)).toEqual(['cue pop start', 'cue pop end', '60%']);
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

const take = (text: string) => ({
  hash: hashText(text),
  file: 'x.mp3',
  duration: 2,
  words: [],
  source: 'elevenlabs' as const,
});
const cast: Cast = {
  model: 'eleven_v3',
  settings: { stability: 0.5 },
  voices: [
    { name: 'lead', voiceId: 'L' },
    { name: 'ask', voiceId: 'A' },
  ],
};

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

  test("a person's take outlives a change of staging voice, and goes stale with its text", () => {
    const read = { ...take('Still the same'), source: 'recorded' as const };
    const edited = { ...take('Now it says'), source: 'recorded' as const };
    const film = testFilm(scenes, { voice: 'someone-else', scenes: { kept: read, edited } });
    expect(staleTakes(film).map((s) => [s.scene, s.reason, s.recorded])).toEqual([
      ['edited', 'text changed', true],
      ['new', 'missing', false],
    ]);
  });

  test('a take read by a cast goes stale when a turn moves', () => {
    const said = 'Declared? {@ask}But he is guilty.';
    const recorded: Timings = {
      voice: voiceKey(cast),
      scenes: { d: take(takeScript(parse(said))) },
    };
    const film = (say: string) => testFilm([{ id: 'd', say }], recorded, cast);
    expect(staleTakes(film(said))).toEqual([]);
    expect(staleTakes(film('Declared? But {@ask}he is guilty.')).map((s) => s.reason)).toEqual([
      'text changed',
    ]);
  });
});

describe('unknownVoices', () => {
  test('a line handed to a voice the film does not have', () => {
    const scenes: ReadonlyArray<Timed> = [
      { id: 'ok', say: 'One. {@ask}Two.' },
      { id: 'lost', say: 'One. {@narrator}Two.' },
      { id: 'quiet' },
    ];
    const found = unknownVoices(testFilm(scenes, noTakes, cast));
    expect(found.map((f) => [f.scene, f.voice, f.known])).toEqual([
      ['lost', 'narrator', ['lead', 'ask']],
    ]);
    expect(unknownVoices(testFilm(scenes, noTakes)).map((f) => f.scene)).toEqual(['ok', 'lost']);
  });

  test('is an error in the static check, beside the take it cannot record', () => {
    const scenes: ReadonlyArray<Timed> = [{ id: 'lost', say: 'One. {@narrator}Two.' }];
    const film = testFilm(scenes, noTakes, cast);
    const found = staticFindings(
      film,
      layout(scenes, noTakes),
      { allowStale: true },
      Option.none(),
    );
    expect(found.filter(besideEnding).map((r) => [r.level, r.finding._tag])).toEqual([
      ['error', 'UnknownVoice'],
      ['warning', 'TakeStale'],
    ]);
  });
});

describe('farPins', () => {
  const scene = (word: string): Timed => ({
    id: 's',
    say: 'One {m}two faith. Three four. Five faith six. Seven.',
    timeline: { lit: { mark: 'm', word, dur: 0.5 } },
  });

  test('a word pin in its mark’s sentence or the next is quiet', () => {
    expect(farPins(layout([scene('two')], noTakes))).toEqual([]);
    expect(farPins(layout([scene('faith')], noTakes))).toEqual([]);
    expect(farPins(layout([scene('four')], noTakes))).toEqual([]);
  });

  test('a word pin that lands more than a sentence past its mark warns, naming how far', () => {
    const found = farPins(layout([scene('six')], noTakes));
    expect(found.map((f) => [f._tag, f.scene, f.cue, f.word, f.sentences])).toEqual([
      ['WordPinFar', 's', 'lit', 'six', 2],
    ]);
    expect(found[0]?.message).toBe(
      'scene "s": cue "lit" is pinned to "six", 2 sentences past {m}: a re-take that dropped the word near the mark moves the cue there',
    );
    const reported = staticFindings(
      testFilm([scene('six')], noTakes),
      layout([scene('six')], noTakes),
      { allowStale: false },
      Option.none(),
    );
    expect(reported.filter((r) => r.finding._tag === 'WordPinFar').map((r) => r.level)).toEqual([
      'warning',
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

describe('longSeams', () => {
  const said = (id: string, extra: Partial<Timed> = {}): Timed => ({
    id,
    say: 'One two three four.',
    ...extra,
  });

  test('a default lead stretched by a long entrance makes a seam over 0.6 s', () => {
    const placed = layout([said('a'), said('b', { enter: { kind: 'fade', dur: 1.2 } })], noTakes);
    const found = longSeams(placed);
    expect(found.map((f) => [f._tag, f.from, f.to])).toEqual([['SeamLong', 'a', 'b']]);
    expect(found[0]?.seam).toBeCloseTo(0.94);
  });

  test('a declared lead or tail is a meant pause; the default seam is 0.6 s', () => {
    const fade = { kind: 'fade', dur: 1.2 } as const;
    expect(longSeams(layout([said('a'), said('b', { enter: fade, lead: 1 })], noTakes))).toEqual(
      [],
    );
    expect(
      longSeams(layout([said('a', { tail: 1 }), said('b', { enter: fade })], noTakes)),
    ).toEqual([]);
    expect(longSeams(layout([said('a'), said('b')], noTakes))).toEqual([]);
  });

  test('a min the words outrun declares nothing; a min that stretches the scene does', () => {
    const fade = { kind: 'fade', dur: 1.2 } as const;
    const short = longSeams(layout([said('a', { min: 1 }), said('b', { enter: fade })], noTakes));
    expect(short.map((f) => [f.from, f.to])).toEqual([['a', 'b']]);
    expect(
      longSeams(layout([said('a', { min: 30 }), said('b', { enter: fade })], noTakes)),
    ).toEqual([]);
  });

  test('the default seam is the layout default lead plus its default tail', () => {
    expect(MAX_SEAM).toBe(MIN_LEAD + DEFAULT_TAIL);
    const [a, b] = layout([said('a'), said('b')], noTakes);
    expect(Option.getOrThrow(seamAfter(a!, b!))).toBeCloseTo(MAX_SEAM);
  });

  test('a scene with no words between two voices is a pause of its own', () => {
    const placed = layout([said('a'), { id: 'title', min: 3 }, said('b')], noTakes);
    expect(longSeams(placed)).toEqual([]);
  });

  test('is a warning in the static check', () => {
    const scenes = [said('a'), said('b', { enter: { kind: 'fade', dur: 1.2 } })];
    const film = testFilm(scenes, noTakes);
    const found = staticFindings(
      film,
      layout(scenes, noTakes),
      { allowStale: true },
      Option.none(),
    );
    expect(found.filter((r) => r.finding._tag === 'SeamLong').map((r) => r.level)).toEqual([
      'warning',
    ]);
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
      staticFindings(film, placed, { allowStale: false }, Option.none())
        .filter(besideEnding)
        .map((r) => [r.level, r.finding._tag]),
    ).toEqual([
      ['error', 'TakeStale'],
      ['warning', 'AssetMissing'],
    ]);
  });

  test('--allow-stale turns stale work into warnings', () => {
    expect(
      staticFindings(film, placed, { allowStale: true }, Option.none())
        .filter(besideEnding)
        .map((r) => r.level),
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
    staticFindings(film, placed, { allowStale }, master)
      .filter(besideEnding)
      .map((r) => [r.level, r.finding._tag]);

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
    const tagsOf = staticFindings(unrecorded, laid, { allowStale: true }, Option.none())
      .filter(besideEnding)
      .map((r) => r.finding._tag);
    expect(tagsOf).toEqual(['TakeStale']);
  });
});

describe('static holds', () => {
  const placed = layout(holdScenes, holdTimings);
  const seven = 'one two three four five six seven';

  test('a spoken stretch over HOLD with no cue is a candidate; one of 3 s is not', () => {
    const found = holdCandidates(placed);
    expect(found.map((c) => c.scene)).toEqual(['held', 'ambient']);
    const [held] = found;
    expect(held?.from).toBeCloseTo(1.4);
    expect(held?.to).toBeCloseTo(6.4);
    expect(HOLD).toBe(4);
  });

  test('the stretch is the spoken words, not the whole scene: a long silent end holds nothing', () => {
    // Words 0.5–3.9 s, then 10 s of scene with no cue and no voice.
    const scenes: ReadonlyArray<Timed> = [{ id: 'a', say: seven, min: 14 }];
    const timings: Timings = { voice: holdTimings.voice, scenes: { a: spokenTake(seven) } };
    expect(holdCandidates(layout(scenes, timings))).toEqual([]);
  });

  test('a cue running through the words, or the scene arriving, is motion', () => {
    const say = Option.getOrThrow(Option.fromUndefinedOr(Arr.getUnsafe(holdScenes, 0).say));
    const scenes: ReadonlyArray<Timed> = [
      { id: 'first', say },
      {
        id: 'a',
        say,
        enter: { kind: 'fade', dur: 1.5 },
        timeline: { drift: { scene: 'start', offset: 4, dur: 1 } },
      },
    ];
    const timings: Timings = {
      voice: holdTimings.voice,
      scenes: { first: spokenTake(say), a: spokenTake(say) },
    };
    // `first` speaks 0.5–6.4 s with nothing declared; `a` fades in to 1.5 s and drifts at 4–5 s.
    expect(holdCandidates(layout(scenes, timings)).map((c) => c.scene)).toEqual(['first']);
  });

  test('a storyboard card holds still by design and is never a candidate', () => {
    const card: Timed = { ...Arr.getUnsafe(holdScenes, 0), storyboard: true };
    expect(holdCandidates(layout([card], holdTimings))).toEqual([]);
  });

  test('the ticks span the stretch a boil tick apart, from its first frame to its last', () => {
    const ticks = holdTicks({ from: 1.4, to: 6.4 }, 30);
    expect(ticks.slice(0, 5)).toEqual([42, 45, 47, 50, 52]);
    expect(Arr.last(ticks)).toEqual(Option.some(191));
    expect(ticks).toHaveLength(61);
  });

  test('the grid is a tick every HOLD / 2, and the last; any run over HOLD spans two in a row', () => {
    expect(holdGrid(holdTicks({ from: 1.4, to: 6.4 }, 30))).toEqual([42, 102, 162, 191]);
    const every = Arr.range(0, 99);
    const grid = holdGrid(every);
    for (const lo of Arr.range(0, 51)) {
      const run = every.slice(lo, lo + 49);
      expect(grid.filter((g) => run.includes(g)).length).toBeGreaterThanOrEqual(2);
    }
  });

  test('a still run covers the stretch to an edge it reaches, else its still ticks', () => {
    const ticks = holdTicks({ from: 1.4, to: 6.4 }, 30);
    expect(stillSpan({ from: 1.4, to: 6.4 }, ticks, 42, 191, 30)).toEqual([1.4, 6.4]);
    expect(stillSpan({ from: 1.4, to: 6.4 }, ticks, 57, 150, 30)).toEqual([1.9, 5]);
  });

  const card = textBox('A MOST PRECIOUS MESSAGE', 600, 300, 700, 80);
  const figure = inkMark('fill', [
    [900, 500],
    [1000, 500],
    [1000, 800],
  ]);
  const shifted = (dx: number) => ({ ...figure, x: figure.x + dx });
  const first = { texts: [card], inks: [figure] };

  test('frames that differ only by boil hold still', () => {
    const boiled = { texts: [{ ...card, x: card.x + 0.6 }], inks: [shifted(1.1)] };
    expect(heldStill([first, boiled])).toBe(true);
  });

  test('a mark that drifts, fades or appears is motion', () => {
    expect(heldStill([first, { texts: [card], inks: [shifted(6)] }])).toBe(false);
    const faded = { texts: [card], inks: [{ ...figure, alpha: 0.5 }] };
    expect(heldStill([first, faded])).toBe(false);
    expect(heldStill([first, { texts: [card], inks: [figure, figure] }])).toBe(false);
  });

  test('the captions are the voice, not the picture: a new caption line is not motion', () => {
    const line = (text: string, w: number) => {
      const box = textBox(text, 960 - w / 2, 960, w, 60, { order: 5, caption: true });
      const plate = inkMark(
        'plate',
        [
          [box.x, box.y],
          [box.x + box.w, box.y],
          [box.x + box.w, box.y + box.h],
          [box.x, box.y + box.h],
        ],
        { order: 4, caption: true },
      );
      return { box, plate };
    };
    const a = line('one two three', 400);
    const b = line('four five six seven', 520);
    expect(
      heldStill([
        { texts: [card, a.box], inks: [figure, a.plate] },
        { texts: [card, b.box], inks: [figure, b.plate] },
      ]),
    ).toBe(true);
  });

  test('D1: a stroke that only boils holds still at any zoom (drift in its own units)', () => {
    const drawnAt = (zoom: number, boil: number, dy = 0): Probed => {
      const sink: ProbeSink = { texts: [], inks: [] };
      const ctx = stubContext(zoom);
      probing(ctx, { sink, scene: 'a', dx: 0, alpha: 1 }, () =>
        stroke(
          ctx,
          [
            [100, 100 + dy],
            [300, 140 + dy],
            [500, 120 + dy],
          ],
          { color: '#000', width: 6 },
          { boil, seed: 7 },
        ),
      );
      return sink;
    };
    for (const zoom of [1, 1.5, 2.3, 4]) {
      const moved = Arr.range(1, 23).filter(
        (b) => !heldStill([drawnAt(zoom, 0), drawnAt(zoom, b)]),
      );
      expect({ zoom, moved }).toEqual({ zoom, moved: [] });
      // Moved a few of its own px further than boil can, it moves, however far the camera is.
      expect(heldStill([drawnAt(zoom, 0), drawnAt(zoom, 0, 3 * STILL_DRIFT)])).toBe(false);
    }
  });

  test('D5: a picture line that reads as a caption line is still the picture', () => {
    // The card writes the words as they are heard, over the caption line saying the same.
    const caption = textBox('one two three', 760, 960, 400, 60, { order: 5, caption: true });
    const growing = (w: number) => textBox('one two three', 600, 300, w, 80);
    const frames = [
      { texts: [growing(200), caption], inks: [] },
      { texts: [growing(500), caption], inks: [] },
    ];
    expect(heldStill(frames)).toBe(false);
  });

  test('a static hold is a warning, every other layout finding an error', () => {
    const hold = StaticHold.make({ scene: 'held', from: 1.4, to: 6.4, max: HOLD });
    expect(layoutLevel(hold)).toBe('warning');
    expect(hold.message).toContain('scene "held" 1.40–6.40s');
    const found = frameFindings(
      sample,
      { texts: [textBox('a', 0, 0, 100, 40), textBox('b', 0, 10, 100, 40)], inks: [] },
      frame,
    );
    expect(found.map(layoutLevel)).toEqual(['error']);
  });
});
