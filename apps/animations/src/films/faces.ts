// The faces the films draw in (`palette.ts` names them), each subset a file
// of its own under `assets/fonts` (Google Fonts' cuts, OFL), declared as
// their `@font-face` rules were: the same family, style, weight and
// characters per file, in the same order. A film's loader loads them before
// it gives the film (`narratedFilms`), so a page with no canvas fetches none,
// and none of them holds a page's first paint.

import { type Face, SUBSETS, pictureFaces } from '@bible/film/player';
import ebGaramondItalicGreek from '../../assets/fonts/EBGaramond-italic-greek.woff2';
import ebGaramondItalicLatinExt from '../../assets/fonts/EBGaramond-italic-latin-ext.woff2';
import ebGaramondItalicLatin from '../../assets/fonts/EBGaramond-italic-latin.woff2';
import ebGaramondNormalGreek from '../../assets/fonts/EBGaramond-normal-greek.woff2';
import ebGaramondNormalLatinExt from '../../assets/fonts/EBGaramond-normal-latin-ext.woff2';
import ebGaramondNormalLatin from '../../assets/fonts/EBGaramond-normal-latin.woff2';
import frankRuhlLibreHebrew from '../../assets/fonts/FrankRuhlLibre-normal-hebrew.woff2';
import frankRuhlLibreLatinExt from '../../assets/fonts/FrankRuhlLibre-normal-latin-ext.woff2';
import frankRuhlLibreLatin from '../../assets/fonts/FrankRuhlLibre-normal-latin.woff2';
import frauncesItalicLatinExt from '../../assets/fonts/Fraunces-italic-latin-ext.woff2';
import frauncesItalicLatin from '../../assets/fonts/Fraunces-italic-latin.woff2';
import frauncesNormalLatinExt from '../../assets/fonts/Fraunces-normal-latin-ext.woff2';
import frauncesNormalLatin from '../../assets/fonts/Fraunces-normal-latin.woff2';
import gaegu400Latin from '../../assets/fonts/Gaegu-400-latin.woff2';
import gaegu700Latin from '../../assets/fonts/Gaegu-700-latin.woff2';
import interGreek from '../../assets/fonts/Inter-normal-greek.woff2';
import interLatinExt from '../../assets/fonts/Inter-normal-latin-ext.woff2';
import interLatin from '../../assets/fonts/Inter-normal-latin.woff2';

const FACES: ReadonlyArray<Face> = [
  {
    family: 'Fraunces',
    style: 'italic',
    weight: '300 800',
    url: frauncesItalicLatinExt,
    range: SUBSETS.latinExt,
  },
  {
    family: 'Fraunces',
    style: 'italic',
    weight: '300 800',
    url: frauncesItalicLatin,
    range: SUBSETS.latin,
  },
  {
    family: 'Fraunces',
    style: 'normal',
    weight: '300 800',
    url: frauncesNormalLatinExt,
    range: SUBSETS.latinExt,
  },
  {
    family: 'Fraunces',
    style: 'normal',
    weight: '300 800',
    url: frauncesNormalLatin,
    range: SUBSETS.latin,
  },
  { family: 'Inter', style: 'normal', weight: '400 700', url: interGreek, range: SUBSETS.greek },
  {
    family: 'Inter',
    style: 'normal',
    weight: '400 700',
    url: interLatinExt,
    range: SUBSETS.latinExt,
  },
  { family: 'Inter', style: 'normal', weight: '400 700', url: interLatin, range: SUBSETS.latin },
  {
    family: 'EB Garamond',
    style: 'italic',
    weight: '400 700',
    url: ebGaramondItalicGreek,
    range: SUBSETS.greek,
  },
  {
    family: 'EB Garamond',
    style: 'italic',
    weight: '400 700',
    url: ebGaramondItalicLatinExt,
    range: SUBSETS.latinExt,
  },
  {
    family: 'EB Garamond',
    style: 'italic',
    weight: '400 700',
    url: ebGaramondItalicLatin,
    range: SUBSETS.latin,
  },
  {
    family: 'EB Garamond',
    style: 'normal',
    weight: '400 700',
    url: ebGaramondNormalGreek,
    range: SUBSETS.greek,
  },
  {
    family: 'EB Garamond',
    style: 'normal',
    weight: '400 700',
    url: ebGaramondNormalLatinExt,
    range: SUBSETS.latinExt,
  },
  {
    family: 'EB Garamond',
    style: 'normal',
    weight: '400 700',
    url: ebGaramondNormalLatin,
    range: SUBSETS.latin,
  },
  {
    family: 'Frank Ruhl Libre',
    style: 'normal',
    weight: '400 700',
    url: frankRuhlLibreHebrew,
    range: SUBSETS.hebrew,
  },
  {
    family: 'Frank Ruhl Libre',
    style: 'normal',
    weight: '400 700',
    url: frankRuhlLibreLatinExt,
    range: SUBSETS.latinExt,
  },
  {
    family: 'Frank Ruhl Libre',
    style: 'normal',
    weight: '400 700',
    url: frankRuhlLibreLatin,
    range: SUBSETS.latin,
  },
  { family: 'Gaegu', style: 'normal', weight: '400', url: gaegu400Latin, range: SUBSETS.latin },
  { family: 'Gaegu', style: 'normal', weight: '700', url: gaegu700Latin, range: SUBSETS.latin },
];

/** The films' faces, loaded: added to the page's fonts the first time a film asks. */
export const faces = pictureFaces(FACES);
