// Version 2's credits, from its own script.
//
// The sources the credits roll (the framework's `creditRoll`): each beat's
// `cite`, grouped under the film's authors in the order given here, after
// scripture; then the line each CC BY recording its sound places owes
// (`soundCredits`), which `film check` holds the roll to.

import { type Author, type Credit, creditRoll } from '@bible/film/canvas';
import { soundCredits } from '@bible/film/core';
import { library } from '../../../../sounds/library.ts';
import { TITLE, script } from './script.ts';
import { sound } from './sound.ts';

/** The authors the sources are grouped under, in the order the credits give them, after scripture. */
const AUTHORS: ReadonlyArray<Author> = [
  { name: 'Ellen G. White' },
  { name: 'E. J. Waggoner' },
  { name: 'A. T. Jones' },
  {
    name: 'Fundamental Principles of the Seventh-day Adventists',
    citedAs: 'Fundamental Principles',
  },
];

/** The film's roll. */
export const CREDITS: ReadonlyArray<Credit> = creditRoll(
  TITLE,
  script.flatMap((b) => b.cite ?? []),
  AUTHORS,
  soundCredits(library, sound),
);
