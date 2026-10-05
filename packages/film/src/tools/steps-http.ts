// A film's writes as the lab answers them: each write named one way
// (`wroteFields`: the file it changed, what it set, the change it made), with
// `film check --static` after it (`writeAnswer`, which the scene writes in
// `lab.ts` share; the choices' writes name theirs the same way), and the lab
// API's `steps` group (undo, redo, check, and the steps alone, in this
// process) for the film its route names.

import { Effect, Option, Path } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import { LabHttpApi, type Steps } from '../core/api.ts';
import { type LabWrite } from '../core/schema.ts';
import { answered } from './api-server.ts';
import { FilmFolder, type FilmName, filmNamed } from './film-repo.ts';
import { FreshFilm } from './fresh-film.ts';
import { mixedAnswer } from './lab-page.ts';
import { type Change, SourceWriter, type StepAsk, type Wrote } from './source-writer.ts';

/** `film check --static` as the lab shows it, in a fresh process: a check that cannot run is itself a finding. */
const findings = (film: string) => FreshFilm.use((fresh) => fresh.check(film, 'static'));

/** A file of `film`'s as an answer names it: relative to the film's folder. */
const relativeTo = Effect.fn('lab.relativeTo')(function* (film: string) {
  const path = yield* Path.Path;
  const dir = (yield* FilmFolder).paths(film).dir;
  return (file: string) => path.relative(dir, file);
});

/** Where a write landed as an answer names it: its scene (none for a film's own file), its file (`relative`). */
const placed = (
  relative: (file: string) => string,
  at: { readonly scene: Option.Option<string>; readonly file: string },
) => ({
  ...Option.match(at.scene, { onNone: () => ({}), onSome: (scene) => ({ scene }) }),
  file: relative(at.file),
});

/** A change as an answer names it: where it landed, what it set, and its id (what a receipt's Undo asks for). */
const changeNamed = (relative: (file: string) => string, c: Change) => ({
  ...placed(relative, c),
  target: c.target,
  change: c.id,
});

/** `wrote` as every answer names it: the change it made, else where it landed and what it set `(already so)`. */
const named = (relative: (file: string) => string, wrote: Wrote) =>
  Option.match(wrote.change, {
    onNone: () => ({ ...placed(relative, wrote), target: `${wrote.target} (already so)` }),
    onSome: (c) => changeNamed(relative, c),
  });

/** `wrote` as every write's answer names it, of `film` (`named`). */
export const wroteFields = (film: string, wrote: Wrote) =>
  Effect.map(relativeTo(film), (relative) => named(relative, wrote));

/**
 * What a write answers: the write (`wroteFields`), the value as the file now
 * reads, the mix it made as a page hears it (`read`), the check.
 */
export const writeAnswer = Effect.fn('lab.writeAnswer')(function* <R>(
  film: string,
  wrote: Wrote,
  read: Effect.Effect<
    Partial<Pick<LabWrite, 'span' | 'resolved' | 'unresolved' | 'knob' | 'mixed'>>,
    never,
    R
  >,
) {
  const fields = yield* wroteFields(film, wrote);
  const found = yield* findings(film);
  const answer: LabWrite = { ...fields, ...(yield* read), findings: found };
  return answer;
});

/**
 * Undo or Redo: the film's newest change put back, or its newest undone one
 * made again, answered as a write is (the mix it made again among it), and
 * recorded under the request's id when the page sent one; asked for one
 * change, only that one (`StepAsk`).
 */
const stepped = (name: string, verb: 'undo' | 'redo', ask: StepAsk) =>
  answered(
    Effect.gen(function* () {
      const film = yield* filmNamed(name);
      const [change, remade] = yield* (yield* SourceWriter).step(verb, film, ask);
      const wrote: Wrote = { ...change, change: Option.some(change) };
      return yield* writeAnswer(film, wrote, mixedAnswer(film, remade));
    }),
  );

/**
 * The film's latest change, what Undo and Redo would do, each named by its
 * file and target, and the steps that landed under a request's id, when any did.
 */
const history = Effect.fn('lab.history')(function* (film: FilmName) {
  const relative = yield* relativeTo(film);
  const kept = yield* (yield* SourceWriter).history(film);
  const change = (c: Change) => changeNamed(relative, c);
  const step = (key: 'latest' | 'undo' | 'redo') =>
    Option.match(kept[key], {
      onNone: () => ({}),
      onSome: (c) => ({ [key]: change(c) }),
    });
  const landed = () => {
    if (kept.landed.length === 0) return {};
    return { landed: kept.landed.map((l) => ({ ...change(l.step), request: l.request })) };
  };
  const steps: Steps = { ...step('latest'), ...step('undo'), ...step('redo'), ...landed() };
  return steps;
});

/**
 * The `steps` group's handlers: undo, redo, the film's check now with its
 * latest change and what Undo and Redo would do, and the steps without the
 * check (what a page reads after a write that answered its findings).
 */
export const stepsGroup = HttpApiBuilder.group(LabHttpApi, 'steps', (handlers) =>
  handlers
    .handle('undo', ({ params, payload }) => stepped(params.film, 'undo', payload))
    .handle('redo', ({ params, payload }) => stepped(params.film, 'redo', payload))
    .handle('check', ({ params }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* filmNamed(params.film);
          return { findings: yield* findings(film), ...(yield* history(film)) };
        }),
      ),
    )
    .handle('steps', ({ params }) => answered(Effect.flatMap(filmNamed(params.film), history))),
);
