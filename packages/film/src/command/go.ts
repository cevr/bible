// Go to… (AA-2): every thing a page can go to by its name (in the lab a
// scene, a cue of the scene shown, a note; on the review a folder, a set, a
// film's choices or its project), as a command found only by typing in ⌘K
// (`Command.typed`): `Go to scene cold`. A page lists its destinations as
// they stand and registers them while they hold. The studio's parts are
// commands too, each on its key (⇧1 Films … ⇧6 Play, Resolve's page keys):
// the page bar's tabs, from the keyboard; and a film card's context menu
// opens each part of its film (`filmCommands`). Pure.

import { Effect, Option } from 'effect';
import { PARTS, PART_TITLE, type Part, filmTimeOn, hasPart, partHref } from '../core/api.ts';
import { type Command, quiet } from './command.ts';
import type { Context } from './context.ts';
import type { Selection } from './selection.ts';

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

/** The group the parts' commands sit in. */
const PAGES_GROUP = 'Pages';

/**
 * The command for each of the studio's parts (`page.<part>`, on ⇧1-⇧6 in
 * the page bar's order): it goes to that part of `film` (the film the page
 * bar leads into), through `go`. A film's part waits for a film that has it
 * (a short has no lab, choices or project); the part the page is on is no
 * move. A page at film time `at` (Scenes, the Lab, Play) keeps it on the
 * part it goes to that has it (`partHref`).
 */
export const partCommands = (
  film: () => Option.Option<string>,
  here: () => Part,
  go: (href: string) => void,
  at: () => Option.Option<number> = () => Option.none(),
): ReadonlyArray<Command> =>
  PARTS.map((part, i): Command => ({
    id: `page.${part}`,
    label: `Go to ${PART_TITLE[part]}`,
    group: PAGES_GROUP,
    keys: [`shift+${i + 1}`],
    touch: 'the page bar',
    when: () =>
      here() !== part && (part === 'films' || Option.exists(film(), (f) => hasPart(f, part))),
    run: () =>
      Effect.sync(() => {
        go(
          partHref(
            part,
            Option.getOrElse(film(), () => ''),
            filmTimeOn(here(), at()),
          ),
        );
        return quiet;
      }),
  }));

/** The film a context is about: its first selection, when that is a film (a card on Films). */
const filmAbout = (ctx: Context): Option.Option<string> =>
  Option.map(
    Option.filter(
      Option.fromUndefinedOr(ctx.selection[0]),
      (s): s is Extract<Selection, { readonly _tag: 'Film' }> => s._tag === 'Film',
    ),
    (s) => s.film,
  );

/**
 * The film card's moves (`film.<part>`, in its context menu): Open in Scenes,
 * Lab, Choices, Project or Play, each landing on that part's tab of the film
 * the card is, through `go`. A short offers only its parts.
 */
export const filmCommands = (go: (href: string) => void): ReadonlyArray<Command> =>
  PARTS.filter((part) => part !== 'films').map((part): Command => ({
    id: `film.${part}`,
    label: `Open in ${PART_TITLE[part]}`,
    group: 'Open',
    about: ['Film'],
    touch: 'long-press a film',
    when: (ctx) => Option.exists(filmAbout(ctx), (f) => hasPart(f, part)),
    run: (ctx) =>
      Effect.sync(() => {
        Option.map(filmAbout(ctx), (f) => go(partHref(part, f)));
        return quiet;
      }),
  }));
