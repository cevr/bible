/**
 * The hymn page's text as the reader set it (`reading.ts`), handed down to
 * every line: the words' size, line height and family, the chord rows' size,
 * and the hanging indent of a wrapped line. A context, so a change of the
 * reading redraws the lines without redrawing the sections that hold them.
 */

import { createContext, use } from 'react';
import { Platform, type TextStyle } from 'react-native';

import { defaultReading, type Font, readingStyle, type ReadingStyle } from './reading';

export interface PageText {
  readonly words: TextStyle;
  readonly chords: TextStyle;
  /** How far a wrapped line's later rows sit right of its first, in points. */
  readonly indent: number;
}

/** A serif each platform has: Georgia on iOS, the system's serif on Android, the browser's on the web. */
const serif = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'ui-serif, Georgia, serif',
});

/** The family each font is drawn in: the system's own face takes no family. */
const families: Record<Font, TextStyle> = { system: {}, serif: { fontFamily: serif } };

export const pageTextOf = (style: ReadingStyle): PageText => ({
  words: { ...style.words, ...families[style.font] },
  chords: { ...style.chords, ...families[style.font] },
  indent: style.indent,
});

const PageTextContext = createContext<PageText>(pageTextOf(readingStyle(defaultReading, 1)));

export const PageTextProvider = PageTextContext.Provider;

export const usePageText = () => use(PageTextContext);
