// A talk's page: the speaker's own take, cut on his words (`core/talk.ts`),
// drawn as a film of its own so the player, the export and the checks serve
// it as they serve any film. The page is 9:16, 1080 × 1920, at the talk's
// rate (`TALK_FPS`). Each frame says which frame of the take it shows
// (`footageAt`, through the cut's pieces: a pure function of the edit); the
// host decodes it before the frame is drawn and hands it over
// (`RenderOptions.footage`), and the frame draws it as given, cropped 9:16 by
// its section's `frame` (the crop's centre, in the take's pixels) and `zoom`
// knobs, with the hook (`vertical.ts`) and the captions (`talkPhrases`) set
// inside every platform's zone (`TALK_LAYOUT`). Nothing passes from one frame
// to the next: the words are measured once, as a short's are, and the rest
// is the frame's own.

import { Option, Record as Rec, Result, Schema } from 'effect';
import { Knob, Point } from '../core/schema.ts';
import {
  TALK_FPS,
  TALK_LAYOUT,
  type Talk,
  type TalkTake,
  talkCut,
  talkPhrases,
} from '../core/talk.ts';
import { clamp } from '../core/time.ts';
import { type Film, type FootageRead, type RenderOptions, createFilm } from './film.ts';
import type { Probe } from './probe.ts';
import { burnedCaptions } from './short-captions.ts';
import { verticalHook } from './vertical.ts';

/** A talk's page, in px. */
const WIDTH = 1080;
const HEIGHT = 1920;

/**
 * A take as a talk's page plays it: its transcript and voice (`TalkTake`,
 * what the talk is cut on), the footage source it is (`<name>/<sha12>`, the
 * copy the host decodes) and its picture's size as displayed.
 */
interface TalkFootage extends TalkTake {
  readonly source: string;
  readonly width: number;
  readonly height: number;
}

/** What a talk's page is built from: its edit, and each take it plays by the talk's key for it. */
interface TalkPage {
  readonly talk: Talk;
  readonly takes: Readonly<Record<string, TalkFootage>>;
}

/** The part of a take's picture a frame shows, in the take's px. */
interface Crop {
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
}

/**
 * The 9:16 crop of a `width` × `height` picture about `frame`, `zoom` times
 * in from the largest 9:16 rectangle the picture holds (never out past it),
 * kept inside the picture.
 */
const cropOf = (
  picture: { readonly width: number; readonly height: number },
  frame: Point,
  zoom: number,
): Crop => {
  const fullW = Math.min(picture.width, (picture.height * WIDTH) / HEIGHT);
  const fullH = (fullW * HEIGHT) / WIDTH;
  const sw = fullW / Math.max(1, zoom);
  const sh = fullH / Math.max(1, zoom);
  return {
    sx: clamp(frame[0] - sw / 2, 0, picture.width - sw),
    sy: clamp(frame[1] - sh / 2, 0, picture.height - sh),
    sw,
    sh,
  };
};

const isPoint = Schema.is(Point);
const isKnob = Schema.is(Knob);

/** Knob `name` of `knobs` when it is a point. */
const pointKnob = (knobs: ReadonlyMap<string, Knob>, name: string): Option.Option<Point> =>
  Option.filter(Option.fromUndefinedOr(knobs.get(name)), isPoint);

/** Knob `name` of `knobs` when it is a number. */
const numberKnob = (knobs: ReadonlyMap<string, Knob>, name: string): Option.Option<number> =>
  Option.filter(
    Option.fromUndefinedOr(knobs.get(name)),
    (k): k is number => isKnob(k) && !isPoint(k),
  );

/** The paper under a frame the host gave no footage for: plain, never a frame of the take. */
const BARE = '#000000';

/**
 * `talk`'s page over its takes (`takes`, by the talk's keys for them): its
 * cut laid out as a film's scenes are, each frame the take's frame its cut
 * names. A take the talk plays that `takes` lacks, or a word it lacks, fails
 * here, at load, naming it.
 */
const createTalk = (talk: Talk, takes: Readonly<Record<string, TalkFootage>>): Film => {
  const cut = Result.getOrThrow(talkCut(talk, takes));
  const base = createFilm({
    title: talk.title,
    width: WIDTH,
    height: HEIGHT,
    fps: TALK_FPS,
    paper: { base: BARE, tone: BARE, seed: 1 },
    shade: BARE,
    scenes: cut.scenes.map((timed) => ({ ...timed, draw: () => {}, drift: 0 })),
    timings: cut.timings,
    short: {
      hook: { font: '700 64px sans-serif', color: '#ffffff' },
      caption: { font: '700 58px sans-serif', color: '#ffffff' },
    },
  });
  const style = base.look.short;
  /** Each section as it plays, and the take it plays, by scene. */
  const sections = new Map(
    cut.sections.flatMap((section) =>
      Option.toArray(
        Option.map(Option.fromUndefinedOr(takes[section.take]), (take) => [
          section.id,
          { section, take },
        ]),
      ),
    ),
  );
  const hook = verticalHook(talk.hook, style.hook, 1, TALK_LAYOUT);
  const captions = burnedCaptions(
    talkPhrases(talk, cut, base.placed),
    style.caption,
    1,
    TALK_LAYOUT,
  );

  /** The section playing at `T`, and where in it. */
  const playing = (T: number) => {
    const p = base.sceneAt(T);
    return Option.map(Option.fromUndefinedOr(sections.get(p.spec.id)), (s) => ({
      ...s,
      p,
      t: T - p.start,
    }));
  };

  /**
   * The take's frame `T` shows: the piece of its section playing at `T` (its
   * last piece past its end), at the same distance from the piece's in-point
   * on the take's frames, read mid-frame.
   */
  const readAt = (T: number): Option.Option<FootageRead> =>
    Option.map(playing(T), ({ section, take, t }) => {
      const frame = Math.round(t * TALK_FPS);
      const piece =
        section.pieces.findLast((q) => Math.round(q.at * TALK_FPS) <= frame) ?? section.pieces[0];
      const from = Math.round((piece?.from ?? 0) * TALK_FPS);
      const last = Math.round((piece?.to ?? 0) * TALK_FPS) - 1;
      const at = Math.round((piece?.at ?? 0) * TALK_FPS);
      const shown = Math.min(last, from + frame - at);
      return { source: take.source, at: (shown + 0.5) / TALK_FPS };
    });

  const footageAt = (T: number): ReadonlyArray<FootageRead> => Option.toArray(readAt(T));

  /** The take's frame at `T`, cropped by its section's knobs (the lab's drag, if it shows one). */
  const drawTake = (ctx: CanvasRenderingContext2D, T: number, opts: RenderOptions) => {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = BARE;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    for (const { take, p } of Option.toArray(playing(T))) {
      const knobs = opts.edits?.get(p.spec.id)?.knobs ?? p.knobs;
      const frame = Option.getOrElse(pointKnob(knobs, 'frame'), (): Point => [
        take.width / 2,
        take.height / 2,
      ]);
      const zoom = Option.getOrElse(numberKnob(knobs, 'zoom'), () => 1);
      const { sx, sy, sw, sh } = cropOf(take, frame, zoom);
      const scale = WIDTH / sw;
      const transform = [scale, 0, 0, scale, -sx * scale, -sy * scale] as const;
      opts.knobs?.push(
        { scene: p.spec.id, name: 'frame', value: frame, transform },
        { scene: p.spec.id, name: 'zoom', value: zoom, transform },
      );
      for (const read of Option.toArray(readAt(T))) {
        opts.probe?.footage?.push({ source: read.source, at: read.at });
        for (const image of Option.toArray(Option.fromUndefinedOr(opts.footage?.frame(read))))
          ctx.drawImage(image, sx, sy, sw, sh, 0, 0, WIDTH, HEIGHT);
      }
    }
    ctx.restore();
  };

  const render = (ctx: CanvasRenderingContext2D, T: number, opts: RenderOptions = {}) => {
    drawTake(ctx, T, opts);
    const words = opts.captions !== false;
    const sink = opts.probe;
    if (sink === undefined) {
      hook.draw(ctx, T, undefined);
      if (words) captions.draw(ctx, T, undefined);
      return;
    }
    const probe: Probe = { sink, scene: base.sceneAt(T).spec.id, dx: 0, alpha: 1, caption: true };
    hook.draw(ctx, T, probe);
    if (words) captions.draw(ctx, T, probe);
  };

  return { ...base, footageAt, render };
};

/** A talk's module as the films index loads it: the talk built, playing its mixed narration. */
interface TalkModule {
  readonly film: (narrated: { readonly audio: string }) => Film;
}

/**
 * The films index's entries for its talks, each a talk's page module (its
 * edit and its takes, `TalkPage`), as `narratedFilms` loads a drawn film's:
 * spread them beside the drawn films, keyed by each talk's folder, and the
 * framework reads each one's narration (its mixed track) as it reads a
 * film's.
 */
export const talkFilms = <K extends string>(
  talks: Readonly<Record<K, () => Promise<TalkPage>>>,
): Record<K, () => Promise<TalkModule>> =>
  Rec.map(
    talks,
    (load) => () =>
      load().then((page): TalkModule => ({
        film: (narrated) => ({ ...createTalk(page.talk, page.takes), audio: narrated.audio }),
      })),
  );
