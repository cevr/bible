// The lab's modes: the inspector shows one tool at a time,
// Edit · Note · Motion · Compare · Record, picked on the mode tray (the
// inspector's header) or from ⌘K. The mode is a per-viewer convenience kept
// in the browser (`film-studio.lab-mode`); a note a link cites shows Note as
// it lands (only Note shows notes), a beat it cites that the film lists
// shows Record (only Record shows beats), and a cue or a knob it cites shows
// Edit (`citedMode`), so the mode never needs the URL. Pure.

import { Option } from 'effect';
import { type Command, quietly } from '../command/command.ts';

/** The lab's modes, in the tray's order. */
export const LAB_MODES = ['edit', 'note', 'motion', 'compare', 'record'] as const;

/** One of the lab's modes: which tool the inspector shows. */
export type LabMode = (typeof LAB_MODES)[number];

/** Each mode's name, as the tray and its command say it. */
export const MODE_TITLE: Readonly<Record<LabMode, string>> = {
  edit: 'Edit',
  note: 'Note',
  motion: 'Motion',
  compare: 'Compare',
  record: 'Record',
};

/** The mode the lab opens in, with nothing kept. */
export const FIRST_MODE: LabMode = 'edit';

const isMode = (text: string): text is LabMode => LAB_MODES.some((m) => m === text);

/** The mode `kept` names: the first mode when it names none (nothing kept, or an old value). */
export const modeOf = (kept: Option.Option<string>): LabMode =>
  Option.getOrElse(Option.filter(kept, isMode), () => FIRST_MODE);

/**
 * Whether `mode` shows a selected cue or knob: Edit does (the strip's lanes
 * and the inspector), and Motion on a laptop does (the lanes stay for its
 * loop); a phone's other modes fold the strip to its words.
 */
const showsSelection = (mode: LabMode, phone: boolean): boolean =>
  mode === 'edit' || (mode === 'motion' && !phone);

/**
 * The mode a link's citation shows, if it cites anything: a note shows Note
 * (the only mode that shows notes), a beat the film lists Record (the only
 * one that shows beats), else a cue or a knob shows Edit, unless the mode
 * shown (`now`, on a `phone` or not) shows it already. One rule, in that
 * order: the citation shows the mode that shows it.
 */
export const citedMode = (
  cited: {
    readonly note: Option.Option<unknown>;
    readonly beat: Option.Option<unknown>;
    readonly selection: Option.Option<unknown>;
  },
  shown: { readonly now: LabMode; readonly phone: boolean },
): Option.Option<LabMode> =>
  Option.firstSomeOf<LabMode>([
    Option.as(cited.note, 'note'),
    Option.as(cited.beat, 'record'),
    Option.as(
      Option.filter(cited.selection, () => !showsSelection(shown.now, shown.phone)),
      'edit',
    ),
  ]);

/**
 * The command that shows each mode (`lab.mode.<mode>`, ⌘K "Show Note"),
 * through `show`; the mode shown now is no move.
 */
export const modeCommands = (
  here: () => LabMode,
  show: (mode: LabMode) => void,
): ReadonlyArray<Command> =>
  LAB_MODES.map((mode): Command => ({
    id: `lab.mode.${mode}`,
    label: `Show ${MODE_TITLE[mode]}`,
    group: 'Modes',
    touch: 'the mode tray',
    when: () => here() !== mode,
    run: quietly(() => show(mode)),
  }));
