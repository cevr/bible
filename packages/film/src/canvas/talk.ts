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

import { Data, Option, Record as Rec, Schema } from 'effect';
import { Knob, Point } from '../core/schema.ts';
import {
  TALK_FPS,
  TALK_LAYOUT,
  type Talk,
  type TalkCut,
  type TalkTake,
  talkPhrases,
} from '../core/talk.ts';
import { clamp, frameAtOrBefore } from '../core/time.ts';
import { type Film, type FootageRead, type RenderOptions, createFilm } from './film.ts';
import type { Probe } from './probe.ts';
import { burnedCaptions } from './short-captions.ts';
import { verticalHook } from './vertical.ts';

/** A talk's page, in px. */
const WIDTH = 1080;
const HEIGHT = 1920;

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

/** A size in px. */
interface Size {
  readonly width: number;
  readonly height: number;
}

/** A side of a picture, in px: a positive number. */
const pxOf = Schema.decodeUnknownOption(Schema.Finite.check(Schema.isGreaterThan(0)));

/** A read the host was given to decode before the frame was drawn, and did not: never drawn black. */
class FootageUndecoded extends Data.TaggedError('FootageUndecoded')<{
  readonly source: string;
  readonly at: number;
}> {
  override get message() {
    return `footage ${this.source} has no frame at ${this.at}: the host did not decode it`;
  }
}

/**
 * The size of a picture the host decoded, in its own px: a video frame's as
 * displayed, else its width and height; `otherwise` for a picture that says
 * neither.
 */
const sizeOf = (image: CanvasImageSource, otherwise: Size): Size => {
  const px = (key: string) => pxOf(Reflect.get(image, key));
  return Option.getOrElse(
    Option.orElse(Option.all({ width: px('displayWidth'), height: px('displayHeight') }), () =>
      Option.all({ width: px('width'), height: px('height') }),
    ),
    () => otherwise,
  );
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
 * `talk`'s page over its takes (`takes`, by the talk's keys for them, as
 * `talkTakes` reads them from the footage library) and its cut on them
 * (`talkCut`): the cut laid out as a film's scenes are, each frame the
 * take's frame its cut names.
 */
export const createTalk = (
  talk: Talk,
  takes: Readonly<Record<string, TalkTake>>,
  cut: TalkCut,
): Film => {
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
        Option.map(Rec.get(takes, section.take), (take) => [section.id, { section, take }]),
      ),
    ),
  );
  const hook = verticalHook(talk.hook, style.hook, 1, TALK_LAYOUT);
  const captions = burnedCaptions(talkPhrases(talk, cut, base.placed), style.caption, 1, {
    centre: TALK_LAYOUT.caption.centre,
    caption: TALK_LAYOUT.caption,
  });

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
   * on the take's frames, read mid-frame. `T` is in the frame that starts at
   * or before it, so the picture leaves a piece on the frame the sound does,
   * at any `T` (a preview's clock, a note's still), not only a frame's start.
   */
  const readAt = (T: number): Option.Option<FootageRead> =>
    Option.map(playing(T), ({ section, take, t }) => {
      const frame = frameAtOrBefore(t, TALK_FPS);
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
        for (const host of Option.toArray(Option.fromUndefinedOr(opts.footage))) {
          const image = Option.getOrThrowWith(
            Option.fromUndefinedOr(host.frame(read)),
            // The host decodes every read before the frame is drawn; one it lacks is never drawn black.
            () => new FootageUndecoded({ source: read.source, at: read.at }),
          );
          // The crop is in the take's px; the host's picture may be another size (the lab's proxy).
          const picture = sizeOf(image, take);
          const kx = picture.width / take.width;
          const ky = picture.height / take.height;
          ctx.drawImage(image, sx * kx, sy * ky, sw * kx, sh * ky, 0, 0, WIDTH, HEIGHT);
        }
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
