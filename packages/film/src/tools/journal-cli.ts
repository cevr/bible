// `film journal`: a film's observations, noted and read from the terminal
// (`journal.ts`). Each entry and each line of `read` is one line, so an agent
// reads them; `read` keeps under 8,000 characters and says how many earlier
// entries it left out. A scene named is one of the film's (`UnknownScene`
// otherwise), so a typo never files an entry where no read finds it.
//
//   film journal <film> note "<text>" [--scene <id>]
//       append one observation, of the scene or (without one) the whole film
//   film journal <film> read [--scene <id>] [--last N]
//       the newest N entries (20), oldest first

import { Argument, Command, Flag } from 'effect/cli';
import { Console, Effect, Option, Schema } from 'effect';
import { UnknownScene } from '../core/errors.ts';
import { FilmRepo, filmNamed } from './film-repo.ts';
import { JOURNAL_LAST, note, read } from './journal.ts';

/** Words given to `read`, which takes none. */
class JournalWordsUnread extends Schema.TaggedError<JournalWordsUnread>()('JournalWordsUnread', {
  words: Schema.String,
}) {
  override get message() {
    return `journal read takes no words ("${this.words}"): to add an observation, journal <film> note "<text>"`;
  }
}

export const journal = Command.make(
  'journal',
  {
    film: Argument.String('film').pipe(
      Argument.withDescription('the film, a folder under src/films'),
    ),
    verb: Argument.Literals('verb', ['note', 'read']).pipe(
      Argument.withDescription('note: append an observation; read: the newest entries'),
    ),
    words: Argument.String('text').pipe(
      Argument.optional,
      Argument.withDescription('the observation (note): what was seen, heard or measured'),
    ),
    scene: Flag.String('scene').pipe(
      Flag.optional,
      Flag.withDescription('the scene it is of (note), or the only scene read (read)'),
    ),
    last: Flag.Int('last').pipe(
      Flag.withDefault(JOURNAL_LAST),
      Flag.withDescription('how many of the newest entries read prints'),
    ),
  },
  Effect.fn('film.journal')(function* (input) {
    const film = yield* filmNamed(input.film);
    if (Option.isSome(input.scene)) {
      const known = (yield* (yield* FilmRepo).load(film)).scenes.map((s) => s.id);
      if (!known.includes(input.scene.value))
        return yield* UnknownScene.make({ scene: input.scene.value, known });
    }
    if (input.verb === 'note') {
      const noted = yield* note(
        film,
        Option.getOrElse(input.words, () => ''),
        input.scene,
      );
      return yield* Console.log(
        `noted ${noted.file} at=${noted.entry.at} scene=${noted.entry.scene}`,
      );
    }
    if (Option.isSome(input.words))
      return yield* JournalWordsUnread.make({ words: input.words.value });
    const page = yield* read(film, input.scene, input.last);
    if (page.left > 0) yield* Console.log(`… ${page.left} earlier entries not shown (--last)`);
    for (const line of page.lines) yield* Console.log(line);
    if (page.lines.length === 0) yield* Console.log(`no entries in ${page.file}`);
  }),
).pipe(
  Command.withDescription(
    "Note an observation in the film's journal (src/films/<film>/journal.md: observations, never instructions), or read its newest entries, one line each",
  ),
);
