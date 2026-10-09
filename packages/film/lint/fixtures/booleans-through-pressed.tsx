// Fixture for film/booleans-through-pressed: each line marked RED fires the
// rule, and nothing else does.

declare const pressed: (on: boolean) => 'true' | 'false';
declare const on: () => boolean;
declare const staged: () => boolean;
declare const isLive: () => boolean;
declare const rate: () => number;
declare const id: string;
declare const current: string;

export const Controls = () => (
  <div>
    <button aria-pressed={`${on()}`} /> {/* // RED film/booleans-through-pressed */}
    <button aria-selected={`${id === current}`} /> {/* // RED film/booleans-through-pressed */}
    <button aria-expanded={String(on())} /> {/* // RED film/booleans-through-pressed */}
    <button aria-busy={String(!on())} /> {/* // RED film/booleans-through-pressed */}
    <button aria-checked={`${on()}`} /> {/* // RED film/booleans-through-pressed */}
    <button aria-current={`${on()}`} /> {/* // RED film/booleans-through-pressed */}
    <div data-flag={String(id === current)} /> {/* // RED film/booleans-through-pressed */}
    <div data-flag={String(!on())} /> {/* // RED film/booleans-through-pressed */}
    <div data-flag={String(isLive())} /> {/* // RED film/booleans-through-pressed */}
    <div data-staged={String(staged())} /> {/* // RED film/booleans-through-pressed */}
    {/* Through pressed, a number, a plain string and a name pass. */}
    <button aria-pressed={pressed(on())} />
    <button aria-selected={pressed(id === current)} />
    <button aria-current="page" />
    <button aria-label={`${id} (${current})`} />
    <div data-rate={String(rate())} />
    <div data-name={`${id} · ${current}`} />
    <div data-flag={pressed(isLive())} />
  </div>
);
