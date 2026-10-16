// What the inspector shows of the selection, as pure functions of the
// timeline and the address (design §5): its sections in flow order, which
// are open (the one of the clicked kind opens with the selection, Words for
// a beat, Board for a panel; a section the owner opened or shut stays so
// while the selection stands), and each closed section's one-line count
// (`95 words`, `3 of 3 kept`). The parts (`inspector.tsx`) read these; the
// timeline's own facts (a beat's panels, its take, its scene) are
// `view-state.ts`'s.

import { Boolean as Bool, Option } from 'effect';
import type { BoardClip } from '../../core/timeline-schema.ts';

/** The inspector's sections, in the flow's order. */
const SECTIONS = ['Words', 'Board', 'Voice', 'Code', 'Notes and asks'] as const;
export type SectionName = (typeof SECTIONS)[number];

/** A selection as the inspector keys it: a beat, or a Board panel (and so its beat). */
interface Selected {
  readonly kind: 'beat' | 'panel';
  /** The address's `sel`: the key a toggle is kept under. */
  readonly sel: string;
}

/** The sections the owner opened and shut, under the selection he did it in. */
export interface Toggled {
  readonly sel: string;
  readonly open: ReadonlySet<SectionName>;
}

/** The section a selection opens with: Board for a panel, else Words. */
const openedWith = (selected: Selected): SectionName =>
  Bool.match(selected.kind === 'panel', {
    onTrue: (): SectionName => 'Board',
    onFalse: (): SectionName => 'Words',
  });

/** The sections open for `selected`: as toggled under it, else the one it opens with. */
export const openSections = (
  selected: Selected,
  toggled: Option.Option<Toggled>,
): ReadonlySet<SectionName> =>
  Option.match(
    Option.filter(toggled, (t) => t.sel === selected.sel),
    {
      onNone: () => new Set([openedWith(selected)]),
      onSome: (t) => t.open,
    },
  );

/** `section` opened (or shut, `open` false) for `selected`, from the sections open now. */
export const toggle = (
  selected: Selected,
  toggled: Option.Option<Toggled>,
  section: SectionName,
  open: boolean,
): Toggled => {
  const now = new Set(openSections(selected, toggled));
  if (open) now.add(section);
  else now.delete(section);
  return { sel: selected.sel, open: now };
};

/** How many words a spoken line says. */
const wordCount = (spoken: string): number =>
  spoken.split(/\s+/).filter((word) => word !== '').length;

/** The Words row's count: `95 words`, `1 word`. */
export const wordsText = (spoken: string): string => {
  const n = wordCount(spoken);
  return `${n} ${Bool.match(n === 1, { onTrue: () => 'word', onFalse: () => 'words' })}`;
};

/** The Board row's count over a beat's panels: its picture panels that keep a try, of them all (`3 of 3 kept`). */
export const boardText = (panels: ReadonlyArray<BoardClip>): string => {
  const pictures = panels.filter((p) => !p.card);
  const kept = pictures.filter((p) => p.state !== 'made').length;
  return `${kept} of ${pictures.length} kept`;
};
