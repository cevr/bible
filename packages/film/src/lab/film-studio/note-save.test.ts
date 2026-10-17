// A note the inspector saves, with no page: a tweak saved once through the
// provider's save, with the words and marks it was asked with; one asked
// while another is on its way is not sent; a landed save names its note
// and says what happens next, a refused one the lab's words.

import { Boolean as Bool, Deferred, Effect, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import type { SketchItem } from '../../core/sketch.ts';
import { type NoteSave, NoteSaveEvent, noteSaveLine, spawnNoteSave } from './note-save.ts';

const CIRCLE: SketchItem = {
  _tag: 'Ellipse',
  id: 's1',
  ink: 'red',
  x: 0.2,
  y: 0.3,
  w: 0.1,
  h: 0.1,
};

describe('a note the inspector saves', () => {
  it.effect('saves a tweak once, with its words and marks, and names the note it filed', () => {
    const sent: Array<NoteSave> = [];
    return Effect.gen(function* () {
      const actor = yield* spawnNoteSave((save) =>
        Effect.sync(() => {
          sent.push(save);
          return 'n7';
        }),
      );
      yield* actor.send(
        NoteSaveEvent.Save({ ask: 'tweak', text: 'her hand lower', replace: '', sketch: [CIRCLE] }),
      );
      const saved = yield* actor.waitFor((s) => s._tag === 'Saved');
      expect(saved).toMatchObject({ _tag: 'Saved', ask: 'tweak', id: 'n7' });
      expect(sent).toEqual([
        { ask: 'tweak', text: 'her hand lower', replace: '', sketch: [CIRCLE] },
      ]);
      expect(noteSaveLine(saved)).toEqual(
        Option.some('Saved n7: an agent makes the panel again from it.'),
      );
    }).pipe(Effect.scoped);
  });

  it.effect('sends no save asked while another is on its way', () => {
    const sent: Array<NoteSave> = [];
    return Effect.gen(function* () {
      const held = yield* Deferred.make<void>();
      const actor = yield* spawnNoteSave((save) =>
        Effect.suspend(() => {
          sent.push(save);
          return Effect.as(Deferred.await(held), 'n8');
        }),
      );
      yield* actor.send(
        NoteSaveEvent.Save({ ask: 'note', text: 'too dark', replace: '', sketch: [] }),
      );
      const saving = yield* actor.waitFor((s) => s._tag === 'Saving');
      expect(noteSaveLine(saving)).toEqual(Option.some('Saving the note…'));
      yield* actor.send(
        NoteSaveEvent.Save({ ask: 'tweak', text: 'again', replace: '', sketch: [] }),
      );
      yield* Deferred.succeed(held, void 0);
      const saved = yield* actor.waitFor((s) => s._tag === 'Saved');
      expect(saved).toMatchObject({ _tag: 'Saved', ask: 'note', id: 'n8' });
      expect(sent.map((s) => s.text)).toEqual(['too dark']);
      expect(noteSaveLine(saved)).toEqual(Option.some('Saved n8: it waits in Notes and asks.'));
    }).pipe(Effect.scoped);
  });

  it.effect("says the lab's words when a save is refused, and saves again after", () =>
    Effect.gen(function* () {
      // The first save is refused, the second lands.
      let asked = 0;
      const actor = yield* spawnNoteSave(() =>
        Effect.suspend(() => {
          asked += 1;
          return Bool.match(asked === 1, {
            onTrue: () => Effect.fail('the lab is not running'),
            onFalse: () => Effect.succeed('n9'),
          });
        }),
      );
      yield* actor.send(NoteSaveEvent.Save({ ask: 'note', text: 'x', replace: '', sketch: [] }));
      const failed = yield* actor.waitFor((s) => s._tag === 'Failed');
      expect(noteSaveLine(failed)).toEqual(Option.some('Not saved: the lab is not running'));
      yield* actor.send(NoteSaveEvent.Save({ ask: 'note', text: 'x', replace: '', sketch: [] }));
      const saved = yield* actor.waitFor((s) => s._tag === 'Saved');
      expect(saved).toMatchObject({ _tag: 'Saved', ask: 'note', id: 'n9' });
    }).pipe(Effect.scoped),
  );
});
