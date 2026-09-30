// A film's writes as the lab and the review answer them: each write with the
// file it changed and `film check --static` after it, and the `steps`
// group's handlers (undo, redo, check), which both APIs serve for the film
// their route names.

import { Effect, Option, Path } from 'effect';
import { type CheckLine, type LabWrite } from '../core/schema.ts';
import { answered, named } from './api-server.ts';
import { FilmRepo } from './film-repo.ts';
import { type Change, SourceWriter } from './source-writer.ts';
import { StaticCheck } from './static-check.ts';

/** `film check --static` as the lab shows it: a check that cannot run is itself a finding. */
export const findings = Effect.fn('lab.findings')(function* (film: string) {
  const check = yield* StaticCheck;
  return yield* check.run(film).pipe(
    Effect.catchTag('StaticCheckFailed', (error) => {
      const line: CheckLine = { level: 'error', tag: error._tag, message: error.message };
      return Effect.succeed([line]);
    }),
  );
});

/** A change's scene as an answer names it: none for a film's own file. */
const sceneField = (change: Change) =>
  Option.match(change.scene, { onNone: () => ({}), onSome: (scene) => ({ scene }) });

/** What a write answers: the file relative to the film, the value as the file now reads, the check. */
export const writeAnswer = Effect.fn('lab.writeAnswer')(function* (
  film: string,
  written: Change,
  read: Effect.Effect<
    Partial<Pick<LabWrite, 'span' | 'resolved' | 'unresolved' | 'knob'>>,
    never,
    FilmRepo
  >,
) {
  const path = yield* Path.Path;
  const dir = (yield* FilmRepo).paths(film).dir;
  const found = yield* findings(film);
  const wrote: LabWrite = {
    ...sceneField(written),
    file: path.relative(dir, written.file),
    target: written.target,
    ...(yield* read),
    findings: found,
  };
  return wrote;
});

interface FilmParams {
  readonly params: { readonly film: string };
}

/** Undo: put the film's newest change back, answered as a write is. */
const undo = ({ params }: FilmParams) =>
  answered(
    Effect.gen(function* () {
      const film = yield* named(params.film);
      const change = yield* (yield* SourceWriter).undo(film);
      return yield* writeAnswer(film, change, Effect.succeed({}));
    }),
  );

/** Redo: make the film's newest undone change again, answered as a write is. */
const redo = ({ params }: FilmParams) =>
  answered(
    Effect.gen(function* () {
      const film = yield* named(params.film);
      const change = yield* (yield* SourceWriter).redo(film);
      return yield* writeAnswer(film, change, Effect.succeed({}));
    }),
  );

/** The film's check now, its latest change, and what Undo and Redo would do. */
const check = ({ params }: FilmParams) =>
  answered(
    Effect.gen(function* () {
      const film = yield* named(params.film);
      const path = yield* Path.Path;
      const dir = (yield* FilmRepo).paths(film).dir;
      const history = yield* (yield* SourceWriter).history(film);
      const step = (key: 'latest' | 'undo' | 'redo') =>
        Option.match(history[key], {
          onNone: () => ({}),
          onSome: (c) => ({
            [key]: { ...sceneField(c), file: path.relative(dir, c.file), target: c.target },
          }),
        });
      return {
        findings: yield* findings(film),
        ...step('latest'),
        ...step('undo'),
        ...step('redo'),
      };
    }),
  );

/** The `steps` group's handlers, for `HttpApiBuilder.group(api, 'steps', …)` in either API. */
export const stepHandlers = { undo, redo, check } as const;
