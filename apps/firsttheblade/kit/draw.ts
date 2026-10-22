/**
 * `bun run kit`: draws the channel's pictures from the brand (logo 10,
 * YouTube set 6, palette 09) in a browser with the site's own fonts.
 *
 * - The YouTube kit, into `kit/out/`: the avatar, the banner and what each
 *   screen shows of it, the watermark, two thumbnails in the house style,
 *   and `channel.md` (what to paste and where).
 * - The Facebook Page's cover, into `kit/out/`, and what a computer and a
 *   phone show of it.
 * - The site's link cards and icons, into `public/`: a card per page
 *   (`og/<page>.jpg`, 1200 × 630), the app icons and `favicon.ico`.
 *
 * The field is the site's own hero, round 5's repaint at 3072 px
 * (`src/art/field-3072.webp`), so the banner and a shared link look like the
 * page they lead to. The mark and the thumbnails' paintings are in `kit/art/`
 * at full size; the emblems are from `src/art/`. The colours are
 * `src/palette.ts`. The link cards are stills of the field the owner
 * approves by name, so each run ends by naming those that differ from his
 * approval (`./approval.ts`); it never writes the record.
 */
import { BunRuntime, BunServices } from '@effect/platform-bun';
import { chromium, type Browser } from '@playwright/test';
import { Data, Effect, FileSystem, Path } from 'effect';

import { SERIES, type Series, type SeriesId } from '../src/content.ts';
import { PALETTE } from '../src/palette.ts';
import { reportAgainstRecord } from './approval.ts';

const KIT = import.meta.dir;
const APP = `${KIT}/..`;
const OUT = `${KIT}/out`;
const PUBLIC = `${APP}/public`;
const WORK = `${OUT}/.html`;

const url = (file: string) => `file://${encodeURI(file)}`;
const kitArt = (name: string) => url(`${KIT}/art/${name}`);
const emblem = (id: SeriesId) => url(`${APP}/src/art/emblem-${id}.svg`);
const font = (face: string) => url(`${APP}/src/fonts/Newsreader-${face}.woff2`);

/** The torn edge of a strip of paper, cut a little deeper for a thumbnail's scale. */
const TORN =
  'polygon(0 6%,5% 0,12% 4%,20% 1%,29% 5%,38% 0,49% 4%,58% 1%,68% 5%,78% 0,88% 4%,100% 1%,100% 94%,93% 100%,84% 96%,74% 100%,63% 95%,52% 99%,41% 95%,31% 100%,20% 96%,9% 100%,0 95%)';

const htmlPage = (body: string) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Newsreader;font-style:normal;font-weight:200 800;src:url(${font('normal-latin')}) format('woff2')}
@font-face{font-family:Newsreader;font-style:italic;font-weight:200 800;src:url(${font('italic-latin')}) format('woff2')}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Newsreader,serif;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision;font-synthesis:none}
</style></head><body>${body}</body></html>`;

/** The mark in its disc, the painting a little larger than the disc so its ring sits at the edge. */
const disc = (size: number) =>
  `<div style="width:${size}px;height:${size}px;flex:none;border-radius:50%;background:url(${kitArt('mark.webp')}) center/117% no-repeat"></div>`;

const wordmark = (px: number) =>
  `<span style="font:500 ${px}px Newsreader;font-variation-settings:'opsz' 72;letter-spacing:-0.015em;color:${PALETTE.ink};white-space:nowrap;line-height:1">First <i style="font-weight:400;color:${PALETTE.accent}">the</i> Blade</span>`;

/** Logo 10: the disc beside the wordmark. */
const lockup = (px: number) =>
  `<div style="display:inline-flex;align-items:center;gap:${px * 0.42}px">${disc(px * 1.55)}${wordmark(px)}</div>`;

const strip = (inner: string, padding: string) =>
  `<div style="display:inline-block;background:${PALETTE.strip};clip-path:${TORN};padding:${padding}">${inner}</div>`;

/** The field as the site's hero shows it. */
const FIELD = url(`${APP}/src/art/field-3072.webp`);

const field = (position: string) =>
  `<div style="position:absolute;inset:0;background:url(${FIELD}) ${position}/cover"></div>`;

const frame = (width: number, height: number, inner: string) =>
  `<div style="position:relative;width:${width}px;height:${height}px;overflow:hidden">${inner}</div>`;

/**
 * The avatar: the painting on the ink at 116% of the square, as round 4 drew
 * it. YouTube's circle crop meets the painted ring at the sides; at the top
 * and bottom a hairline of the painting's cream shows inside the crop.
 */
const avatar = (size: number) =>
  frame(
    size,
    size,
    `<div style="position:absolute;inset:0;background:${PALETTE.ink} url(${kitArt('mark.webp')}) center/116% no-repeat"></div>`,
  );

class BrowserError extends Data.TaggedError('BrowserError')<{
  readonly step: string;
  readonly cause: unknown;
}> {}

const step = <A>(name: string, run: () => PromiseLike<A>) =>
  Effect.tryPromise({
    try: () => run(),
    catch: (cause) => new BrowserError({ step: name, cause }),
  });

/** How a picture is written: a PNG on the page's own ground, a transparent PNG, or a JPEG. */
type Format = 'png' | 'transparent' | 'jpeg';

const SHOT = {
  png: { type: 'png', omitBackground: false },
  transparent: { type: 'png', omitBackground: true },
  jpeg: { type: 'jpeg', quality: 88 },
} as const;

interface Size {
  readonly width: number;
  readonly height: number;
}

/** In the page: every face is in. */
const fontsIn = () => document.fonts.status === 'loaded';

const draw = Effect.fn('Kit.draw')(function* (
  browser: Browser,
  html: string,
  out: string,
  size: Size,
  format: Format = 'png',
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const context = yield* Effect.acquireRelease(
    step('context', () => browser.newContext({ viewport: size, deviceScaleFactor: 1 })),
    (opened) => Effect.promise(() => opened.close()),
  );
  const page = yield* step('page', () => context.newPage());
  yield* fs.makeDirectory(WORK, { recursive: true });
  const file = path.join(WORK, `${path.basename(out)}.html`);
  yield* fs.writeFileString(file, htmlPage(html));
  yield* step('goto', () => page.goto(url(file), { waitUntil: 'networkidle' }));
  yield* step('fonts', () => page.waitForFunction(fontsIn));
  const bytes = yield* step('shot', () => page.screenshot(SHOT[format]));
  yield* fs.makeDirectory(path.dirname(out), { recursive: true });
  yield* fs.writeFile(out, bytes);
  yield* Effect.logInfo('kit.drew').pipe(
    Effect.annotateLogs({ file: path.relative(APP, out), bytes: bytes.length }),
  );
  return new Uint8Array(bytes);
}, Effect.scoped);

/** An .ico of PNG images, one directory entry each (a size of 256 is written as 0). */
const ico = (images: ReadonlyArray<{ readonly size: number; readonly png: Uint8Array }>) => {
  const headLength = 6 + 16 * images.length;
  const total = images.reduce((sum, { png }) => sum + png.length, headLength);
  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);
  view.setUint16(2, 1, true);
  view.setUint16(4, images.length, true);
  let offset = headLength;
  images.forEach(({ size, png }, i) => {
    const at = 6 + 16 * i;
    view.setUint8(at, size % 256);
    view.setUint8(at + 1, size % 256);
    view.setUint16(at + 4, 1, true);
    view.setUint16(at + 6, 32, true);
    view.setUint32(at + 8, png.length, true);
    view.setUint32(at + 12, offset, true);
    bytes.set(png, offset);
    offset += png.length;
  });
  return bytes;
};

// ── The YouTube kit ──────────────────────────────────────────────────────

/** YouTube's banner areas, in its 2560 × 1440 frame. */
const SAFE = { x: 507, y: 508.5, width: 1546, height: 423 } as const;
const DESKTOP = { y: 508.5, height: 423 } as const;

const banner = frame(
  2560,
  1440,
  `${field('50% 58%')}<div style="position:absolute;left:50%;top:720px;transform:translate(-50%,-50%) rotate(-1deg)">${strip(lockup(110), '40px 80px')}</div>`,
);

/** What a TV, a computer and a phone show of the banner. */
const cropsBoard = (src: string) => {
  const label = (text: string) =>
    `<div style="font:500 13px Newsreader;letter-spacing:.16em;color:${PALETTE.ink};margin-bottom:6px">${text}</div>`;
  const tv = 600 / 2560;
  const desk = 760 / 2560;
  const phone = 460 / SAFE.width;
  return `<div style="width:1400px;height:400px;padding:20px;background:${PALETTE.band};display:grid;grid-template-columns:600px 1fr;gap:20px;align-items:start">
<div>${label('TV · ALL 2560 × 1440')}<div style="position:relative;width:600px;height:${1440 * tv}px;background:url(${src}) 0 0/600px ${1440 * tv}px"><div style="position:absolute;left:0;right:0;top:${DESKTOP.y * tv}px;height:${DESKTOP.height * tv}px;box-shadow:0 0 0 2px ${PALETTE.strip}"></div><div style="position:absolute;left:${SAFE.x * tv}px;width:${SAFE.width * tv}px;top:${SAFE.y * tv}px;height:${SAFE.height * tv}px;outline:2px dashed ${PALETTE.gold}"></div></div></div>
<div style="display:flex;flex-direction:column;gap:14px"><div>${label('DESKTOP · 2560 × 423')}<div style="width:760px;height:${DESKTOP.height * desk}px;background:url(${src}) 0 ${-DESKTOP.y * desk}px/760px ${1440 * desk}px"></div></div>
<div>${label('PHONE AND SAFE AREA · 1546 × 423')}<div style="width:460px;height:${SAFE.height * phone}px;background:url(${src}) ${-SAFE.x * phone}px ${-SAFE.y * phone}px/${2560 * phone}px ${1440 * phone}px"></div></div></div></div>`;
};

/** A thumbnail's film: its painting, where the frame sits on it, and its question in lines at one size. */
interface Thumb {
  readonly art: string;
  readonly position: string;
  readonly lines: ReadonlyArray<string>;
  readonly px: number;
}

/** Two thumbnails in the house style, from Righteousness by Faith. */
const THUMBS: Record<'robe' | 'court', Thumb> = {
  robe: { art: 'robe.webp', position: '50% 70%', lines: ['Guilty,', 'yet righteous?'], px: 72 },
  court: { art: 'court.webp', position: '50% 40%', lines: ['You did it.'], px: 106 },
};

/** A thumbnail: the film's painting, its question on a torn strip at the left. */
const thumb = (film: Thumb) =>
  frame(
    1280,
    720,
    `<div style="position:absolute;inset:0;background:url(${kitArt(film.art)}) ${film.position}/cover"></div><div style="position:absolute;left:40px;top:50%;transform:translateY(-50%) rotate(-1.5deg)">${strip(
      `<div style="font:500 ${film.px}px/1.04 Newsreader;font-variation-settings:'opsz' 72;letter-spacing:-.015em;color:${PALETTE.ink}">${film.lines.join('<br>')}</div>`,
      '28px 40px',
    )}</div>`,
  );

// ── The Facebook Page ────────────────────────────────────────────────────

/**
 * The cover at twice the phone's 640 × 360: a phone shows all of it, a
 * computer the band 1640 × 624 across its middle. The Page's profile picture
 * is the disc, so the cover carries the wordmark alone.
 */
const COVER = { width: 1640, height: 924 } as const;
const COVER_DESKTOP = { y: 150, height: 624 } as const;

const cover = frame(
  COVER.width,
  COVER.height,
  `${field('50% 58%')}<div style="position:absolute;left:50%;top:${COVER.height / 2}px;transform:translate(-50%,-50%) rotate(-1deg)">${strip(wordmark(104), '36px 72px')}</div>`,
);

/** What a computer and a phone show of the cover. */
const coverCropsBoard = (src: string) => {
  const label = (text: string) =>
    `<div style="font:500 13px Newsreader;letter-spacing:.16em;color:${PALETTE.ink};margin-bottom:6px">${text}</div>`;
  const desk = 820 / COVER.width;
  const phone = 480 / COVER.width;
  return `<div style="width:1360px;height:340px;padding:20px;background:${PALETTE.band};display:grid;grid-template-columns:820px 480px;gap:20px;align-items:start">
<div>${label('COMPUTER · 1640 × 624')}<div style="width:820px;height:${COVER_DESKTOP.height * desk}px;background:url(${src}) 0 ${-COVER_DESKTOP.y * desk}px/820px ${COVER.height * desk}px"></div></div>
<div>${label('PHONE · ALL 1640 × 924')}<div style="width:480px;height:${COVER.height * phone}px;background:url(${src}) 0 0/480px ${COVER.height * phone}px"></div></div></div>`;
};

// ── The site's link cards and icons ──────────────────────────────────────

const OG = { width: 1200, height: 630 } as const;

const homeCard = frame(
  OG.width,
  OG.height,
  `${field('50% 58%')}<div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-1deg)">${strip(lockup(64), '30px 54px')}</div>`,
);

const seriesCard = (series: Series) =>
  frame(
    OG.width,
    OG.height,
    `${field('50% 58%')}<div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-1deg)">${strip(
      `<div style="display:flex;align-items:center;gap:32px"><img src="${emblem(series.id)}" width="132" height="132" alt=""><div><div style="font:500 17px Newsreader;letter-spacing:.16em;text-transform:uppercase;color:${PALETTE.accent};white-space:nowrap">${series.subject} · ${series.form}</div><div style="margin-top:6px;font:500 64px/1.05 Newsreader;font-variation-settings:'opsz' 72;letter-spacing:-.015em;color:${PALETTE.ink};white-space:nowrap">${series.name}</div><div style="margin-top:14px">${lockup(26)}</div></div></div>`,
      '34px 56px',
    )}</div>`,
  );

/** A picture the kit draws: what it is drawn from, the file it goes to, its size and its format. */
interface Picture {
  readonly html: string;
  readonly out: string;
  readonly size: Size;
  readonly format: Format;
}

/**
 * Every picture a viewer or a reader sees, in the order the kit draws them:
 * the channel's avatar, watermark, banner and thumbnails, the Page's cover,
 * and the site's link cards and icons. The email list's promise check reads
 * the words drawn on each (`../scripts/promise.ts`).
 */
export const SEEN: ReadonlyArray<Picture> = [
  {
    html: avatar(800),
    out: `${OUT}/avatar-800.png`,
    size: { width: 800, height: 800 },
    format: 'png',
  },
  {
    html: disc(150),
    out: `${OUT}/watermark-150.png`,
    size: { width: 150, height: 150 },
    format: 'transparent',
  },
  {
    html: banner,
    out: `${OUT}/banner-2560x1440.png`,
    size: { width: 2560, height: 1440 },
    format: 'png',
  },
  ...Object.entries(THUMBS).map(([name, film]): Picture => ({
    html: thumb(film),
    out: `${OUT}/thumb-${name}.png`,
    size: { width: 1280, height: 720 },
    format: 'png',
  })),
  { html: cover, out: `${OUT}/facebook-cover-1640x924.png`, size: COVER, format: 'png' },
  { html: homeCard, out: `${PUBLIC}/og/home.jpg`, size: OG, format: 'jpeg' },
  ...SERIES.map((series): Picture => ({
    html: seriesCard(series),
    out: `${PUBLIC}/og/${series.id}.jpg`,
    size: OG,
    format: 'jpeg',
  })),
  // The manifest's icons are the disc on nothing, so a dark launcher shows no
  // square; iOS fills a clear corner black, so its touch icon is the avatar's square.
  ...(
    [
      ['icon-512.png', 512],
      ['icon-192.png', 192],
    ] as const
  ).map(([file, size]): Picture => ({
    html: disc(size),
    out: `${PUBLIC}/${file}`,
    size: { width: size, height: size },
    format: 'transparent',
  })),
  {
    html: avatar(180),
    out: `${PUBLIC}/apple-touch-icon.png`,
    size: { width: 180, height: 180 },
    format: 'png',
  },
];

const kit = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const browser = yield* Effect.acquireRelease(
    step('launch', () => chromium.launch({ channel: 'chrome' })),
    (opened) => Effect.promise(() => opened.close()),
  );

  yield* Effect.forEach(SEEN, (picture) =>
    draw(browser, picture.html, picture.out, picture.size, picture.format),
  );
  yield* fs.copyFile(`${KIT}/channel.md`, `${OUT}/channel.md`);

  // The boards of what each screen shows, for the owner, drawn from the pictures above.
  yield* draw(browser, cropsBoard(url(`${OUT}/banner-2560x1440.png`)), `${OUT}/banner-crops.png`, {
    width: 1400,
    height: 400,
  });
  yield* draw(
    browser,
    coverCropsBoard(url(`${OUT}/facebook-cover-1640x924.png`)),
    `${OUT}/facebook-cover-crops.png`,
    { width: 1360, height: 340 },
  );

  // The favicon is the disc on nothing, so a dark tab strip shows no square.
  const icons = [];
  for (const size of [16, 32, 48]) {
    const png = yield* draw(
      browser,
      disc(size),
      `${WORK}/favicon-${size}.png`,
      { width: size, height: size },
      'transparent',
    );
    icons.push({ size, png });
  }
  const favicon = ico(icons);
  yield* fs.writeFile(`${PUBLIC}/favicon.ico`, favicon);
  yield* Effect.logInfo('kit.drew').pipe(
    Effect.annotateLogs({ file: 'public/favicon.ico', sizes: '16,32,48', bytes: favicon.length }),
  );
  yield* reportAgainstRecord(APP);
}).pipe(Effect.scoped);

if (import.meta.main) {
  kit.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
}
