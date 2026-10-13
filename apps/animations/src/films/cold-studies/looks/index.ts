// The looks, by name: one line each. The study plays the one `palette.ts`
// names (`looks.style.play`, which `look --level style=<name>` and a pick
// rewrite); a name the palette lists and this does not is a compile error.

import type { Look } from '../look.ts';
import { STYLE, type Style } from '../palette.ts';
import { bold } from './bold/index.ts';
import { cutpaper } from './cutpaper/index.ts';
import { engraving } from './engraving/index.ts';
import { painterly } from './painterly/index.ts';
import { papercut, papercutgl } from './papercut/index.ts';
import { ps1 } from './ps1/index.ts';
import { rive, rivegl } from './rive/index.ts';

const LOOKS: Readonly<Record<Style, Look>> = {
  cutpaper,
  ps1,
  painterly,
  engraving,
  bold,
  rive,
  rivegl,
  papercut,
  papercutgl,
};

/** The look the study plays. */
export const lookOf = (): Look => LOOKS[STYLE];
