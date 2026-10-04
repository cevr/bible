// The studio's UI face, JetBrains Mono (`@fontsource-variable/jetbrains-mono`,
// OFL), self-hosted: its latin, latin-ext and greek subsets, one variable
// woff2 each, registered into a page's fonts under the family `--font`
// names (`tokens.css`). The files are imported here, not from a stylesheet,
// because the bundler inlines a stylesheet's `url()` as a `data:` URI but
// emits a script's import as its own file at an absolute URL (`/…woff2`),
// which the lab answers by its asset route behind `admit`. The film's own
// faces are the picture's and stay in its `fonts.css`.

import greek from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-greek-wght-normal.woff2';
import latinExt from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-ext-wght-normal.woff2';
import latin from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2';

/** The family the tokens name first. */
const FACE_FAMILY = 'JetBrains Mono';

/** Each subset's file and the characters it holds (fontsource's own ranges). */
const FACE_SUBSETS: ReadonlyArray<{ readonly url: string; readonly range: string }> = [
  {
    url: greek,
    range: 'U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF',
  },
  {
    url: latinExt,
    range:
      'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
  },
  {
    url: latin,
    range:
      'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  },
];

/** Register the UI face's subsets into `fonts` (a page's `document.fonts`); each loads when text first needs it. */
export const registerFace = (fonts: FontFaceSet): void =>
  FACE_SUBSETS.forEach(({ url, range }) => {
    fonts.add(
      new FontFace(FACE_FAMILY, `url(${url}) format('woff2')`, {
        weight: '100 800',
        style: 'normal',
        display: 'swap',
        unicodeRange: range,
      }),
    );
  });
