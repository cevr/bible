// A short's page: a vertical cut of a film (`shorts.ts`), drawn as a film of
// its own so the player, the export and the workers serve it unchanged. Each
// frame is the film's own frame at the film time under it, drawn full size
// into a band and copied onto the 9:16 page pixel for pixel, so a band crop is
// the film's still at that time. Round the band the page is the film's paper,
// vignette and grain made at the page's own size, with the hook line above
// the band (`SHORT_LAYOUT`). The page is made at the film's density and
// encoded down to 1080 × 1920 (`shortPage`).

import { Result, Schema } from 'effect';
import { type Placed, sceneOf } from '../core/layout.ts';
import { Short } from '../core/schema.ts';
import {
  type ResolvedShort,
  SHORT_LAYOUT,
  bandOf,
  hookAlpha,
  pageScale,
  resolveShort,
  shortKey,
  shortPage,
  shortSpanAt,
} from '../core/shorts.ts';
import { shortPhrases } from '../core/phrases.ts';
import { boilTick } from './ink.ts';
import { burnedCaptions } from './short-captions.ts';
import type { Film, RenderOptions, SceneSpec } from './film.ts';
import {
  type Grain,
  type Offscreen,
  grainRect,
  makeGrain,
  makePaper,
  makeVignette,
  offscreen,
  shadeBy,
} from './paper.ts';
import { type Probe, type ProbeSink, recordText } from './probe.ts';

/** A scene of the film on the short's clock: its start moved so its own clock reads the same. */
const retimed = (film: Film, short: ResolvedShort): ReadonlyArray<Placed<SceneSpec>> =>
  short.spans.map((span, index) => {
    const p = Result.getOrThrow(sceneOf(film.placed, span.scene));
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

/** A line of set text, measured once: where it sits in 1080 × 1920 px. */
interface SetLine {
  readonly text: string;
  /** Its centre's height. */
  readonly y: number;
  readonly width: number;
}

/** A line's box: its height above and below its centre, in the font it is set in. */
interface LineBox {
  readonly ascent: number;
  readonly descent: number;
}

/** `text` broken into lines at most `width` wide in `ctx`'s font, greedily by word. */
const wrap = (
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
): ReadonlyArray<string> => {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line === '' ? word : `${line} ${word}`;
    if (line !== '' && ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line !== '') lines.push(line);
  return lines;
};

/** A block of set text: its lines, and the box each line's glyphs fill. */
interface SetBlock {
  readonly lines: ReadonlyArray<SetLine>;
  readonly box: LineBox;
}

/** `text` set in `font`, wrapped to `width` and centred as a block on `y`: measured once. */
const setBlock = (
  ctx: CanvasRenderingContext2D,
  text: string,
  font: string,
  width: number,
  y: number,
): SetBlock => {
  ctx.save();
  ctx.font = font;
  const m = ctx.measureText('Hg');
  const box = { ascent: m.fontBoundingBoxAscent, descent: m.fontBoundingBoxDescent };
  const step = (box.ascent + box.descent) * 1.08;
  const broken = wrap(ctx, text, width);
  const top = y - ((broken.length - 1) * step) / 2;
  const lines = broken.map((line, i) => ({
    text: line,
    y: top + i * step,
    width: ctx.measureText(line).width,
  }));
  ctx.restore();
  return { lines, box };
};

/**
 * The page of `short` cut from `film`: the spans back to back, each frame the
 * film's own at the film time under it. Its spans are checked against the
 * film here: a scene, mark or cue the film lacks fails at load, naming it.
 */
export const createShort = (film: Film, declared: Short): Film => {
  const decoded = Schema.decodeSync(Short)(declared);
  const short = Result.getOrThrow(resolveShort(film.placed, decoded, film.fps));
  const page = shortPage(film.width);
  const band = bandOf(film);
  const k = pageScale(film.width);
  const placed = retimed(film, short);
  const { finish, short: style } = film.look;
  /** The paper round the band: above it, and below it to the page's foot. */
  const below = band.top + band.height;
  const strip = Math.max(band.top, page.height - below);

  // Built lazily: the page must be made where there is no DOM (tools, tests).
  let assets:
    | {
        /** Paper under the page's own vignette: nothing on it moves, so it is made once. */
        sheet: HTMLCanvasElement;
        grain: Grain;
        band: Offscreen;
      }
    | undefined;
  const getAssets = () => {
    if (assets !== undefined) return assets;
    const base = offscreen(page.width, page.height);
    base.ctx.drawImage(makePaper(page.width, page.height, film.look.paper), 0, 0);
    shadeBy(base.ctx, makeVignette(page.width, page.height, film.look.shade, finish.vignette));
    // Grain is a tile that repeats: a sheet a strip tall (and a tile more) serves both strips.
    const grain = makeGrain(
      finish.grainSize,
      finish.grainTiles,
      film.look.paper.seed + 99,
      page.width,
      strip + finish.grainSize,
    );
    assets = { sheet: base.c, grain, band: offscreen(band.width, band.height) };
    return assets;
  };

  /** The words below the band, phrase by phrase (`--no-captions` leaves them out). */
  const captions = burnedCaptions(shortPhrases(film.placed, short), style.caption, k);

  /** The hook, set once on the first frame that draws it. */
  let hook: SetBlock | undefined;
  const hookOf = (ctx: CanvasRenderingContext2D, text: string) =>
    (hook ??= setBlock(ctx, text, style.hook.font, SHORT_LAYOUT.hook.width, SHORT_LAYOUT.hook.y));

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

  /** The hook line, above the band, while it shows; recorded as the caption's when probed. */
  const drawHook = (ctx: CanvasRenderingContext2D, T: number, probe: Probe | undefined) => {
    const text = decoded.hook;
    const alpha = hookAlpha(T);
    if (text === undefined || alpha <= 0) return;
    const set = hookOf(ctx, text);
    ctx.save();
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.font = style.hook.font;
    ctx.fillStyle = style.hook.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = alpha;
    for (const line of set.lines) {
      const baseline = line.y + (set.box.ascent - set.box.descent) / 2;
      ctx.fillText(line.text, SHORT_LAYOUT.centre, baseline);
      if (probe !== undefined)
        recordText(
          ctx,
          probe,
          line.text,
          SHORT_LAYOUT.centre - line.width / 2,
          baseline - set.box.ascent,
          line.width,
          set.box.ascent + set.box.descent,
          alpha,
        );
    }
    ctx.restore();
  };

  const render = (ctx: CanvasRenderingContext2D, T: number, opts: RenderOptions = {}) => {
    const { sheet, grain, band: frame } = getAssets();
    const index = shortSpanAt(short, T);
    const span = short.spans[index] ?? short.spans[0];
    const at = span.from + (T - span.at);
    const sink = opts.probe;
    // A probed frame (a check, never the export's draw) collects the band's records apart.
    const probed: ProbeSink | undefined = sink === undefined ? undefined : { texts: [], inks: [] };
    bandOptions.edits = opts.edits;
    bandOptions.knobs = opts.knobs;
    bandOptions.probe = probed;
    film.render(frame.ctx, at, bandOptions);

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // The paper above and below the band, then the film's frame between, untouched.
    ctx.drawImage(sheet, 0, 0, page.width, band.top, 0, 0, page.width, band.top);
    ctx.drawImage(
      sheet,
      0,
      below,
      page.width,
      page.height - below,
      0,
      below,
      page.width,
      page.height - below,
    );
    const boil = boilTick(T);
    grainRect(ctx, grain, boil, 0, 0, page.width, band.top, finish.grain);
    grainRect(
      ctx,
      grain,
      boil,
      0,
      below,
      page.width,
      page.height - below,
      finish.grain,
      below % grain.size,
    );
    ctx.drawImage(frame.c, 0, band.top);
    ctx.restore();

    const words = opts.captions !== false;
    if (sink === undefined || probed === undefined) {
      drawHook(ctx, T, undefined);
      if (words) captions.draw(ctx, T, undefined);
      return;
    }
    onPage(probed, sink, band.top);
    const probe: Probe = { sink, scene: span.scene, dx: 0, alpha: 1, caption: true };
    drawHook(ctx, T, probe);
    if (words) captions.draw(ctx, T, probe);
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
    edit: film.edit,
  };
};

/**
 * The player's entries for a film's shorts, one page each under
 * `<film>/shorts/<id>`: spread them, beside the films, into the pages the app
 * mounts.
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
