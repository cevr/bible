// The keymap: which key runs which command. A command declares its default
// keys as chords (`mod+z`, `shift+arrowleft`, `?`); the viewer's overrides
// (kept in the browser, `hub.ts`) add a key to a command or take one away
// (`-<id>`, as VS Code's keybindings write a removal), so a rebound key is
// a default taken away and a key added. A press binds to a chord by its key
// and modifiers: `mod` is ⌘ or Ctrl, a letter reads the same with Caps Lock,
// Shift counts on a letter, a digit or a named key but not on a symbol (`?`
// is already shifted), a letter held with Alt reads by its physical key (⌥O
// types `ø`), and so does a digit held with Shift or Alt (⇧1 is `shift+1`
// whatever the layout types: the pages' ⇧1-⇧6). A command marked `stepped` also answers its keys held with
// Shift (its coarse step, ×10) and with Alt (its fine step), unless that
// chord is bound to something itself. Where focus is decides which commands'
// keys are live (`Focus`, `context.ts`): the page's on the page, only those
// that also run in a field there (Escape), and in the studio its own keys
// first, then the page's; on a control (a button, a link), the page's; the
// studio owns its keys, so one with nothing to do in the studio's state is
// still not the page's. Of the commands a press binds to, the last
// available one runs: a viewer's key, bound after the defaults, wins over a
// default on the same key. Pure.

import { Data, Option, Schema } from 'effect';
import type { KeyPress } from '../browser/keys.ts';
import type { Command, CommandId, Invocation } from './command.ts';
import type { Context, Focus } from './context.ts';

/** One override of the viewer's: `key` added to `command`, or taken from it (`-<id>`). */
const KeymapOverride = Schema.Struct({ key: Schema.String, command: Schema.String });

/** The viewer's overrides, in the order made: what the browser keeps. */
export const KeymapOverrides = Schema.Array(KeymapOverride);
export type KeymapOverrides = typeof KeymapOverrides.Type;

/** A key bound to a command: the chord in its canonical text. */
export interface Binding {
  readonly key: string;
  readonly command: CommandId;
}

/** A chord's modifiers, in the order its canonical text writes them. */
const MODIFIERS = ['mod', 'alt', 'shift'] as const;
type Modifier = (typeof MODIFIERS)[number];

/** The names a chord's text may give a modifier. */
const MODIFIER_NAMES: ReadonlyMap<string, Modifier> = new Map([
  ['mod', 'mod'],
  ['cmd', 'mod'],
  ['meta', 'mod'],
  ['ctrl', 'mod'],
  ['alt', 'alt'],
  ['option', 'alt'],
  ['shift', 'shift'],
]);

/** Other names for a key, read as its canonical one. */
const KEY_NAMES: ReadonlyMap<string, string> = new Map([
  [' ', 'space'],
  ['esc', 'escape'],
  ['left', 'arrowleft'],
  ['right', 'arrowright'],
  ['up', 'arrowup'],
  ['down', 'arrowdown'],
]);

const keyName = (key: string): string =>
  Option.getOrElse(Option.fromUndefinedOr(KEY_NAMES.get(key.toLowerCase())), () =>
    key.toLowerCase(),
  );

const isLetter = (name: string): boolean => name.toUpperCase() !== name.toLowerCase();

const isDigit = (name: string): boolean => name.length === 1 && name >= '0' && name <= '9';

/** Whether Shift is part of a chord on `name`: not on a symbol, which is already shifted. */
const shiftCounts = (name: string): boolean => name.length !== 1 || isLetter(name) || isDigit(name);

const chordText = (key: string, held: ReadonlySet<Modifier>): string =>
  [...MODIFIERS.filter((m) => held.has(m) && (m !== 'shift' || shiftCounts(key))), key].join('+');

/** The key a chord's parts end on: `+` itself when the text ends `++`. */
const lastKey = (parts: ReadonlyArray<string>): string =>
  Option.getOrElse(
    Option.filter(Option.fromUndefinedOr(parts.at(-1)), (p) => p !== ''),
    () => '+',
  );

/** A command's default keys. */
const defaultKeys = (command: Command): ReadonlyArray<string> =>
  Option.getOrElse(Option.fromUndefinedOr(command.keys), () => []);

/** A chord's canonical text (`Shift+Cmd+Z` is `mod+shift+z`), or none when it names no key. */
export const parseChord = (text: string): Option.Option<string> => {
  const parts = text.trim().split('+');
  const key = keyName(lastKey(parts));
  const named = parts.slice(0, -1).filter((p) => p !== '');
  const held = named.flatMap((p) =>
    Option.toArray(Option.fromUndefinedOr(MODIFIER_NAMES.get(p.toLowerCase()))),
  );
  return Option.liftPredicate(
    chordText(key, new Set(held)),
    () => held.length === named.length && key !== '',
  );
};

/** The key a press names: by its physical key when Alt is held on a letter or digit, or Shift on a digit. */
const pressedKey = (press: KeyPress): string =>
  Option.getOrElse(
    Option.filter(physical(press.code), (key) => press.alt || (press.shift && isDigit(key))),
    () => keyName(press.key),
  );

/** The letter or digit of a physical key (`KeyO` is `o`, `Digit1` is `1`). */
const physical = (code: string): Option.Option<string> =>
  Option.orElse(
    Option.liftPredicate(
      code.slice(3).toLowerCase(),
      () => code.startsWith('Key') && code.length === 4,
    ),
    () => Option.liftPredicate(code.slice(5), () => code.startsWith('Digit') && code.length === 6),
  );

const heldBy = (press: KeyPress): ReadonlySet<Modifier> =>
  new Set(
    MODIFIERS.filter(
      (m) => [press.meta || press.ctrl, press.alt, press.shift][MODIFIERS.indexOf(m)],
    ),
  );

/** The chord a press is, in its canonical text. */
export const chordOf = (press: KeyPress): string => chordText(pressedKey(press), heldBy(press));

/** `bound` with `key` added to `command`, or taken from it when it reads `-<id>`. */
const overridden = (
  bound: ReadonlyArray<Binding>,
  key: string,
  command: string,
): ReadonlyArray<Binding> => {
  if (!command.startsWith('-')) return [...bound, { key, command }];
  return bound.filter((b) => b.key !== key || b.command !== command.slice(1));
};

/** The bindings: each command's default keys, then the viewer's overrides in order. */
export const bindingsOf = (
  commands: ReadonlyArray<Command>,
  overrides: KeymapOverrides,
): ReadonlyArray<Binding> =>
  overrides.reduce<ReadonlyArray<Binding>>(
    (bound, o) =>
      Option.match(parseChord(o.key), {
        onNone: () => bound,
        onSome: (key) => overridden(bound, key, o.command),
      }),
    commands.flatMap((c) =>
      defaultKeys(c).flatMap((k) =>
        Option.toArray(Option.map(parseChord(k), (key) => ({ key, command: c.id }))),
      ),
    ),
  );

/** The keys bound to `id`, in binding order. */
export const keysOf = (bindings: ReadonlyArray<Binding>, id: CommandId): ReadonlyArray<string> =>
  bindings.filter((b) => b.command === id).map((b) => b.key);

/** `overrides` with nothing of `id`'s: its default keys again. */
export const resetKeys = (overrides: KeymapOverrides, id: CommandId): KeymapOverrides =>
  overrides.filter((o) => o.command !== id && o.command !== `-${id}`);

/** `overrides` binding `command` to `key` alone: its defaults taken away, `key` added. */
export const rebind = (
  overrides: KeymapOverrides,
  command: Command,
  key: string,
): KeymapOverrides => {
  const defaults = defaultKeys(command).flatMap((k) => Option.toArray(parseChord(k)));
  return Option.match(parseChord(key), {
    onNone: () => overrides,
    onSome: (chord) => [
      ...resetKeys(overrides, command.id),
      ...defaults.filter((d) => d !== chord).map((d) => ({ key: d, command: `-${command.id}` })),
      ...[chord].filter((c) => !defaults.includes(c)).map((c) => ({ key: c, command: command.id })),
    ],
  });
};

/** What a press does: run a command with a step, stop at a scope that owns it, or pass. */
export type Resolved = Data.TaggedEnum<{
  Run: { readonly command: Command; readonly how: Invocation };
  /** Bound in a scope that owns its keys (the studio), with nothing to do there now. */
  Owned: {};
  Pass: {};
}>;
export const Resolved = Data.taggedEnum<Resolved>();

/** The scopes a focus reads keys from, in order. */
const SCOPES: Readonly<Record<Focus, ReadonlyArray<Focus>>> = {
  page: ['page'],
  field: ['field'],
  studio: ['studio', 'page'],
  // A control hears the page's keys; only a command's `when` tells it from the page (Tab).
  control: ['page'],
};

/** The scopes that own their keys: a key bound there is not the next scope's. */
const OWNS: ReadonlySet<Focus> = new Set<Focus>(['studio']);

const PAGE_ONLY: ReadonlyArray<Focus> = ['page'];

/** The chords a press tries, in order, with the step each picks: itself, then its stepped forms. */
const triesOf = (press: KeyPress): ReadonlyArray<readonly [string, Invocation['step']]> => {
  const key = pressedKey(press);
  const held = heldBy(press);
  const without = (m: Modifier) => new Set([...held].filter((h) => h !== m));
  return [
    [chordText(key, held), 'normal'] as const,
    ...[[chordText(key, without('shift')), 'coarse'] as const].filter(() => press.shift),
    ...[[chordText(key, without('alt')), 'fine'] as const].filter(() => press.alt),
  ];
};

/** What `press` does in `ctx`, with `commands` registered and bound by `bindings`. */
export const resolve = (
  press: KeyPress,
  ctx: Context,
  commands: ReadonlyArray<Command>,
  bindings: ReadonlyArray<Binding>,
): Resolved => {
  const byId = new Map(commands.map((c) => [c.id, c]));
  const tries = triesOf(press);
  for (const scope of SCOPES[ctx.focus]) {
    const live = (c: Command) =>
      Option.getOrElse(Option.fromUndefinedOr(c.keysIn), () => PAGE_ONLY).includes(scope);
    let bound = false;
    for (const [chord, step] of tries) {
      const named = bindings
        .filter((b) => b.key === chord)
        .flatMap((b) => Option.toArray(Option.fromUndefinedOr(byId.get(b.command))))
        .filter((c) => live(c) && (step === 'normal' || c.stepped === true));
      bound = bound || named.length > 0;
      const ready = Option.fromUndefinedOr(named.filter((c) => c.when(ctx)).at(-1));
      if (Option.isSome(ready))
        return Resolved.Run({ command: ready.value, how: { step, via: 'key' } });
    }
    if (bound && OWNS.has(scope)) return Resolved.Owned();
  }
  return Resolved.Pass();
};

/** How a chord reads on the page: `⇧⌘Z` on a Mac, `Ctrl+Shift+Z` elsewhere. */
export const chordLabel = (chord: string, mac: boolean): string => {
  const parts = chord.split('+');
  const key = lastKey(parts);
  const held = new Set(parts.slice(0, -1));
  const shown = Option.getOrElse(Option.fromUndefinedOr(KEY_LABELS.get(key)), () =>
    Option.getOrElse(
      Option.liftPredicate(key.toUpperCase(), () => key.length === 1),
      () => key,
    ),
  );
  const style = STYLES[`${mac}`];
  const mods = MAC_ORDER.filter((m) => held.has(m)).map((m) => style.marks[m]);
  return [...mods, shown].join(style.between);
};

const KEY_LABELS: ReadonlyMap<string, string> = new Map([
  ['arrowleft', '←'],
  ['arrowright', '→'],
  ['arrowup', '↑'],
  ['arrowdown', '↓'],
  ['escape', 'Esc'],
  ['space', 'Space'],
  ['enter', 'Enter'],
  ['backspace', 'Backspace'],
  ['delete', 'Delete'],
  ['tab', 'Tab'],
]);

/** The order a Mac writes modifiers in (⌥⇧⌘); the PC's reads the same way. */
const MAC_ORDER: ReadonlyArray<Modifier> = ['alt', 'shift', 'mod'];
/** How each platform writes a chord: its modifiers' marks, and what goes between the parts. */
const STYLES: Readonly<
  Record<
    'true' | 'false',
    { readonly marks: Readonly<Record<Modifier, string>>; readonly between: string }
  >
> = {
  true: { marks: { mod: '⌘', alt: '⌥', shift: '⇧' }, between: '' },
  false: { marks: { mod: 'Ctrl', alt: 'Alt', shift: 'Shift' }, between: '+' },
};
