import { color, useAccent } from './color';

/**
 * Every tab's stack: each screen on the theme's ground, its native header's
 * titles in ink and its back button in the accent. One's web stacks are
 * headless, so on the web only `contentStyle` draws.
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
