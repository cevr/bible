// A film's finish and caption plate are data a film declares; a value the
// canvas cannot draw (a zero-sized grain tile, no tiles, an opacity past 1)
// fails where the film is made, naming the field, never at the first frame
// or silently in it. Laying out a film needs no DOM, so bun can make one.

import { describe, expect, test } from 'bun:test';
import { type Drift, camera } from './camera.ts';
import { type CaptionStyle, type FilmSpec, type FinishStyle, createFilm, drawing } from './film.ts';
import { recorder, withDom } from './fixtures/stand-in.ts';

const spec = (finish: FinishStyle = {}, plate?: Partial<CaptionStyle>): FilmSpec => ({
  title: 'probe',
  paper: { base: '#fff', tone: '#000', seed: 1 },
  shade: '#000',
  scenes: [{ id: 'a', say: 'A line.', draw: () => undefined }],
  finish,
  captions: { font: '10px x', color: '#000', plate: '#fff', ...plate },
});

describe('createFilm finish and caption plate', () => {
  test('takes the defaults and any value the canvas can draw', () => {
    expect(() => createFilm(spec())).not.toThrow();
    expect(() =>
      createFilm(
        spec(
          { vignette: 0, grain: 1, grainSize: 128, grainTiles: 1 },
          { plateOpacity: 1, plateHeight: 0, platePadding: 0, plateRadius: 0, bottom: 0 },
        ),
      ),
    ).not.toThrow();
  });

  test('lays the screen grain as a faint film layer: the paper carries its own grain', () => {
    expect(createFilm(spec()).look.finish.grain).toBe(0.03);
    expect(createFilm(spec({ grain: 0.2 })).look.finish.grain).toBe(0.2);
  });

  test("takes a scene's own drift, or none, and refuses one the camera cannot take", () => {
    const drifting = (drift: Drift | 0): FilmSpec => ({
      ...spec(),
      scenes: [{ id: 'a', say: 'A line.', draw: () => undefined, drift }],
    });
    expect(() => createFilm(drifting(0))).not.toThrow();
    expect(() => createFilm(drifting({ zoom: 0.01, x: 8 }))).not.toThrow();
    expect(() => createFilm(drifting({ zoom: Number.NaN, x: 0 }))).toThrow('zoom');
    expect(() => createFilm(drifting({ zoom: -1, x: 0 }))).toThrow('zoom');
  });

  test.each([
    ['grainSize', { grainSize: 0 }],
    ['grainSize', { grainSize: 12.5 }],
    ['grainTiles', { grainTiles: 0 }],
    ['vignette', { vignette: -0.1 }],
    ['grain', { grain: 1.5 }],
    ['grain', { grain: Number.NaN }],
  ])('refuses a finish whose %s the canvas cannot draw', (field, finish) => {
    expect(() => createFilm(spec(finish))).toThrow(field);
  });

  test.each([
    ['plateOpacity', { plateOpacity: 1.5 }],
    ['plateHeight', { plateHeight: -1 }],
    ['platePadding', { platePadding: Number.POSITIVE_INFINITY }],
    ['plateRadius', { plateRadius: -2 }],
    ['bottom', { bottom: Number.NaN }],
  ])('refuses a caption plate whose %s the canvas cannot draw', (field, plate) => {
    expect(() => createFilm(spec({}, plate))).toThrow(field);
  });
});

describe('a frame hears the names it reads off its clock', () => {
  /** A film whose one scene reads cue `go` every frame, the voice from `{word}` to `{end}` in its first second, and cue `later` after it. */
  const branching = () =>
    createFilm({
      ...spec(),
      scenes: [
        {
          id: 'a',
          say: 'A {word}line, and {end}more.',
          min: 4,
          timeline: { go: { at: 'start', dur: 1 }, later: { at: 'start', dur: 2 } },
          draw: (f) => {
            f.ctx.fillRect(0, 0, 100 * f.at('go'), 10);
            if (f.t < 1) f.ctx.fillRect(0, 20, 100 * f.spoken('word', 'end'), 10);
            else f.ctx.fillRect(0, 40, 100 * f.at('later'), 10);
          },
        },
      ],
    });
  const clock = () => ({
    cues: new Map<string, Set<string>>(),
    marks: new Map<string, Set<string>>(),
  });
  const names = (of: Map<string, Set<string>>) => [...(of.get('a') ?? [])].sort();

  test('draws the same frame whether it is heard or not', () => {
    const film = branching();
    const [plain, heard] = withDom(() => {
      // Once first, so neither compared frame is a scene's first guess at its breath.
      film.render(recorder().ctx, 0.5);
      const a = recorder();
      film.render(a.ctx, 0.5);
      const b = recorder();
      film.render(b.ctx, 0.5, { clock: clock() });
      return [a.ops, b.ops];
    });
    expect(plain.length).toBeGreaterThan(0);
    expect(heard).toEqual(plain);
  });

  test('hears each name its draw read, both ends of the voice, and none of a branch it did not take', () => {
    const film = branching();
    const early = clock();
    const late = clock();
    withDom(
      () => {
        film.render(recorder().ctx, 0.5, { clock: early });
        film.render(recorder().ctx, 1.5, { clock: late });
      },
      { record: false },
    );
    expect(names(early.cues)).toEqual(['go']);
    expect(names(early.marks)).toEqual(['end', 'word']);
    expect(names(late.cues)).toEqual(['go', 'later']);
    expect(names(late.marks)).toEqual([]);
  });

  test('a frame not asked to hear adds nothing to the last one heard', () => {
    const film = branching();
    const heard = clock();
    withDom(
      () => {
        film.render(recorder().ctx, 0.5, { clock: heard });
        film.render(recorder().ctx, 1.5);
      },
      { record: false },
    );
    expect(names(heard.cues)).toEqual(['go']);
  });

  test('a frame drawn again the other way hears only the draw it keeps', () => {
    // Past its second second the scene frames a shot of its own; before, none, and its draw reads `whole` under the
    // breath drawn round it whole, `framed` without it: the two draws of one frame read apart.
    const film = createFilm({
      ...spec(),
      scenes: [
        {
          id: 'a',
          say: 'A line.',
          min: 4,
          timeline: { whole: { at: 'start', dur: 4 }, framed: { at: 'start', dur: 4 } },
          draw: (f) => {
            if (f.t > 2) camera(f.ctx, { x: 960, y: 540 }, f.w, f.h, () => undefined);
            else f.at(f.ctx.getTransform().a === 1 ? 'framed' : 'whole');
          },
        },
      ],
    });
    const after = clock();
    const again = clock();
    withDom(
      () => {
        // A shot framed, so the next frame's first guess is a shot's: at 1 s it frames none, and is drawn again whole.
        film.render(recorder().ctx, 3);
        film.render(recorder().ctx, 1, { clock: after });
        // Guessed whole this time: drawn once.
        film.render(recorder().ctx, 1, { clock: again });
      },
      { record: false },
    );
    expect(names(again.cues)).toEqual(['whole']);
    expect(names(after.cues)).toEqual(names(again.cues));
  });

  test("hears the scene's own reads of its card's flood, not the engine's", () => {
    // The card floods in over `flood` in the scene's first second; the draw reads `flood` only past its third.
    const film = createFilm({
      ...spec(),
      scenes: [
        {
          id: 'a',
          say: 'Job asked it: {job}How should man be just with God?',
          min: 4,
          timeline: { flood: { at: 'start', dur: 1 }, card: { at: 'start', offset: 2, dur: 1 } },
          draw: (f) => {
            if (f.t > 3) f.at('flood');
            return { x: 0, y: 0, w: 10, h: 10 };
          },
          cards: [
            {
              cue: 'card',
              from: 'job',
              payoff: 'just',
              flood: { cue: 'flood' },
              draw: () => undefined,
            },
          ],
        },
      ],
    });
    const heard = clock();
    withDom(() => film.render(recorder().ctx, 0.5, { clock: heard }), { record: false });
    expect(names(heard.cues)).toEqual([]);
  });
});

describe('a scene with more than one card', () => {
  const LINE =
    'He is {righteous}righteous, they said. And Job asked: {job}How should man be just with God?';
  /** A film of one scene with a card over `one` and another over `two` (`timeline`), logging which draws ran. */
  const twoCards = (timeline: {
    readonly one: { readonly mark: string; readonly dur: number };
    readonly two: { readonly mark: string; readonly until: { readonly at: 'end' } };
  }) => {
    const ran: string[] = [];
    const scene = drawing({
      timeline,
      draw: () => void ran.push('scene'),
      cards: [
        {
          cue: 'one',
          from: 'righteous',
          to: 'job',
          payoff: 'righteous',
          draw: (_f, words) => void ran.push(`one:${words.map((w) => w.text).join(' ')}`),
        },
        {
          cue: 'two',
          from: 'job',
          payoff: 'just',
          draw: (_f, words) => void ran.push(`two:${words.length}`),
        },
      ],
    });
    const make = () => createFilm({ ...spec(), scenes: [{ id: 'a', say: LINE, ...scene }] });
    return { make, ran };
  };
  const apart = {
    one: { mark: 'righteous', dur: 0.5 },
    two: { mark: 'job', until: { at: 'end' } },
  } as const;

  test('shows each card over its own cue, its own words set, and the picture between them', () => {
    const { make, ran } = twoCards(apart);
    const film = make();
    const p = film.placed[0];
    const none = { start: Number.NaN, end: Number.NaN };
    const one = p?.cues.get('one') ?? none;
    const two = p?.cues.get('two') ?? none;
    expect(two.start).toBeGreaterThan(one.end + 0.1);
    const at = (t: number) => {
      ran.length = 0;
      withDom(() => film.render(recorder().ctx, (p?.start ?? 0) + t), { record: false });
      // A scene's first frame may draw twice (its breath guessed, then known): once is what shows.
      return [...new Set(ran)];
    };
    expect(at(one.start - 0.05)).toEqual(['scene']);
    expect(at(one.start + 0.01)).toEqual(['one:righteous, they said. And Job asked:']);
    expect(at(one.end - 0.01)).toEqual(['one:righteous, they said. And Job asked:']);
    expect(at((one.end + two.start) / 2)).toEqual(['scene']);
    expect(at(two.start + 0.01)).toEqual(['two:7']);
    expect(at(two.end - 0.01)).toEqual(['two:7']);
  });

  test('refuses two cards that would hold the frame at once, naming the scene and both cues', () => {
    const { make } = twoCards({ ...apart, one: { mark: 'righteous', dur: 30 } });
    expect(make).toThrow('scene "a": its cards over "one"');
    expect(make).toThrow('and "two"');
  });
});

describe("a callback reads another scene's knobs", () => {
  const city = drawing({ timeline: {}, knobs: { at: [1200, 640], zoom: 1.3 }, draw: () => {} });
  /** A film whose second scene reads the first's framing, logging what it saw. */
  const calling = () => {
    const seen: Array<readonly [readonly [number, number], number]> = [];
    const back = drawing({
      timeline: {},
      draw: (f) => {
        const knobs = f.knobsOf(city);
        seen.push([knobs('at'), knobs('zoom')]);
      },
    });
    const film = createFilm({
      ...spec(),
      scenes: [
        { id: 'city', say: 'A line.', ...city },
        { id: 'back', say: 'Another.', ...back },
      ],
    });
    return { film, seen, back };
  };

  test('as that scene reads them', () => {
    const { film, seen } = calling();
    const T = film.placed[1]?.start ?? 0;
    withDom(() => film.render(recorder().ctx, T + 0.1), { record: false });
    expect(seen.at(-1)).toEqual([[1200, 640], 1.3]);
  });

  test('throws, naming the scene, for a drawing the film does not draw', () => {
    const lost = drawing({ timeline: {}, knobs: { at: [0, 0] }, draw: () => {} });
    const film = createFilm({
      ...spec(),
      scenes: [{ id: 'a', say: 'A line.', draw: (f) => void f.knobsOf(lost) }],
    });
    expect(() => withDom(() => film.render(recorder().ctx, 0.1), { record: false })).toThrow(
      'scene a: f.knobsOf',
    );
  });
});
