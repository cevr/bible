// The faces a page draws in, each subset a woff2 file of its own: the
// studio's two UI faces, Geist for words and labels and Geist Mono for
// numbers, timecodes, ids and code (`@fontsource-variable/geist` and
// `@fontsource-variable/geist-mono`, OFL), which the chrome shows under the
// families `--font` and `--font-mono` name first (`tokens.css`), and the faces
// a film draws in, which only its canvas shows (an app's own,
// `pictureFaces`). Every file is imported from a script, never linked from a
// stylesheet: the bundler inlines a stylesheet's `url()` as a `data:` URI, so
// every face would hold the page's first paint, but emits a script's import as
// its own file at an absolute URL named by its content's hash
// (`/…-<hash>.woff2`), which the lab answers by its asset route behind
// `admit`, as any script, and a changed file reaches an open page as any
// changed source does.

import { Effect, Option } from 'effect';
import wordsLatinExt from '@fontsource-variable/geist/files/geist-latin-ext-wght-normal.woff2';
import wordsLatin from '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2';
import monoLatinExt from '@fontsource-variable/geist-mono/files/geist-mono-latin-ext-wght-normal.woff2';
import monoLatin from '@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2';
import monoSymbols from '@fontsource-variable/geist-mono/files/geist-mono-symbols2-wght-normal.woff2';

/** The characters each script's subset holds (Google Fonts' and fontsource's ranges). */
export const SUBSETS = {
  latin:
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  latinExt:
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
  greek: 'U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF',
  hebrew: 'U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F',
  /** Box drawing, blocks and spaces: a code file's rules and a meter's bars. */
  symbols2: 'U+2000-2001,U+2004-2008,U+200A,U+23B8-23BD,U+2500-259F',
} as const;

/** One subset of a face, as its `@font-face` rule declares it. */
export interface Face {
  readonly family: string;
  /** The woff2 file, as a script's import names it. */
  readonly url: string;
  /** The characters it holds (`SUBSETS`). */
  readonly range: string;
  /** Its weight, or the range a variable file spans (`300 800`). */
  readonly weight: string;
  readonly style: 'normal' | 'italic';
}

/** The words face's family: the one `--font` names first. */
const WORDS_FAMILY = 'Geist';

/** The numbers and code face's family: the one `--font-mono` names first. */
const MONO_FAMILY = 'Geist Mono';

/** One subset of a UI face: a variable file spanning every weight. */
const uiFace = (family: string, url: string, range: string): Face => ({
  family,
  url,
  range,
  weight: '100 900',
  style: 'normal',
});

/** The words face's latin subset: the chrome's words. */
const WORDS_LATIN = uiFace(WORDS_FAMILY, wordsLatin, SUBSETS.latin);

/** The numbers and code face's latin subset: the chrome's numbers, timecodes and ids. */
const MONO_LATIN = uiFace(MONO_FAMILY, monoLatin, SUBSETS.latin);

/**
 * The UI faces' subsets: each script either package ships that the chrome
 * writes in (neither ships greek: a Greek word is set in the fallback).
 */
const UI_FACES: ReadonlyArray<Face> = [
  uiFace(WORDS_FAMILY, wordsLatinExt, SUBSETS.latinExt),
  WORDS_LATIN,
  uiFace(MONO_FAMILY, monoSymbols, SUBSETS.symbols2),
  uiFace(MONO_FAMILY, monoLatinExt, SUBSETS.latinExt),
  MONO_LATIN,
];

/**
 * The subsets a page's first paint sets its text in, preloaded by its head
 * (`FACE_HEAD`): each face's latin. The other subsets are declared beside
 * them and fetched only when a page's text holds one of their characters.
 */
const FIRST_PAINT: ReadonlyArray<Face> = [WORDS_LATIN, MONO_LATIN];

/**
 * How the chrome's text waits for its face: `block`, so no text is drawn in
 * a fallback and nothing moves when a face lands. The lab is served from
 * this machine or the tailnet and the head preloads the first paint's files
 * (`FIRST_PAINT`), so the wait is a few milliseconds; past the browser's
 * block period (3 s) the text shows in its metric-matched fallback
 * (`tokens.css`).
 */
const UI_DISPLAY: FontDisplay = 'block';

/** A family as a page's fonts name it: a stylesheet's rule keeps its quotes. */
const unquoted = (family: string) => family.replace(/^["']|["']$/g, '');

/** `faces` added to `fonts` (a page's `document.fonts`), each shown as `display` says while it loads. */
const added = (
  fonts: FontFaceSet,
  faces: ReadonlyArray<Face>,
  display: FontDisplay,
): ReadonlyArray<FontFace> =>
  faces.map((face) => {
    const font = new FontFace(face.family, `url(${face.url}) format('woff2')`, {
      weight: face.weight,
      style: face.style,
      display,
      unicodeRange: face.range,
    });
    fonts.add(font);
    return font;
  });

/**
 * Register the UI faces' subsets into `fonts` (a page's `document.fonts`)
 * unless its head declared them (`FACE_HEAD`, on a page the server
 * rendered); each loads when text first needs it, the chrome's text unseen
 * until it lands (`UI_DISPLAY`).
 */
export const registerFace = (fonts: FontFaceSet): void => {
  const inHead = Array.from(fonts).some((font) => unquoted(font.family) === WORDS_FAMILY);
  if (!inHead) added(fonts, UI_FACES, UI_DISPLAY);
};

/**
 * A file's URL from the pages' root. The browser's build names it there
 * (`/…-<hash>.woff2`, the pages' public path); the server's names it from
 * the chunk this module lands in (`./…` from one at the build's root,
 * `../…` from one in a subfolder), by the same content hash, since both are
 * built from the same sources under the same root and every asset is
 * written at the root under `[name]-[hash]`: so its file name, from the
 * root. A `data:` URL is its own.
 */
const fromRoot = (url: string) =>
  url.startsWith('data:') ? url : `/${url.slice(url.lastIndexOf('/') + 1)}`;

/** `face`'s `@font-face` rule, its file named from the pages' root. */
const faceRule = (face: Face) =>
  `@font-face{font-family:'${face.family}';src:url(${fromRoot(face.url)}) format('woff2');` +
  `font-weight:${face.weight};font-style:${face.style};font-display:${UI_DISPLAY};unicode-range:${face.range}}`;

/**
 * The UI faces in a page's head (`page-server.tsx`), for its first paint:
 * the first paint's files (`FIRST_PAINT`) fetched with the page, ahead of
 * its scripts, and every subset declared there (`UI_DISPLAY`), so the
 * chrome's text the server rendered is first drawn in its face, not once the
 * page's scripts have run. No stylesheet holds a face's bytes.
 */
export const FACE_HEAD =
  FIRST_PAINT.map(
    (face) =>
      `<link rel="preload" href="${fromRoot(face.url)}" as="font" type="font/woff2" crossorigin>`,
  ).join('') + `<style>${UI_FACES.map(faceRule).join('')}</style>`;

/**
 * The attribute a page's root element (`<html>`) carries once its root is
 * shown: `in` once the first paint's faces have loaded, `late` once
 * `CAP_MS` passed first or a file would not load.
 */
const SHOWN = 'data-faces';

/** How long, in ms, a page's root waits for the first paint's faces before it shows in their fallbacks. */
const CAP_MS = 1000;

/**
 * The hold on a page's root (`root`, a selector of it) until the first
 * paint's faces have loaded: its `head`, for a page's head after
 * `FACE_HEAD`, and its terms (the attribute `shown` it sets on `<html>`,
 * its cap `capMs`, its `script`). The root is kept out of paint
 * (`visibility: hidden`, never `display: none`, so it is laid out and its
 * machines run) and shown once `document.fonts.load` has each preloaded
 * face (`FIRST_PAINT`), so the first frame it paints is set in them and
 * nothing the owner sees moves when they land. Under `block` a text-sized
 * box (the timecode) would still be drawn in the fallback's width and then
 * move; the hold is what keeps it still. Past `capMs`, or when a file will
 * not load, the root shows in the fallbacks (`tokens.css`) and the page
 * logs `[lab] fonts.late` once.
 */
export const faceHold = (root: string) => {
  const loads = FIRST_PAINT.map((face) => `f.load("1em '${face.family}'")`).join(',');
  const script =
    `<script>(()=>{const d=document.documentElement,f=document.fonts;` +
    `const show=(how,why)=>{if(d.hasAttribute('${SHOWN}'))return;d.setAttribute('${SHOWN}',how);` +
    `if(how==='late')console.info('[lab] fonts.late reason='+why+' cap_ms=${CAP_MS}')};` +
    `setTimeout(()=>show('late','cap'),${CAP_MS});` +
    `Promise.all([${loads}]).then(()=>show('in'),()=>show('late','failed'))})()</script>`;
  return {
    head: `<style>html:not([${SHOWN}]) ${root}{visibility:hidden}</style>${script}`,
    script,
    shown: SHOWN,
    capMs: CAP_MS,
  };
};

/** How a picture face is added to a page's fonts: drawn only once it has loaded. */
const PICTURE_DISPLAY: FontDisplay = 'block';

/** The UI faces' families: the chrome's, which no frame waits for. */
const UI_FAMILIES: ReadonlySet<string> = new Set([WORDS_FAMILY, MONO_FAMILY]);

/**
 * The faces a film draws in, asked for: added to the page's fonts the first
 * time (`block`, as the chrome's faces are) and every file
 * fetched from then on. Asking waits for none of them, so the page's chrome
 * and the film's bar stand while they load; what draws the film waits for
 * them instead (`pictureFacesWait`): the preview's canvas, the stills, the
 * render page's handle. A film's loader asks (`narratedFilms`), so the faces
 * are on the page before the film is given. Read as it runs, so making it
 * reads no `document`.
 */
export const pictureFaces = (faces: ReadonlyArray<Face>): Effect.Effect<void> =>
  Effect.runSync(
    Effect.cached(
      Effect.sync(() => {
        for (const font of added(document.fonts, faces, PICTURE_DISPLAY))
          // A face that will not load fails the wait for it (`pictureFacesWait`), not the asking.
          font.load().catch(() => undefined);
      }),
    ),
  );

/**
 * The wait for the picture faces in `fonts` (a page's `document.fonts`, the
 * ones `pictureFaces` asked for): none when every one has loaded, or none
 * was asked for, so a page whose faces are in draws at once; else until each
 * has, so text measures and draws true from the first frame whatever
 * families and scripts the film draws (a frame or a still drawn in a
 * fallback face is a wrong one). A face that will not load fails it. The UI
 * faces are the chrome's (`UI_FAMILIES`): a subset no text has needed is
 * never loaded, and no frame waits for one.
 */
export const pictureFacesWait = (fonts: FontFaceSet): Option.Option<Effect.Effect<void>> => {
  const loading = Array.from(fonts).filter(
    (font) =>
      font.display === PICTURE_DISPLAY &&
      !UI_FAMILIES.has(unquoted(font.family)) &&
      font.status !== 'loaded',
  );
  return Option.as(
    Option.liftPredicate(loading, (l) => l.length > 0),
    Effect.asVoid(Effect.promise(() => Promise.all(loading.map((font) => font.loaded)))),
  );
};
