// Go to… every thing a page can go to by its name (on the review a folder,
// a set, a film's choices or its project), as a command found only by typing in ⌘K
// (`Command.typed`): `Go to scene cold`. A page lists its destinations as
// they stand and registers them while they hold. The shell's moves are
// commands too: Films on ⇧1 and the film's studio on ⇧2 (`shellCommands`);
// and a film card's context menu opens its studio (`filmCommands`). Pure.

import { Option } from 'effect';
import type { Input } from '../browser/keys.ts';
import { pageHref } from '../core/api.ts';
import { type Command, type CommandId, quietly } from './command.ts';
import { type Context, selected } from './context.ts';

/** A thing a page can go to. */
export interface Destination {
  /** What kind of thing it is, as its label says it: `scene`, `cue`, `folder`. */
  readonly kind: string;
  /** Its id, unique among its kind on the page. */
  readonly id: string;
  /** Its name, as it is typed to find it. */
  readonly name: string;
  /** Go there, as its link or its pick would, asked by `input` (a focus it moves rings iff a key asked). */
  readonly go: (input: Input) => void;
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
    run: quietly((_, how) => d.go(how.input)),
  }));

/** The group the shell's moves sit in. */
const PAGES_GROUP = 'Pages';

/** The command that goes to Films. */
export const FILMS_COMMAND: CommandId = 'page.films';

/** The command that opens the film's studio. */
export const STUDIO_COMMAND: CommandId = 'page.studio';

/**
 * The shell's moves, through `go`: Films (⇧1), from any page but Films
 * (`onFilms`), and the studio of `film` (⇧2, the film the shell leads
 * into), the one way into a film.
 */
export const shellCommands = (
  film: () => Option.Option<string>,
  onFilms: () => boolean,
  go: (href: string) => void,
): ReadonlyArray<Command> => [
  {
    id: FILMS_COMMAND,
    label: 'Go to Films',
    group: PAGES_GROUP,
    keys: ['shift+1'],
    touch: 'Films, in the header',
    when: () => !onFilms(),
    run: quietly(() => go(pageHref.home())),
  },
  {
    id: STUDIO_COMMAND,
    label: 'Open the studio',
    group: PAGES_GROUP,
    keys: ['shift+2'],
    touch: 'Studio, in the header (on a phone, the film menu, then Open the studio)',
    when: () => Option.isSome(film()),
    run: quietly(() => Option.map(film(), (f) => go(pageHref.studio(f)))),
  },
];

/** The film a context is about: its first selection, when that is a film (a card on Films). */
const filmAbout = (ctx: Context): Option.Option<string> =>
  Option.map(selected(ctx, 'Film'), (s) => s.film);

/** The film card's move (in its context menu): Open in the Studio, through `go`. */
export const filmCommands = (go: (href: string) => void): ReadonlyArray<Command> => [
  {
    id: 'film.studio',
    label: 'Open in the Studio',
    group: 'Open',
    about: ['Film'],
    touch: 'long-press a film',
    when: (ctx) => Option.isSome(filmAbout(ctx)),
    run: quietly((ctx) => Option.map(filmAbout(ctx), (f) => go(pageHref.studio(f)))),
  },
];
