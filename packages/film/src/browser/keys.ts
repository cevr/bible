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
// in time. It also hears which input the viewer last used (`inputs`: a key
// pressed or a pointer put down, heard before any control handles it; a key
// pressed while a pointer is down is the click's, not the keyboard's), so
// the hub knows whether the keyboard asked for a command (`Invocation.input`)
// and whether a key the browser walks the history by asked for a step
// through it (`Heard.walks`).
// The page it listens on is the adapter's (`keysOn`): the window live
// (`keys-browser.ts`), a test's own `EventTarget` in a test.

import { Context, Effect, Layer, Option, Schema } from 'effect';

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
  /**
   * Hear which input the viewer uses until interrupted: `heard` gets `key`
   * for every key pressed, unless a pointer is down (a key in the middle of a
   * click is the click's), and `pointer` for every pointer put down (a mouse,
   * a pen, a finger), handled by a control or not.
   */
  readonly inputs: (heard: (input: Heard) => void) => Effect.Effect<never>;
}

/**
 * The input that asked for a move: a key pressed, or a pointer put down. The
 * lab shows its focus ring where the keyboard asked (`lab/focus.ts`). The one
 * declaration: the hub, the studio's slot and the e2e walkers read this.
 */
export const Input = Schema.Literals(['key', 'pointer']);
export type Input = typeof Input.Type;

/** An input heard: which, and for a key, whether it is one the browser walks the history by. */
export interface Heard {
  readonly input: Input;
  /**
   * Whether the press is a key the browser steps back or forward by (Alt+← or
   * Alt+→; ⌘[, ⌘], ⌘← or ⌘→; a keyboard's own Back and Forward keys) that no
   * control on the page took for its own: read when the step comes, after
   * every control has heard the press.
   */
  readonly walks: () => boolean;
}

/**
 * Whether a browser is on an Apple device, whose keyboard is a Mac's (its
 * command key ⌘), by its `User-Agent`: the device its parentheses open with
 * is a Mac (`Macintosh`), an iPhone, an iPad or an iPod. The rule a page
 * reads its keys and labels its chords by, read from one string on both
 * sides: the server from the request's header, the browser from
 * `navigator.userAgent`, the same string, so a page's first paint and its
 * hydration label every chord alike.
 */
export const appleAgent = (userAgent: string): boolean =>
  /\((?:Macintosh|iPhone|iPad|iPod)\b/.test(userAgent);

export class Keys extends Context.Service<Keys, KeysOps>()('@bible/film/browser/Keys') {
  /** Presses heard on `page` (the window live, a test's `EventTarget` in a test), from a Mac's keyboard or not. */
  static readonly layerOn = (page: EventTarget, mac = false): Layer.Layer<Keys> =>
    Layer.succeed(Keys, keysOn(page, mac));
}

/**
 * An event as a key press may carry it: each field unknown until read, as
 * the page hears `Event`s (a test's carries them as its own).
 */
interface KeyFields extends Pick<Event, 'defaultPrevented' | 'target'> {
  readonly key?: unknown;
  readonly code?: unknown;
  readonly shiftKey?: unknown;
  readonly metaKey?: unknown;
  readonly ctrlKey?: unknown;
  readonly altKey?: unknown;
  readonly isComposing?: unknown;
}

/** A pointer event as the page hears it: its pointer's id, unknown until read. */
interface PointerFields extends Pick<Event, 'target'> {
  readonly pointerId?: unknown;
}

/** Whether `e` is a press the page hears: not handled already, not composing text. */
const heard = (e: KeyFields): boolean =>
  'key' in e && !e.defaultPrevented && e.isComposing !== true;

/** The key press `e` is, if the page hears it. */
const pressOf = (e: KeyFields): Option.Option<KeyPress> =>
  Option.liftPredicate(e, heard).pipe(
    Option.map((ev) => ({
      key: String(ev.key),
      code: String(Option.getOrElse(Option.fromNullishOr(ev.code), () => '')),
      shift: ev.shiftKey === true,
      meta: ev.metaKey === true,
      ctrl: ev.ctrlKey === true,
      alt: ev.altKey === true,
      target: Option.fromNullishOr(ev.target),
    })),
  );

/** Whether `e` is a chord the browser walks the history by. */
const walking = (e: KeyFields): boolean => {
  const key = String(e.key);
  if (key === 'BrowserBack' || key === 'BrowserForward') return true;
  if (e.altKey === true) return key === 'ArrowLeft' || key === 'ArrowRight';
  if (e.metaKey === true) return ['[', ']', 'ArrowLeft', 'ArrowRight'].includes(key);
  return false;
};

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
  inputs: (heard) =>
    Effect.callback<never>(() => {
      const listening = new AbortController();
      // Captured, so a press a control handles (⌘K's Enter, a menu's arrow) is heard too.
      const on = { capture: true, signal: listening.signal };
      // The pointers down now: a key pressed while one is (Shift held mid-click) is the click's.
      const down = new Set<unknown>();
      const up = (e: PointerFields) => down.delete(e.pointerId);
      page.addEventListener(
        'keydown',
        (e: KeyFields) => {
          if (down.size > 0) return;
          heard({ input: 'key', walks: () => walking(e) && !e.defaultPrevented });
        },
        on,
      );
      page.addEventListener(
        'pointerdown',
        (e: PointerFields) => {
          down.add(e.pointerId);
          heard({ input: 'pointer', walks: () => false });
        },
        on,
      );
      // Heard, never ended here: a pointer's lift only says it is up (`Pointer.press` ends a drag).
      // oxlint-disable-next-line film/host-events-through-adapter -- Keys' own: whether a pointer is down
      page.addEventListener('pointerup', up, on);
      // oxlint-disable-next-line film/host-events-through-adapter -- Keys' own: whether a pointer is down
      page.addEventListener('pointercancel', up, on);
      // A pointer let go outside the window is never heard going up: the window's own blur lets
      // it go (not an element's, which the capture hears too as a click moves the focus).
      page.addEventListener(
        'blur',
        (e) => {
          if (e.target === page) down.clear();
        },
        on,
      );
      return Effect.sync(() => listening.abort());
    }),
});
