// The editor's verbs as the page's commands (`command/command.ts`): Undo and
// Redo of the lab's writes, available while the server's stack has a step
// that way (and labelled with what they would undo or redo); Escape letting
// a held grip go, from a field as well; Select, from a cue's or a knob's
// context menu; the nudges, which step the selected cue or knob through its
// inspector's fields (`core/field.ts`): ⌥← and ⌥→ move a cue a frame earlier
// or later (its offset), ⌥↑ and ⌥↓ lengthen or shorten it (its dur, or the
// end of one that runs until a mark), and move
// a point knob by a pixel or a number knob by its step, each ten times with
// Shift; and the walk through a scene: `.` and `,` go to the next or previous
// cue edge of the strip's scene, Tab and ⇧Tab select the next or previous
// cue while a cue is selected and focus is on the page (on a button, Tab
// still moves focus); F and ⇧F go to the next or previous finding of the
// film's check that has a place on the time line (`findingTime`); S turns
// the viewer's Snap off or on (an editor's snapping toggle, Shift flipping
// it for a move: `grip.ts`), the strip's Snap toggle a finger's way. An Undo
// or Redo the editor does not take now (a write out, a grip held: `notTaken`)
// says why; every other command answers quietly: a write's receipt is
// the editor's own once it lands (what a nudge moved, before → after, with
// Undo; what an Undo walked, with Redo: `context.tsx`), and a selection
// shows in the URL and the strip. Each cue of the strip's scene is also a
// place ⌘K goes to by its name (`cueDestinations`).

import { Effect, Match, Option } from 'effect';
import {
  type Bound,
  type Command,
  Unfit,
  boundChange,
  quiet,
  quietly,
  refused,
} from '../../command/command.ts';
import { type Context, selected } from '../../command/context.ts';
import { type LabSelection, cueOf, sameSelection, selectionText } from '../../command/selection.ts';
import { type Inspected, nudged, refusalOf } from '../../core/field.ts';
import type { ChangeId } from '../../core/schema.ts';
import type { Destination } from '../../command/go.ts';
import { type Toward, walkFrom } from '../../command/walk.ts';
import type { StepVerb } from '../api.ts';

/** What the editor's commands drive. */
interface EditorVerbs {
  /** What the server's stack would undo or redo now (its target and change), as the page read it, if anything. */
  readonly undoable: (
    verb: StepVerb,
  ) => Option.Option<{ readonly target: string; readonly change: ChangeId }>;
  /** Whether the stack as the page read it is still the newest it knows: false once the page has changed it. */
  readonly stackCurrent: () => boolean;
  /** Why a step of `verb` cannot take the change `bound` names (a receipt's), or none when it can. */
  readonly whyNot: (verb: StepVerb, bound: Bound) => Option.Option<Unfit>;
  /** Undo or Redo `change` (a receipt's), or the newest with none. */
  readonly step: (verb: StepVerb, change: Option.Option<ChangeId>) => void;
  /** Why the editor does not take a step of `verb` now (a write out, a grip held): `notTaken`. */
  readonly notTaken: (verb: StepVerb) => Option.Option<string>;
  /** Whether a grip is held: pressed on a cue or a handle, or dragging. */
  readonly holding: () => boolean;
  /** Let the held grip go: it goes back where it was. */
  readonly cancel: () => void;
  /** What the lab selects now (the URL's cue or knob). */
  readonly selected: () => Option.Option<LabSelection>;
  readonly select: (selection: LabSelection) => void;
  /** The inspector's fields of a cue or knob, as the lab holds it now. */
  readonly fieldsOf: (selection: LabSelection) => ReadonlyArray<Inspected>;
  /** The strip's scene and its cues, by when they start. */
  readonly stripCues: () => { readonly scene: string; readonly names: ReadonlyArray<string> };
  /** Film seconds at which the strip scene's cue `name` starts. */
  readonly startOf: (name: string) => number;
  /** The film times at which the strip scene's cues start or end, in order. */
  readonly edges: () => ReadonlyArray<number>;
  /** The film time shown. */
  readonly T: () => number;
  readonly seek: (T: number) => void;
  /** Where the film shows each of the panel's findings that has a place on the time line. */
  readonly findingTimes: () => ReadonlyArray<number>;
  /** Whether a drag's edges snap now (the viewer's Snap). */
  readonly snap: () => boolean;
  readonly setSnap: (on: boolean) => void;
}

/** The viewer's Snap as kept: on, unless `off` is kept (`snapText`). */
export const snapOf = (kept: Option.Option<string>): boolean => !Option.contains(kept, 'off');

/** The viewer's Snap as it is kept. */
export const snapText = (on: boolean): string => SNAP_KEPT[`${on}`];

const SNAP_KEPT: Readonly<Record<'true' | 'false', string>> = { true: 'on', false: 'off' };

/** Turn the viewer's Snap off or on: S, ⌘K, or the strip's Snap toggle. */
export const SNAP = 'edit.snap';

/** What the Snap command says, by whether edges snap now. */
const SNAP_LABEL: Readonly<Record<'true' | 'false', string>> = {
  true: 'Turn snapping off',
  false: 'Turn snapping on',
};

const snapCommand = (verbs: EditorVerbs): Command => ({
  id: SNAP,
  label: 'Snap on or off',
  labelIn: () => SNAP_LABEL[`${verbs.snap()}`],
  group: 'Edit',
  keys: ['s'],
  touch: 'the Snap toggle on the strip',
  when: () => true,
  run: quietly(() => verbs.setSnap(!verbs.snap())),
});

/** The cue or knob `ctx` is about. */
const aboutOf = (ctx: Context): Option.Option<LabSelection> =>
  Option.firstSomeOf<LabSelection>([selected(ctx, 'Cue'), selected(ctx, 'Knob')]);

/** The cue or knob `ctx` is about, if it is not the one selected already. */
const toSelect = (verbs: EditorVerbs, ctx: Context): Option.Option<LabSelection> =>
  Option.filter(
    aboutOf(ctx),
    (s) => !Option.exists(verbs.selected(), (now) => sameSelection(now, s)),
  );

/**
 * The change an Undo or Redo by key or header button names: the one the
 * stack as the page read it would step, so the lab steps it or refuses
 * (another client's change came after it); none once the page has changed
 * the stack since, when the step is the newest and its label names none.
 */
const named = (verbs: EditorVerbs, verb: StepVerb) =>
  Option.filter(verbs.undoable(verb), () => verbs.stackCurrent());

const stepCommand = (verbs: EditorVerbs, verb: StepVerb, label: string, key: string): Command => ({
  id: `edit.${verb}`,
  label,
  labelIn: () =>
    Option.match(named(verbs, verb), {
      onNone: () => label,
      onSome: (s) => `${label} ${s.target}`,
    }),
  group: 'Edit',
  keys: [key],
  touch: `the ${label} button in the editor`,
  when: () => Option.isSome(verbs.undoable(verb)),
  // A receipt's button steps the change it names, or says why it cannot (`stepWhyNot`);
  // while the editor takes no step, it holds.
  fits: (bound) =>
    Option.orElse(
      Option.map(verbs.notTaken(verb), (reason) => Unfit.Now({ reason })),
      () => verbs.whyNot(verb, bound),
    ),
  // The step's own receipt says what it walked; one not taken says why here.
  run: (_, how) =>
    Effect.sync(() =>
      Option.match(verbs.notTaken(verb), {
        onSome: (why) => refused(`${verb} not taken: ${why}`),
        onNone: () => {
          verbs.step(
            verb,
            Option.orElse(Option.flatMap(Option.fromUndefinedOr(how.bound), boundChange), () =>
              Option.map(named(verbs, verb), (s) => s.change),
            ),
          );
          return quiet;
        },
      }),
    ),
});

/**
 * A nudge's way: its key, the cue field it moves and by how many steps, a
 * point knob's (its y grows downward, as the canvas's does) and a number
 * knob's, each with the label it reads as (`{}` the thing).
 */
interface Way {
  readonly id: string;
  readonly key: string;
  readonly label: string;
  readonly cue: { readonly field: 'offset' | 'dur'; readonly by: number; readonly verb: string };
  readonly point: { readonly field: 'x' | 'y'; readonly by: number; readonly verb: string };
  readonly number: { readonly by: number; readonly verb: string };
}

const WAYS: ReadonlyArray<Way> = [
  {
    id: 'edit.nudge-right',
    key: 'alt+arrowright',
    label: 'Nudge right',
    cue: { field: 'offset', by: 1, verb: 'Nudge {} later' },
    point: { field: 'x', by: 1, verb: 'Nudge {} right' },
    number: { by: 1, verb: 'Raise {}' },
  },
  {
    id: 'edit.nudge-left',
    key: 'alt+arrowleft',
    label: 'Nudge left',
    cue: { field: 'offset', by: -1, verb: 'Nudge {} earlier' },
    point: { field: 'x', by: -1, verb: 'Nudge {} left' },
    number: { by: -1, verb: 'Lower {}' },
  },
  {
    id: 'edit.nudge-up',
    key: 'alt+arrowup',
    label: 'Nudge up',
    cue: { field: 'dur', by: 1, verb: 'Lengthen {}' },
    point: { field: 'y', by: -1, verb: 'Nudge {} up' },
    number: { by: 1, verb: 'Raise {}' },
  },
  {
    id: 'edit.nudge-down',
    key: 'alt+arrowdown',
    label: 'Nudge down',
    cue: { field: 'dur', by: -1, verb: 'Shorten {}' },
    point: { field: 'y', by: 1, verb: 'Nudge {} down' },
    number: { by: -1, verb: 'Lower {}' },
  },
];

/** What a nudge moves: a field, by how many steps, and what the nudge reads as. */
interface Nudge {
  readonly field: Inspected;
  readonly by: number;
  readonly label: string;
}

/** The field nudge `way` moves on `s`, if `s` has it and it may be written now. */
const nudgeOf = (verbs: EditorVerbs, way: Way, s: LabSelection): Option.Option<Nudge> => {
  const fields = verbs.fieldsOf(s);
  const named = (id: string) => Option.fromUndefinedOr(fields.find((f) => f.id === id));
  const as =
    (part: { readonly by: number; readonly verb: string }) =>
    (field: Inspected): Nudge => ({
      field,
      by: part.by,
      label: part.verb.replace('{}', selectionText(s)),
    });
  // A cue ending on a mark has no dur: its end lengthens and shortens it, as its field does.
  const cueField = Option.orElse(named(way.cue.field), () =>
    Option.filter(named('end'), () => way.cue.field === 'dur'),
  );
  const found = Match.value(s).pipe(
    Match.tag('Cue', () => Option.map(cueField, as(way.cue))),
    // A knob is a number (its `value` field) or a point (its `x` and `y`).
    Match.tag('Knob', () =>
      Option.orElse(Option.map(named('value'), as(way.number)), () =>
        Option.map(named(way.point.field), as(way.point)),
      ),
    ),
    Match.exhaustive,
  );
  return Option.filter(found, (n) => Option.isNone(refusalOf(n.field)));
};

const nudgeCommand = (verbs: EditorVerbs, way: Way): Command => {
  const nudge = (ctx: Context) => Option.flatMap(aboutOf(ctx), (s) => nudgeOf(verbs, way, s));
  return {
    id: way.id,
    label: way.label,
    labelIn: (ctx) => Option.match(nudge(ctx), { onNone: () => way.label, onSome: (n) => n.label }),
    group: 'Edit',
    keys: [way.key],
    stepped: true,
    about: ['Cue', 'Knob'],
    touch: 'select it, then type in its field',
    when: (ctx) => Option.isSome(nudge(ctx)),
    run: quietly((ctx, how) => {
      Option.map(nudge(ctx), ({ field, by }) =>
        field.write(nudged(field.spec, field.value, how.step, by)),
      );
    }),
  };
};

/** The first edge past `T` toward `toward`, if there is one. */
const edgeFrom = (edges: ReadonlyArray<number>, T: number, toward: Toward): Option.Option<number> =>
  walkFrom(edges, (e) => e, T, toward);

const edgeCommand = (verbs: EditorVerbs, toward: Toward, label: string, key: string): Command => ({
  id: `edit.edge-${toward}`,
  label,
  group: 'Edit',
  keys: [key],
  touch: 'drag the time line to a cue edge on the strip',
  when: () => Option.isSome(edgeFrom(verbs.edges(), verbs.T(), toward)),
  run: quietly(() => Option.map(edgeFrom(verbs.edges(), verbs.T(), toward), verbs.seek)),
});

/** F and ⇧F (AA-7): the film shown where the next or previous finding is. */
const findingCommand = (
  verbs: EditorVerbs,
  toward: Toward,
  label: string,
  key: string,
): Command => ({
  id: `check.finding-${toward}`,
  label,
  group: 'Check',
  keys: [key],
  touch: "tap a finding's time in the findings",
  when: () => Option.isSome(edgeFrom(verbs.findingTimes(), verbs.T(), toward)),
  run: quietly(() => Option.map(edgeFrom(verbs.findingTimes(), verbs.T(), toward), verbs.seek)),
});

/** How far along the strip's cues a walk moves. */
const STEP: Readonly<Record<Toward, number>> = { next: 1, previous: -1 };

/** The strip scene and its cue toward `toward` from the one `ctx` selects, if any. */
const cueFrom = (
  verbs: EditorVerbs,
  ctx: Context,
  toward: Toward,
): Option.Option<{ readonly scene: string; readonly name: string }> =>
  Option.flatMap(selected(ctx, 'Cue'), (cue) => {
    const strip = verbs.stripCues();
    const at = strip.names.indexOf(cue.name);
    return Option.map(
      Option.filter(
        Option.fromUndefinedOr(strip.names[at + STEP[toward]]),
        () => cue.scene === strip.scene && at >= 0,
      ),
      (name) => ({ scene: strip.scene, name }),
    );
  });

/**
 * Show the strip scene's cue `name` at its start, then select it: the
 * strip's window (a long scene's 8 s on a phone, `stripWindow`) follows the
 * playhead, so a cue selected is one the strip shows. Go to and the walk
 * both select a cue so; the URL's entry holds the time and the cue.
 */
const showCue = (
  verbs: Pick<EditorVerbs, 'select' | 'seek' | 'startOf'>,
  scene: string,
  name: string,
) => {
  verbs.seek(verbs.startOf(name));
  verbs.select(cueOf(scene, name));
};

const walkCommand = (verbs: EditorVerbs, toward: Toward, label: string, key: string): Command => ({
  id: `edit.cue-${toward}`,
  label,
  labelIn: (ctx) =>
    Option.match(cueFrom(verbs, ctx, toward), {
      onNone: () => label,
      onSome: (c) => `Select ${selectionText(cueOf(c.scene, c.name))}`,
    }),
  group: 'Edit',
  keys: [key],
  about: ['Cue'],
  touch: 'tap the cue on the strip, or long-press it',
  // On a button or a link, Tab moves focus, as it always does.
  when: (ctx) => ctx.focus === 'page' && Option.isSome(cueFrom(verbs, ctx, toward)),
  run: quietly((ctx) =>
    Option.map(cueFrom(verbs, ctx, toward), (c) => showCue(verbs, c.scene, c.name)),
  ),
});

/**
 * Each cue of the strip's scene as a place ⌘K goes to by its name
 * (`command/go.ts`): shown at its start, then selected (`showCue`).
 */
export const cueDestinations = (
  strip: ReturnType<EditorVerbs['stripCues']>,
  verbs: Pick<EditorVerbs, 'select' | 'seek' | 'startOf'>,
): ReadonlyArray<Destination> =>
  strip.names.map((name) => ({
    kind: 'cue',
    id: `${strip.scene}.${name}`,
    name: `${name} in ${strip.scene}`,
    go: () => showCue(verbs, strip.scene, name),
  }));

/** Cancel the drag: Escape, or the strip's Cancel drag while a grip is held (a finger has no Escape). */
export const CANCEL_GRIP = 'edit.cancel-grip';

/** The editor's commands over `verbs`. */
export const editorCommands = (verbs: EditorVerbs): ReadonlyArray<Command> => [
  stepCommand(verbs, 'undo', 'Undo', 'mod+z'),
  stepCommand(verbs, 'redo', 'Redo', 'mod+shift+z'),
  {
    id: CANCEL_GRIP,
    label: 'Cancel the drag',
    group: 'Edit',
    keys: ['escape'],
    keysIn: ['page', 'field'],
    touch: 'Cancel drag on the strip, while a finger holds the cue',
    when: verbs.holding,
    run: quietly(() => verbs.cancel()),
  },
  {
    id: 'edit.select',
    label: 'Select',
    labelIn: (ctx) =>
      Option.match(toSelect(verbs, ctx), {
        onNone: () => 'Select',
        onSome: (s) => `Select ${selectionText(s)}`,
      }),
    group: 'Edit',
    about: ['Cue', 'Knob'],
    touch: 'tap it, or long-press it, then Select',
    when: (ctx) => Option.isSome(toSelect(verbs, ctx)),
    run: quietly((ctx) => Option.map(toSelect(verbs, ctx), verbs.select)),
  },
  ...WAYS.map((way) => nudgeCommand(verbs, way)),
  edgeCommand(verbs, 'next', 'Next cue edge', '.'),
  findingCommand(verbs, 'next', 'Next finding', 'f'),
  findingCommand(verbs, 'previous', 'Previous finding', 'shift+f'),
  edgeCommand(verbs, 'previous', 'Previous cue edge', ','),
  walkCommand(verbs, 'next', 'Select the next cue', 'tab'),
  walkCommand(verbs, 'previous', 'Select the previous cue', 'shift+tab'),
  snapCommand(verbs),
];
