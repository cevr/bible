// Upstream: react-aria-components 1.22.1, packages/react-aria-components/src/Sheet.tsx
// (sheetStack, registerSheet, emitStackChange). Copyright 2026 Adobe, Apache-2.0
// (`../LICENSE`); ported to Solid 2: the stack is a signal rather than an external
// store React subscribes to.
//
// The sheets mounted now, in the order they mounted: a sheet's place in it is
// its stack index, and the sheets after it are its descendants (the ones in
// front of it). Each sheet's view timeline is named by its index and hoisted
// to `<html>` with `timeline-scope`, so a sheet behind can run its stack
// animation along the timelines of the sheets in front of it. Only the
// browser registers: the server renders every sheet at index 0.
import { createSignal } from 'solid-js';

/** A mounted sheet, as the sheets behind it read it to run their stack animation. */
export interface SheetStackEntry {
  readonly id: string;
  /** The `animation-range` of its view timeline. */
  readonly range: string;
  readonly direction: string;
  readonly iterations: number;
}

// The list itself, kept beside the signal: a signal's write is read back only after the flush.
let entries: ReadonlyArray<SheetStackEntry> = [];
const [stack, setStack] = createSignal(entries, { ownedWrite: true });

export { stack as sheetStack };

/** The name of the view timeline of the sheet at `index`. */
export const timelineName = (index: number): string => `--sheet-timeline-${index}`;

function update(next: ReadonlyArray<SheetStackEntry>) {
  entries = next;
  setStack(() => next);
  // Upstream's TODO stands: a `timeline-scope` the page sets on `<html>` is overwritten.
  document.documentElement.style.setProperty(
    'timeline-scope',
    next.map((_, i) => timelineName(i)).join(', '),
  );
}

/** Adds a sheet to the stack; the returned function removes it. */
export function registerSheet(entry: SheetStackEntry): () => void {
  update([...entries, entry]);
  return () => update(entries.filter((e) => e.id !== entry.id));
}
