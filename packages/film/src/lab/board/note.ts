// A note on a storyboard panel, as the Board posts it: the lab's own note
// (`core/schema.ts`), additive fields only, so every reader of notes (the
// Lab's list, `film notes`, an agent) reads it as it reads any other. Its
// scene is the panel's beat, its time the moment the panel is held from (its
// mark, said), its mark the panel's; `panel` names the panel, the try shown
// (none on a card or a verse) and what it asks; `sketch` is what was drawn
// on it. A tweak (`ask: 'tweak'`) is the one an agent acts on, with
// `film board tweak <film> <note>`: its still is the panel with the sketch
// drawn over it, which rides along to the image route as a reference. Pure.

import { Boolean as Bool, Option, Predicate } from 'effect';
import { PANEL_START, type Panel } from '../../core/board.ts';
import type { SketchItem } from '../../core/sketch.ts';
import type { NoteDraft } from '../../core/schema.ts';
import { onTheMs } from '../../core/time.ts';

/** What a note on a panel asks: a comment, or a tweak an agent makes. */
export type PanelAsking = 'note' | 'tweak';

/** What the Board's composer has when it posts. */
interface PanelNote {
  readonly panel: Panel;
  /** The try shown as it was written: none on a card or a verse panel. */
  readonly tried: Option.Option<number>;
  readonly asking: PanelAsking;
  readonly text: string;
  readonly sketch: ReadonlyArray<SketchItem>;
  /** Film seconds the panel is held from, and where its beat starts. */
  readonly at: number;
  readonly beatStart: number;
  readonly fps: number;
}

/** The words a note says, or why it cannot be posted: a tweak needs a try to start from, and every note needs words or a sketch. */
export const panelNoteOf = (n: PanelNote): Option.Option<NoteDraft> => {
  const text = n.text.trim();
  if (text === '' && n.sketch.length === 0) return Option.none();
  if (n.asking === 'tweak' && (Option.isNone(n.tried) || Predicate.isNotUndefined(n.panel.text)))
    return Option.none();
  const T = onTheMs(n.at);
  return Option.some({
    scene: n.panel.beat,
    T,
    local: onTheMs(Math.max(0, n.at - n.beatStart)),
    frame: Math.round(n.at * n.fps),
    // A sketch with no words says what it is: an agent reads the sketch's shapes too.
    text: Bool.match(text === '', { onTrue: () => 'see the sketch', onFalse: () => text }),
    ...Option.match(
      Option.liftPredicate(n.panel.at, (at) => at !== PANEL_START),
      { onNone: () => ({}), onSome: (mark) => ({ mark }) },
    ),
    panel: {
      id: n.panel.id,
      ...Option.match(n.tried, { onNone: () => ({}), onSome: (tried) => ({ try: tried }) }),
      ...Option.match(
        Option.liftPredicate(n.asking, (a) => a === 'tweak'),
        { onNone: () => ({}), onSome: () => ({ ask: 'tweak' as const }) },
      ),
    },
    ...Option.match(
      Option.liftPredicate(n.sketch, (s) => s.length > 0),
      { onNone: () => ({}), onSome: (sketch) => ({ sketch }) },
    ),
  });
};

/** The command an agent runs on a tweak note: what the Board says once one is posted. */
export const tweakCommand = (film: string, note: string): string =>
  `bun run board tweak ${film} ${note}`;
