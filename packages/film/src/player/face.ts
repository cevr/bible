// The faces a page draws in, each subset a woff2 file of its own: the
// studio's UI face, JetBrains Mono (`@fontsource-variable/jetbrains-mono`,
// OFL), which the chrome shows under the family `--font` names first
// (`tokens.css`), and the faces a film draws in, which only its canvas shows
// (an app's own, `pictureFaces`). Every file is imported from a script, never
// linked from a stylesheet: the bundler inlines a stylesheet's `url()` as a
// `data:` URI, so every face would hold the page's first paint, but emits a
// script's import as its own file at an absolute URL named by its content's
// hash (`/…-<hash>.woff2`), which the lab answers by its asset route behind
// `admit`, as any script, and a changed file reaches an open page as any
// changed source does.

import { Effect } from 'effect';
import greek from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-greek-wght-normal.woff2';
import latinExt from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-ext-wght-normal.woff2';
import latin from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2';

/** The characters each script's subset holds (Google Fonts' and fontsource's ranges). */
export const SUBSETS = {
  latin:
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  latinExt:
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
  greek: 'U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF',
  hebrew: 'U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F',
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

/** The family the tokens name first. */
const FACE_FAMILY = 'JetBrains Mono';

/** One of the UI face's subsets: a variable file spanning every weight. */
const uiFace = (url: string, range: string): Face => ({
  family: FACE_FAMILY,
  url,
  range,
  weight: '100 800',
  style: 'normal',
});

/** The subset a page's head declares (`FACE_HEAD`): the chrome's text is latin. */
const HEAD_FACE = uiFace(latin, SUBSETS.latin);

/** The UI face's subsets. */
const UI_FACES: ReadonlyArray<Face> = [
  uiFace(greek, SUBSETS.greek),
  uiFace(latinExt, SUBSETS.latinExt),
  HEAD_FACE,
];

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
 * Register the UI face's subsets into `fonts` (a page's `document.fonts`)
 * but the one its head declared (`FACE_HEAD`, on a page the server
 * rendered); each loads when text first needs it, the chrome showing its
 * fallback until then (`swap`).
 */
export const registerFace = (fonts: FontFaceSet): void => {
  const inHead = Array.from(fonts).some((font) => unquoted(font.family) === FACE_FAMILY);
  added(
    fonts,
    UI_FACES.filter((face) => !inHead || face !== HEAD_FACE),
    'swap',
  );
};

/**
 * A file's URL from the pages' root. The browser's build names it there
 * (`/…-<hash>.woff2`, the pages' public path); the server's names it beside
 * its own output (`./…-<hash>.woff2`), by the same content hash, since both
 * are built from the same sources under the same root and a server's chunks
 * import each other by a relative path. A `data:` URL is its own.
 */
const fromRoot = (url: string) => url.replace(/^\.\//, '/');

/**
 * The UI face's latin subset in a page's head (`page-server.tsx`), for its
 * first paint: fetched with the page, ahead of its scripts, and declared
 * there (`swap`), so the chrome's text the server rendered shows in it once
 * it lands, not once the page's scripts have run. The only font a page
 * fetches before it paints, and no stylesheet holds its bytes.
 */
export const FACE_HEAD =
  `<link rel="preload" href="${fromRoot(latin)}" as="font" type="font/woff2" crossorigin>` +
  `<style>@font-face{font-family:'${FACE_FAMILY}';src:url(${fromRoot(latin)}) format('woff2');` +
  `font-weight:${HEAD_FACE.weight};font-style:normal;font-display:swap;unicode-range:${SUBSETS.latin}}</style>`;

/**
 * The faces a film draws in, loaded: added to the page's fonts the first
 * time they are asked for (`block`: a picture face is never the chrome's
 * text), then every file fetched, so text measures and draws true from the
 * first frame whatever families and scripts the film draws. A film's loader
 * runs it (`narratedFilms`), so no canvas or still draws before them: a still
 * drawn in a fallback face is a wrong still. A face that will not load fails
 * the load. Read as it runs, so making it reads no `document`.
 */
export const pictureFaces = (faces: ReadonlyArray<Face>): Effect.Effect<void> => {
  const registered = Effect.runSync(
    Effect.cached(Effect.sync(() => added(document.fonts, faces, 'block'))),
  );
  return Effect.flatMap(registered, (fonts) =>
    Effect.promise(() => Promise.all(fonts.map((font) => font.load()))),
  ).pipe(Effect.asVoid);
};
