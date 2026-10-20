import { color, useAccent } from './color';

/**
 * Every tab's stack: each screen on the theme's ground and its native
 * header's titles in ink. The header's tint is the accent, but iOS 26's glass
 * back button draws its chevron and label in the system colour regardless.
 * One's web stacks are headless, so on the web only `contentStyle` draws.
 */
export const useStackOptions = () => {
  const accent = useAccent();
  return {
    contentStyle: { backgroundColor: color.ground },
    headerTintColor: accent,
    headerTitleStyle: { color: color.ink },
    headerLargeTitleStyle: { color: color.ink },
  };
};

/**
 * A pushed screen's header, on the ground: without it iOS draws the system's
 * white bar there. A stack's first screen leaves it out, because a header
 * background hides its large title.
 */
export const pushedOptions = { headerStyle: { backgroundColor: color.ground } };
