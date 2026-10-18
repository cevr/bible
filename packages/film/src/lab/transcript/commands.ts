// Select to here on words, as a command's `when` and `run` read it: the
// selection in a word's section extended to the word the menu opened on (a
// right-click, or a finger held still on it), so a phone, which has no Shift,
// selects a range as a laptop does: tap the first word, hold the last, Select
// to here. Pure.

import { Option } from 'effect';
import { type Context, selected } from '../../command/context.ts';
import { Selection, type WordsSelection } from '../../command/selection.ts';

/**
 * The words selected once `selection` is extended to word `index` of
 * `scene`: from its first word to that one, whichever comes first; a word
 * of another section (or no selection) is selected alone. What a shift-tap
 * and Select to here both make.
 */
const extendedTo = (
  selection: Option.Option<WordsSelection>,
  scene: string,
  index: number,
): WordsSelection => {
  const from = Option.getOrElse(
    Option.map(
      Option.filter(selection, (s) => s.scene === scene),
      (s) => s.from,
    ),
    () => index,
  );
  return Selection.cases.Words.make({
    scene,
    from: Math.min(from, index),
    to: Math.max(from, index),
  });
};

/**
 * The words Select to here selects from a word the menu opened on (one
 * word): the selection in its section extended to it; none with no selection
 * there, or when it would select what is selected already: the Script's
 * Select to here (`script/commands.ts`).
 */
export const selectedTo = (
  ctx: Context,
  selection: Option.Option<WordsSelection>,
): Option.Option<WordsSelection> =>
  Option.flatMap(
    Option.filter(selected(ctx, 'Words'), (w) => w.from === w.to),
    (word) =>
      Option.filter(
        Option.map(
          Option.filter(selection, (s) => s.scene === word.scene),
          () => extendedTo(selection, word.scene, word.from),
        ),
        (to) => !Option.exists(selection, (s) => s.from === to.from && s.to === to.to),
      ),
  );
