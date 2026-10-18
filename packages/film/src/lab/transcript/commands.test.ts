// Select to here on words: on a word the menu opened on, the words selected
// in its section extended to it, from the first of them to that word,
// whichever comes first (a phone's range: no Shift); none with nothing
// selected in the word's section, on the word selected alone, or on no one
// word.

import { Option } from 'effect';
import { describe, expect, test } from 'effect-bun-test';
import { type Context, contextAt, withSelection } from '../../command/context.ts';
import { Selection, type WordsSelection } from '../../command/selection.ts';
import { selectedTo } from './commands.ts';

const here = contextAt('player', '/films/talk/studio?sel=beat:ask#t=1');

const words = (scene: string, from: number, to: number): WordsSelection =>
  Selection.cases.Words.make({ scene, from, to });
/** The menu opened on word `index` of `scene`. */
const onWord = (scene: string, index: number): Context =>
  withSelection(here, [words(scene, index, index)]);

describe('Select to here', () => {
  const selection = Option.some(words('ask', 3, 6));

  test('extends the words selected in its section to the word held, from their first word, whichever comes first', () => {
    expect(selectedTo(onWord('ask', 9), selection)).toEqual(Option.some(words('ask', 3, 9)));
    expect(selectedTo(onWord('ask', 1), selection)).toEqual(Option.some(words('ask', 1, 3)));
    expect(selectedTo(onWord('ask', 4), selection)).toEqual(Option.some(words('ask', 3, 4)));
    expect(selectedTo(onWord('ask', 4), Option.some(words('ask', 3, 3)))).toEqual(
      Option.some(words('ask', 3, 4)),
    );
  });

  test('selects nothing with nothing selected in the word’s section, on the word selected alone, or on no one word', () => {
    expect(selectedTo(onWord('ask', 4), Option.none())).toEqual(Option.none());
    expect(selectedTo(onWord('ask', 4), Option.some(words('answer', 1, 1)))).toEqual(Option.none());
    expect(selectedTo(onWord('ask', 4), Option.some(words('ask', 4, 4)))).toEqual(Option.none());
    expect(selectedTo(here, Option.some(words('ask', 3, 3)))).toEqual(Option.none());
  });
});
