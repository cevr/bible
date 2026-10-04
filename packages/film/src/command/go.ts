// Go to… (AA-2): every thing a page can go to by its name (in the lab a
// scene, a cue of the scene shown, a note; on the review a folder, a set, a
// film's choices or its project), as a command found only by typing in ⌘K
// (`Command.typed`): `Go to scene cold`. A page lists its destinations as
// they stand and registers them while they hold. Pure.

import { Effect } from 'effect';
import { type Command, quiet } from './command.ts';

/** A thing a page can go to. */
export interface Destination {
  /** What kind of thing it is, as its label says it: `scene`, `cue`, `folder`. */
  readonly kind: string;
  /** Its id, unique among its kind on the page. */
  readonly id: string;
  /** Its name, as it is typed to find it. */
  readonly name: string;
  /** Go there, as its link or its pick would. */
  readonly go: () => void;
}

/** The group every Go to entry sits in. */
export const GO_TO = 'Go to';

/** The command that goes to each of `destinations`: `go.<kind>.<id>`, `Go to <kind> <name>`. */
export const goToCommands = (destinations: ReadonlyArray<Destination>): ReadonlyArray<Command> =>
  destinations.map((d): Command => ({
    id: `go.${d.kind}.${d.id}`,
    label: `Go to ${d.kind} ${d.name}`,
    group: GO_TO,
    typed: true,
    touch: 'the command menu: type its name',
    when: () => true,
    run: () =>
      Effect.sync(() => {
        d.go();
        return quiet;
      }),
  }));
