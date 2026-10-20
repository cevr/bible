// Compile-time checks of a seen visit (`tsc -p tsconfig.test.json` runs them; nothing imports
// this module): a press at once always carries its label and its try, and a later press has
// neither.

import type { Seen } from './list.test';

export const aPressAtOnceIsLabelled = (v: Seen) => {
  if (v.press === 'now') {
    const label: boolean = v.leftBeforeScrollEvent;
    const tries: number = v.tries;
    return { label, tries };
  }
  // @ts-expect-error: a later press has no label.
  void v.leftBeforeScrollEvent;
  // @ts-expect-error: a later press has no try.
  return v.tries;
};
