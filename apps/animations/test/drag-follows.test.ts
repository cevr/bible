// A moment inside a cue's shape follows the cue when the lab drags it. The
// word card shows its other side when it is edge on, and the spoken book's
// cover is fully open when its pages are, however long the flip or the pages
// are dragged to: each frame is drawn as the lab's live preview draws a drag
// (`Film.edit`), into the stand-in with the probe collecting what it shows.

import { BunServices } from '@effect/platform-bun';
import { recorder, withDom } from '@bible/film/stand-in';
import type { Film } from '@bible/film/canvas';
import { ContentStore, FilmRepo } from '@bible/film/tools';
import { describe, expect, it } from 'effect-bun-test';
import { Array as Arr, Effect, Layer, Option, Result } from 'effect';
import { FILMS } from '../server.ts';
import { film as righteousnessByFaith } from '../src/films/righteousness-by-faith/film.ts';
import { spoke } from '../src/films/righteousness-by-faith/scenes/spoke.ts';
import { word } from '../src/films/righteousness-by-faith/scenes/word.ts';

/** What the probe collects from a frame. */
type Sink = NonNullable<NonNullable<Parameters<Film['render']>[2]>['probe']>;
type TextBox = Sink['texts'][number];
/** A scene's timeline, as a lab edit carries it. */
type Timeline = NonNullable<Parameters<Film['edit']>[1]['timeline']>;

const Repo = FilmRepo.layer(FILMS).pipe(
  Layer.provide(ContentStore.layer),
  Layer.provideMerge(BunServices.layer),
);

/** What a frame at `T` shows of `scene`, drawn with `timeline` in place of the scene's own. */
const shownAt = (film: Film, scene: string, timeline: Timeline, T: number) => {
  const shown = Result.getOrThrow(film.edit(scene, { timeline }));
  const probe: Sink = { texts: [], inks: [] };
  withDom(
    () =>
      film.render(recorder(1920, 1080, { record: false }).ctx, T, {
        edits: new Map([[scene, shown]]),
        probe,
      }),
    { record: false },
  );
  const cue = (name: string) => Option.getOrThrow(Option.fromUndefinedOr(shown.cues.get(name)));
  return { cue, texts: probe.texts.filter((t) => t.scene === scene), probe };
};

/** The film as its page builds it, from its committed timings. */
const built = Effect.gen(function* () {
  const { timings } = yield* (yield* FilmRepo).load('righteousness-by-faith');
  return righteousnessByFaith({ timings, audio: '' });
});

/** Where `scene` starts on the film's clock. */
const startOf = (film: Film, scene: string) =>
  Option.getOrThrow(Arr.findFirst(film.placed, (p) => p.spec.id === scene)).start;

const WORD = 'Righteousness';
const MEANING = 'right doing';

describe('a moment inside a cue follows the cue when it is dragged', () => {
  for (const dur of [0.5, 1, 1.6])
    it.effect.layer(Repo)(
      `word: the card shows its other side edge on, its flip dragged to ${dur} s`,
      () =>
        Effect.gen(function* () {
          const film = yield* built;
          const timeline = { ...word.timeline, flip: { ...word.timeline.flip, dur } };
          const at = (T: number) => shownAt(film, 'word', timeline, T);
          const from = startOf(film, 'word') + at(0).cue('flip').start;
          /** The card's line of text at `T`: its word, or once turned its meaning. */
          const card = (T: number): TextBox =>
            Option.getOrThrow(
              Arr.findFirst(at(T).texts, (t) => t.text === WORD || t.text === MEANING),
            );
          // Face on, before the flip: the card's own size on screen.
          const faceOn = card(from).scale;
          /** How tall the card stands, 1 face on: its height is the transform's y scale. */
          const height = (box: TextBox) => (box.scale / faceOn) ** 2;
          const steps = 400;
          const seen = Arr.makeBy(steps + 1, (i) => card(from + (dur * i) / steps));
          const swap = Option.getOrThrow(Arr.findFirstIndex(seen, (t) => t.text === MEANING));
          expect(swap).toBeGreaterThan(0);
          const before = Option.getOrThrow(Arr.get(seen, swap - 1));
          const after = Option.getOrThrow(Arr.get(seen, swap));
          expect(before.text).toBe(WORD);
          // The last frame of the word and the first of its meaning are both edge on.
          expect(height(before)).toBeLessThan(0.05);
          expect(height(after)).toBeLessThan(0.05);
        }),
      60_000,
    );

  for (const [cue, dur] of [
    ['pages', 0.9],
    ['unclasp', 0.8],
  ] as const)
    it.effect.layer(Repo)(
      `spoke: the cover is fully open when the pages are, its ${cue} dragged to ${dur} s`,
      () =>
        Effect.gen(function* () {
          const film = yield* built;
          const timeline = { ...spoke.timeline, [cue]: { ...spoke.timeline[cue], dur } };
          const at = (T: number) => shownAt(film, 'spoke', timeline, T);
          const pages = at(0).cue('pages');
          const start = startOf(film, 'spoke');
          /** The cover's width in the book's own units (its width on screen over its scale): the book's first fill. */
          const cover = (T: number) => {
            const fill = Option.getOrThrow(
              Arr.findFirst(at(T).probe.inks, (i) => i.scene === 'spoke' && i.kind === 'fill'),
            );
            return fill.w / fill.scale;
          };
          const open = cover(start + pages.end + 0.05);
          // Half way through the pages the cover is still widening; at their end it is open.
          expect(cover(start + pages.start + pages.dur / 2)).toBeLessThan(open * 0.99);
          expect(cover(start + pages.end)).toBeCloseTo(open, 0);
        }),
      60_000,
    );
});
