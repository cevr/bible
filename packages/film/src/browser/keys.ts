// The page's keys: the one key listener on a page. The page's keymap
// (`command/hub.ts`) hears every press through `Keys.listen` and binds it to
// a command; nothing else on the page listens to the keyboard. A press
// reaches `take` with its key, the physical key it came from (`code`: a
// letter held with Alt still names its letter), its modifiers and its target
// (where focus was: the keymap reads from it whether a field has the keys,
// `command/context.ts`). A press some control on the page has already
// handled (its default prevented: a menu's arrow, a number field's step) and
// a press composing text (an input method's) are not heard. `take` runs in
// the press's own dispatch, so the default of a press it takes is prevented
// in time. The page it listens on is the adapter's (`keysOn`): the window
// live (`keys-browser.ts`), a test's own `EventTarget` in a test.

import { Context, Effect, Layer, Option } from 'effect';

/** A key press as the pages read it. */
export interface KeyPress {
  /** `KeyboardEvent.key`. */
  readonly key: string;
  /** `KeyboardEvent.code`: the physical key (`KeyO`), the empty text when the event has none. */
  readonly code: string;
  readonly shift: boolean;
  readonly meta: boolean;
  readonly ctrl: boolean;
  readonly alt: boolean;
  /** Where the press was aimed: the element focus was on. */
  readonly target: Option.Option<EventTarget>;
}

interface KeysOps {
  /** Whether the keyboard is a Mac's: its command key is ⌘ (a chord's `mod`), not Ctrl. */
  readonly mac: boolean;
  /**
   * Hear the page's key presses until interrupted: `take` gets each and
   * answers whether it took it (its default is then prevented).
   */
  readonly listen: (take: (press: KeyPress) => boolean) => Effect.Effect<never>;
}

export class Keys extends Context.Service<Keys, KeysOps>()('@bible/film/browser/Keys') {
  /** Presses heard on `page` (the window live, a test's `EventTarget` in a test), from a Mac's keyboard or not. */
  static readonly layerOn = (page: EventTarget, mac = false): Layer.Layer<Keys> =>
    Layer.succeed(Keys, keysOn(page, mac));
}

/** Whether `e` is a press the page hears: not handled already, not composing text. */
const heard = (e: Event): boolean =>
  'key' in e && !e.defaultPrevented && Reflect.get(e, 'isComposing') !== true;

/** The key press `e` is, if the page hears it. */
const pressOf = (e: Event): Option.Option<KeyPress> =>
  Option.liftPredicate(e, heard).pipe(
    Option.map((ev) => ({
      key: String(Reflect.get(ev, 'key')),
      code: String(Option.getOrElse(Option.fromNullishOr(Reflect.get(ev, 'code')), () => '')),
      shift: Reflect.get(ev, 'shiftKey') === true,
      meta: Reflect.get(ev, 'metaKey') === true,
      ctrl: Reflect.get(ev, 'ctrlKey') === true,
      alt: Reflect.get(ev, 'altKey') === true,
      target: Option.fromNullishOr(ev.target),
    })),
  );

/** The key presses on `page`. */
const keysOn = (page: EventTarget, mac: boolean): KeysOps => ({
  mac,
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
