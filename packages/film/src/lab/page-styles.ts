// Each page's own styles, which its server render holds in its head before
// its markup (`page-server.tsx`) and its browser entry mounts with: the
// shell's and the commands' on every page, the review's and the Scenes
// tape's where they show. They hold its first paint with the stylesheets its
// HTML links, under one budget (`tools/page-css-budget.test.ts`).

import { COMMAND_CSS } from './command/style.ts';
import { SHELL_CSS } from './page-shell-style.ts';
import { REVIEW_CSS } from './review/style.ts';
import { SCENES_CSS } from './scenes/style.ts';

export const PAGE_STYLES = {
  /** The review's pages: Films, a film's Project and Choices, and the rest of `review.html`'s. */
  review: `${SHELL_CSS}${REVIEW_CSS}${COMMAND_CSS}${SCENES_CSS}`,
  /** The Lab's page. */
  lab: `${SHELL_CSS}${COMMAND_CSS}`,
  /** The Scenes and Play pages' page. */
  play: `${SHELL_CSS}${COMMAND_CSS}${SCENES_CSS}`,
} as const;
