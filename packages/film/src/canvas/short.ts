// A short's page: a vertical cut of a film (`shorts.ts`), drawn as a film of
// its own so the player, the export and the workers serve it unchanged. Each
// frame is the film's own frame at the film time under it, drawn full size
// into a band and copied onto the 9:16 page pixel for pixel, so a band crop is
// the film's still at that time. The page is made at the film's density and
// encoded down to 1080 × 1920 (`shortPage`).

import { Result, Schema } from 'effect';
import type { Placed } from '../core/layout.ts';
import { Short } from '../core/schema.ts';
import {
  type ResolvedShort,
  resolveShort,
  shortKey,
  shortPage,
  shortSpanAt,
} from '../core/shorts.ts';
import type { Film, RenderOptions, SceneSpec } from './film.ts';
import { type Offscreen, makePaper, offscreen } from './paper.ts';
import type { ProbeSink } from './probe.ts';

/** Where the film's frame sits on a short's page, in page px. */
export interface ShortBand {
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** The film's frame, centred on the page, on a whole pixel row so the copy is exact. */
export const bandOf = (film: Pick<Film, 'width' | 'height'>, pageHeight: number): ShortBand => ({
  top: Math.round((pageHeight - film.height) / 2),
  width: film.width,
  height: film.height,
});

/** A scene of the film on the short's clock: its start moved so its own clock reads the same. */
const retimed = (film: Film, short: ResolvedShort): ReadonlyArray<Placed<SceneSpec>> =>
  short.spans.map((span, index) => {
    const p = film.placed.find((q) => q.spec.id === span.scene) ?? film.sceneAt(span.from);
    return { ...p, index, start: span.at - (span.from - p.start) };
  });

/** Records the band's probe took, moved `dy` down onto the page, into `sink`. */
const onPage = (from: ProbeSink, sink: ProbeSink, dy: number) => {
  for (const t of from.texts)
    sink.texts.push({
      ...t,
      y: t.y + dy,
      corners: [
        [t.corners[0][0], t.corners[0][1] + dy],
        [t.corners[1][0], t.corners[1][1] + dy],
        [t.corners[2][0], t.corners[2][1] + dy],
        [t.corners[3][0], t.corners[3][1] + dy],
      ],
      order: sink.texts.length + sink.inks.length,
    });
  for (const i of from.inks)
    sink.inks.push({
      ...i,
      y: i.y + dy,
      points: i.points.map(([x, y]) => [x, y + dy] as const),
      order: sink.texts.length + sink.inks.length,
    });
};

/**
 * The page of `short` cut from `film`: the spans back to back, each frame the
 * film's own at the film time under it. Its spans are checked against the
 * film here: a scene, mark or cue the film lacks fails at load, naming it.
 */
export const createShort = (film: Film, declared: Short): Film => {
  const short = Result.getOrThrow(
    resolveShort(film.placed, Schema.decodeSync(Short)(declared), film.fps),
  );
  const page = shortPage(film.width);
  const band = bandOf(film, page.height);
  const placed = retimed(film, short);

  // Built lazily: the page must be made where there is no DOM (tools, tests).
  let assets: { paper: HTMLCanvasElement; band: Offscreen } | undefined;
  const getAssets = () =>
    (assets ??= {
      paper: makePaper(page.width, page.height, film.look.paper),
      band: offscreen(band.width, band.height),
    });

  /**
   * The band's render options, rewritten each frame so the draw allocates
   * nothing. The film's captions are the long film's; the short sets its own.
   */
  const bandOptions: { captions: false } & {
    -readonly [K in keyof RenderOptions]: RenderOptions[K];
  } = {
    captions: false,
  };

  const sceneAt = (T: number): Placed<SceneSpec> =>
    placed[shortSpanAt(short, T)] ?? film.sceneAt(short.spans[0].from);

  const render = (ctx: CanvasRenderingContext2D, T: number, opts: RenderOptions = {}) => {
    const { paper, band: frame } = getAssets();
    const span = short.spans[shortSpanAt(short, T)] ?? short.spans[0];
    const at = span.from + (T - span.at);
    const sink = opts.probe;
    // A probed frame (a check, never the export's draw) collects the band's records apart.
    const probed: ProbeSink | undefined = sink === undefined ? undefined : { texts: [], inks: [] };
    bandOptions.edit = opts.edit;
    bandOptions.knobs = opts.knobs;
    bandOptions.probe = probed;
    film.render(frame.ctx, at, bandOptions);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(paper, 0, 0);
    ctx.drawImage(frame.c, 0, band.top);
    ctx.restore();
    if (sink !== undefined && probed !== undefined) onPage(probed, sink, band.top);
  };

  return {
    title: short.title,
    width: page.width,
    height: page.height,
    fps: film.fps,
    duration: short.duration,
    placed,
    // The renderer cuts the film's track to the spans; the page has no track of its own.
    audio: undefined,
    sound: undefined,
    palette: film.palette,
    allRecorded: film.allRecorded,
    look: film.look,
    sceneAt,
    render,
    preview: film.preview,
    cuesOf: film.cuesOf,
  };
};

/**
 * The player's entries for a film's shorts, one page each under
 * `<film>/shorts/<id>`, beside the film's own: spread them into the films the
 * app mounts.
 */
export const shortPages = (
  name: string,
  load: () => Promise<Film>,
  shorts: ReadonlyArray<Short>,
): Record<string, () => Promise<Film>> =>
  Object.fromEntries(
    shorts.map((short) => [
      shortKey(name, short.id),
      () => load().then((f) => createShort(f, short)),
    ]),
  );
