// Fixture for film/booleans-through-pressed: each line marked RED fires the
// rule, and nothing else does.

import { type Accessor, createMemo, createSignal, type ParentProps } from 'solid-js';

declare const pressed: (on: boolean) => 'true' | 'false';
declare const on: () => boolean;
declare const staged: () => boolean;
declare const isLive: () => boolean;
declare const rate: () => number;
declare const loaded: () => number;
declare const kind: () => string;
declare const ready: boolean;
declare const raw: unknown;
declare const id: string;
declare const current: string;

const [open] = createSignal(false);
const shown = createMemo(() => id === current);
const empty = id === current;
const blank = () => id.length === 0;
function idle(): boolean {
  return ready;
}

export const Controls = () => (
  <div>
    <button aria-pressed={`${on()}`} /> {/* // RED film/booleans-through-pressed */}
    <button aria-selected={`${id === current}`} /> {/* // RED film/booleans-through-pressed */}
    <button aria-expanded={String(on())} /> {/* // RED film/booleans-through-pressed */}
    <button aria-busy={String(!on())} /> {/* // RED film/booleans-through-pressed */}
    <button aria-checked={`${on()}`} /> {/* // RED film/booleans-through-pressed */}
    <button aria-current={`${id === current}`} /> {/* // RED film/booleans-through-pressed */}
    <div data-flag={String(id === current)} /> {/* // RED film/booleans-through-pressed */}
    <div data-flag={String(!on())} /> {/* // RED film/booleans-through-pressed */}
    <div data-flag={String(isLive())} /> {/* // RED film/booleans-through-pressed */}
    <div data-staged={String(staged())} /> {/* // RED film/booleans-through-pressed */}
    {/* The whole expression is a boolean, by its form, its type or its binding. */}
    <div data-both={String(isLive() && on())} /> {/* // RED film/booleans-through-pressed */}
    <div data-either={`${on() || !ready}`} /> {/* // RED film/booleans-through-pressed */}
    <div data-ready={String(ready)} /> {/* // RED film/booleans-through-pressed */}
    <div data-open={String(open())} /> {/* // RED film/booleans-through-pressed */}
    <div data-shown={String(shown())} /> {/* // RED film/booleans-through-pressed */}
    <div data-empty={`${empty}`} /> {/* // RED film/booleans-through-pressed */}
    <div data-blank={String(blank())} /> {/* // RED film/booleans-through-pressed */}
    <div data-idle={String(idle())} /> {/* // RED film/booleans-through-pressed */}
    <div data-cast={String(raw as boolean)} /> {/* // RED film/booleans-through-pressed */}
    <div data-literal={String(false)} /> {/* // RED film/booleans-through-pressed */}
    <div data-p={String(ready ? on() : isLive())} /> {/* // RED film/booleans-through-pressed */}
    {/* Through pressed, a number, a plain string and a name pass. */}
    <button aria-pressed={pressed(on())} />
    <button aria-selected={pressed(id === current)} />
    <button aria-current="page" />
    <button aria-label={`${id} (${current})`} />
    <div data-rate={String(rate())} />
    <div data-name={`${id} · ${current}`} />
    <div data-flag={pressed(isLive())} />
    {/* No proof the whole value is a boolean: a value beside a flag, text around
        it, a name that only ends like a participle, a token. */}
    <div data-live={String(isLive() && rate())} />
    <div data-live={`${isLive()} item`} />
    <div data-loaded={String(loaded())} />
    <button aria-current={`${kind()}`} />
    {/* A predicate's name is no proof: the binding's type says what it gives. */}
    <div data-kind={String(isKind())} />
    <div data-p={String(ready ? true : isKind())} />
    <div data-on={String(store.isOn())} />
    <div data-cue={String(store.hasCue())} />
  </div>
);

const isKind: () => string = () => 'page';
declare const store: { readonly isOn: () => string; hasCue(): string };

/** A mapped type's members are its own: `AsStrings` makes each a string, whatever it maps. */
type AsStrings<T> = { [K in keyof T]: string };
export const Mapped = (p: AsStrings<{ readonly live: boolean }>) => (
  <span data-live={String(p.live)} />
);

/** A wrapper whose meaning keeps its argument's members: solid's, or the file's own. */
type Own<T> = T & { readonly ready: boolean };
export const Wrapped = (props: ParentProps<{ readonly live: boolean }>) => (
  <span data-live={String(props.live)} /> // RED film/booleans-through-pressed
);
export const Local = (props: Own<{ readonly live: boolean }>) => (
  <span>
    <i data-live={String(props.live)} /> {/* // RED film/booleans-through-pressed */}
    <i data-ready={String(props.ready)} /> {/* // RED film/booleans-through-pressed */}
  </span>
);

/** A parameter named like solid's maker is its own binding. */
export const Made = (createSignal: (v: boolean) => readonly [() => string]) => {
  const [s] = createSignal(false);
  return <span data-s={String(s())} />;
};

/** A component's props typed in place: its accessor's type is the proof. */
export const Panel = (props: {
  readonly staged: Accessor<boolean>;
  readonly count: Accessor<number>;
  readonly live: boolean;
  readonly maybe?: boolean;
}) => (
  <aside>
    <span data-staged={String(props.staged())} /> {/* // RED film/booleans-through-pressed */}
    <span data-live={`${props.live}`} /> {/* // RED film/booleans-through-pressed */}
    <span data-count={String(props.count())} />
    {/* An optional member may be undefined: three values, not a boolean. */}
    <span data-maybe={String(props.maybe)} />
  </aside>
);
