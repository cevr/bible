// The studio's line icons: Films (the shell's), the transport's keys, the
// version chip's caret, the inspector's close and the act transition's glyph. Each draws its
// strokes only when shown (an element made is a hydration key taken).

import type { JSX } from '@solidjs/web';

/** The studio's icons, by name. */
type StudioIconName =
  | 'films'
  | 'start'
  | 'back'
  | 'play'
  | 'pause'
  | 'on'
  | 'end'
  | 'caret'
  | 'close';

const STROKES: Readonly<Record<StudioIconName, () => JSX.Element>> = {
  films: () => (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" />
      <rect x="13.5" y="3.5" width="7" height="7" />
      <rect x="3.5" y="13.5" width="7" height="7" />
      <rect x="13.5" y="13.5" width="7" height="7" />
    </>
  ),
  start: () => <path d="M5 5v14M19 5l-10 7 10 7z" />,
  back: () => <path d="M18 5l-9 7 9 7zM7 5v14" />,
  play: () => <path d="M7 4.5l12 7.5-12 7.5z" />,
  pause: () => <path d="M8 5v14M16 5v14" />,
  on: () => <path d="M6 5l9 7-9 7zM17 5v14" />,
  end: () => <path d="M19 5v14M5 5l10 7-10 7z" />,
  caret: () => <path d="M7 10l5 5 5-5" />,
  close: () => <path d="M6 6l12 12M18 6L6 18" />,
};

/** A line icon of the studio's, sized by its part's style. */
export const StudioIcon = (props: { readonly of: StudioIconName }) => (
  <svg class="st-icon" viewBox="0 0 24 24" aria-hidden="true">
    {STROKES[props.of]()}
  </svg>
);

/** The act transition's glyph on the band strip: two wedges meeting (⋈). */
export const TransitionGlyph = () => (
  <svg class="st-icon" viewBox="0 0 12 9" aria-hidden="true">
    <path d="M1 1l5 3.5L1 8zM11 1L6 4.5 11 8z" />
  </svg>
);
