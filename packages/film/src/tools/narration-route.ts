// The narration route, `/films/<film>/narration/<file>`, for the player, the
// lab and the review page alike: which file a URL names. The film is one of
// the films now (its `filmMark` exists, read per request, so a film made
// while the server runs is served), the file one directly in its
// `narration/` (never `attempts/`, never a path, never a dotfile) and on
// disk. Any other URL names none, a 404. The app's server answers the file;
// the studio rewrites these files in place (a take kept, the track remixed),
// so it serves them uncached.

import { Effect, FileSystem, Option, Path } from 'effect';
import { filmMark } from './film-repo.ts';

/** A narration URL: `/films/<film>/narration/<file>`, the file directly in the folder. */
const NARRATION_URL = /^\/films\/([^/]+)\/narration\/([^/]+)$/;

/** A file name as it may sit in a narration folder: no path, no dotfile. */
const NARRATION_FILE = /^[\w-][\w.-]*$/;

/** The film and file a narration URL names, when the file's name is a plain file's. */
const named = (pathname: string) =>
  Option.flatMap(Option.fromNullishOr(NARRATION_URL.exec(pathname)), ([, film, file]) =>
    Option.filter(
      Option.all([Option.fromUndefinedOr(film), Option.fromUndefinedOr(file)]),
      ([, name]) => NARRATION_FILE.test(name),
    ),
  );

/** The file `pathname` names under the films folder `films`, if it is one the route serves. */
export const narrationFile = Effect.fn('narrationFile')(function* (
  films: string,
  pathname: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const exists = (file: string) => fs.exists(file).pipe(Effect.orElseSucceed(() => false));
  for (const [film, name] of Option.toArray(named(pathname)))
    for (const mark of Option.toArray(filmMark(films, film))) {
      const file = path.join(films, film, 'narration', name);
      if ((yield* exists(mark)) && (yield* exists(file))) return Option.some(file);
    }
  return Option.none<string>();
});
