// A film's writes as the lab answers them: each write with the file it
// changed and `film check --static` after it (`writeAnswer`, which the scene
// writes in `lab.ts` share), and the lab API's `steps` group (undo, redo,
// check, and the steps alone, in this process) for the film its route names.

import { Effect, Option, Path } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import { LabHttpApi, type Steps } from '../core/api.ts';
import { type LabWrite } from '../core/schema.ts';
import { answered } from './api-server.ts';
import { FilmFolder, type FilmName, filmNamed } from './film-repo.ts';
import { FreshFilm } from './fresh-film.ts';
import { mixedAnswer } from './lab-page.ts';
import { type Change, SourceWriter, type StepAsk, madeChange } from './source-writer.ts';

/** `film check --static` as the lab shows it, in a fresh process: a check that cannot run is itself a finding. */
const findings = (film: string) => FreshFilm.use((fresh) => fresh.check(film, 'static'));

/** A change's scene as an answer names it: none for a film's own file. */
const sceneField = (change: Change) =>
  Option.match(change.scene, { onNone: () => ({}), onSome: (scene) => ({ scene }) });

/**
 * What a write answers: the file relative to the film, the value as the
 * file now reads, the mix it made as a page hears it (`read`), the check.
 */
export const writeAnswer = Effect.fn('lab.writeAnswer')(function* <R>(
  film: string,
  written: Change,
  read: Effect.Effect<
    Partial<Pick<LabWrite, 'span' | 'resolved' | 'unresolved' | 'knob' | 'mixed'>>,
    never,
    R
  >,
) {
  const path = yield* Path.Path;
  const dir = (yield* FilmFolder).paths(film).dir;
  const found = yield* findings(film);
  const wrote: LabWrite = {
    ...sceneField(written),
    file: path.relative(dir, written.file),
    target: written.target,
    ...Option.match(madeChange(written), { onNone: () => ({}), onSome: (change) => ({ change }) }),
    ...(yield* read),
    findings: found,
  };
  return wrote;
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
      const [change, remade] = yield* (yield* SourceWriter)[verb](film, ask);
      return yield* writeAnswer(film, change, mixedAnswer(film, remade));
    }),
  );

/**
 * The film's latest change, what Undo and Redo would do, each named by its
 * file and target, and the steps that landed under a request's id, when any did.
 */
const history = Effect.fn('lab.history')(function* (film: FilmName) {
  const path = yield* Path.Path;
  const dir = (yield* FilmFolder).paths(film).dir;
  const kept = yield* (yield* SourceWriter).history(film);
  const named = (c: Change) => ({
    ...sceneField(c),
    file: path.relative(dir, c.file),
    target: c.target,
    change: c.id,
  });
  const step = (key: 'latest' | 'undo' | 'redo') =>
    Option.match(kept[key], {
      onNone: () => ({}),
      onSome: (c) => ({ [key]: named(c) }),
    });
  const landed = () => {
    if (kept.landed.length === 0) return {};
    return { landed: kept.landed.map((l) => ({ ...named(l.step), request: l.request })) };
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
