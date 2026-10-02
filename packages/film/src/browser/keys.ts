// The page's keys: every key listener on the pages (the player's, the notes'
// `n` and Escape, the editor's undo and Escape, the review's players and its
// lightbox) goes through `Keys.listen`, and reads one answer to whether a
// press is typing: its target is a field (an input, a textarea, a select) or
// editable text. `take` runs in the press's own dispatch, so the default of a
// press it takes is prevented in time. The page it listens on is the
// adapter's (`keysOn`): the window live (`keys-browser.ts`), a test's own
// `EventTarget` in a test.

import { Context, Effect, Layer, Option } from 'effect';

/** A key press as the pages read it. */
export interface KeyPress {
  /** `KeyboardEvent.key`. */
  readonly key: string;
  readonly shift: boolean;
  readonly meta: boolean;
  readonly ctrl: boolean;
  readonly alt: boolean;
  /** Whether the press is typed into a field or editable text, and so belongs to it. */
  readonly typing: boolean;
}

interface KeysOps {
  /**
   * Hear the page's key presses until interrupted: `take` gets each and
   * answers whether it took it (its default is then prevented).
   */
  readonly listen: (take: (press: KeyPress) => boolean) => Effect.Effect<never>;
}

export class Keys extends Context.Service<Keys, KeysOps>()('@bible/film/browser/Keys') {
  /** Presses heard on `page`: the window live, a test's `EventTarget` in a test. */
  static readonly layerOn = (page: EventTarget): Layer.Layer<Keys> =>
    Layer.succeed(Keys, keysOn(page));
}

/** The fields a press can be typed into. */
const FIELDS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** Whether `target` takes typing: a field, or editable text. */
const typedInto = (target: EventTarget): boolean =>
  ('tagName' in target && FIELDS.has(String(target.tagName))) ||
  ('isContentEditable' in target && target.isContentEditable === true);

/** The key press `e` is, if it is one. */
const pressOf = (e: Event): Option.Option<KeyPress> =>
  Option.liftPredicate(e, (ev) => 'key' in ev).pipe(
    Option.map((ev) => ({
      key: String(Reflect.get(ev, 'key')),
      shift: Reflect.get(ev, 'shiftKey') === true,
      meta: Reflect.get(ev, 'metaKey') === true,
      ctrl: Reflect.get(ev, 'ctrlKey') === true,
      alt: Reflect.get(ev, 'altKey') === true,
      typing: Option.exists(Option.fromNullishOr(ev.target), typedInto),
    })),
  );

/** The key presses on `page`. */
const keysOn = (page: EventTarget): KeysOps => ({
  listen: (take) =>
    Effect.callback<never>(() => {
      const listening = new AbortController();
      page.addEventListener(
        'keydown',
        (e) => {
          if (Option.exists(pressOf(e), take)) e.preventDefault();
        },
        { signal: listening.signal },
      );
      return Effect.sync(() => listening.abort());
    }),
});
