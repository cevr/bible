// A page's unsent comments: one draft per thing, kept while the page lives, so
// a comment box that closes keeps its text. The Set's and Choices' inspectors
// (`inspector.tsx`) and the Scenes page's sheets (`scenes/view.tsx`) keep
// theirs here.

import { Option } from 'effect';
import { createStore } from 'solid-js';

/** A comment box's unsent text, read reactively: a box that closes keeps it. */
export interface Draft {
  readonly get: () => string;
  readonly set: (text: string) => void;
}

/**
 * The page's unsent comments, one per key, in one store: every box of a key
 * reads the one draft, so a say that lands after its box closed empties the
 * box opened since. Written from a box's events and a say's answer, never as
 * something renders.
 */
export const draftBook = (): ((key: string) => Draft) => {
  const [drafts, setDrafts] = createStore<Record<string, string>>({});
  return (key) => ({
    get: () => Option.getOrElse(Option.fromUndefinedOr(drafts[key]), () => ''),
    set: (text) => {
      setDrafts((d) => {
        d[key] = text;
      });
    },
  });
};
