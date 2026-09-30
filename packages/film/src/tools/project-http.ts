// A film's project over HTTP: the handlers of the review API's `project`
// group (`core/api.ts`). Each runs `film project … --json` in a fresh process
// (`FreshFilm.project`): the review has run for days and its imports of the
// film are as they were at its start, so only a new process reads the scenes'
// keys as the film now stands. A say (approve, withdraw, comment) answers
// the project as it leaves it, with each rendered scene's video as this
// checkout's catalogue records it (`Review.renderVideo`); a scene, act or
// render the film lacks is answered with its refusal.

import { Effect, Match, Option, Path } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import type { PartAddress } from '../core/address.ts';
import { type ProjectView, ReviewHttpApi, Say } from '../core/api.ts';
import type { Project } from '../core/catalogue.ts';
import { answered, named } from './api-server.ts';
import { FilmFolder } from './film-repo.ts';
import { FreshFilm } from './fresh-film.ts';
import { Review, refOf } from './review.ts';

/** `--variant v` when one is named (`main` otherwise). */
const variantArgs = (given: { readonly variant?: string }): ReadonlyArray<string> =>
  Option.match(Option.fromUndefinedOr(given.variant), {
    onNone: () => [],
    onSome: (v) => ['--variant', v],
  });

/**
 * The flags naming `address` to `film project approve`, `withdraw` and
 * `comment`: `film` for the whole film (`--all` to approve or withdraw, none
 * to comment on it).
 */
export const addressArgs = (
  address: PartAddress,
  film: ReadonlyArray<string>,
): ReadonlyArray<string> =>
  Match.valueTags(address, {
    Film: () => film,
    Act: ({ act }) => ['--act', act],
    Scenes: ({ ids }) => ['--scene', ids.join(',')],
  });

/** The verb `film project` runs for `say`, and the flags naming `address` to it. */
const sayArgs = (
  address: PartAddress,
  say: Say,
): { readonly verb: string; readonly flags: ReadonlyArray<string> } =>
  Say.match(say, {
    Approve: () => ({ verb: 'approve', flags: addressArgs(address, ['--all']) }),
    Withdraw: () => ({ verb: 'withdraw', flags: addressArgs(address, ['--all']) }),
    Comment: () => ({ verb: 'comment', flags: addressArgs(address, []) }),
  });

/** The words that end a say's args: a comment's text after `--`, so one that starts with a dash is still the comment. */
const sayText = (say: Say): ReadonlyArray<string> =>
  Say.match(say, {
    Approve: () => [],
    Withdraw: () => [],
    Comment: ({ text }) => ['--', text],
  });

/**
 * The project as the page shows it: the review's ref of its folder, and each
 * rendered scene's video as this checkout's catalogue records it.
 */
const viewOf = Effect.fn('project.view')(function* (project: Project) {
  const review = yield* Review;
  const path = yield* Path.Path;
  const out = (yield* FilmFolder).paths(project.film).out;
  const videos = yield* Effect.forEach(project.scenes, (scene) =>
    Option.match(scene.render, {
      onNone: () => Effect.succeed([]),
      onSome: (render) =>
        Effect.map(review.renderVideo(out, render), (video) =>
          Option.toArray(Option.map(video, (v) => [scene.scene, v] as const)),
        ),
    }),
  );
  const view: ProjectView = {
    project,
    folder: refOf(review.roots, out, path),
    videos: Object.fromEntries(videos.flat()),
  };
  return view;
});

/**
 * `film project <args>` for `film`, named first, in a fresh process, and the
 * project it answers as the page shows it. Each run answers in JSON.
 */
const project = (film: string, args: (film: string) => ReadonlyArray<string>) =>
  answered(
    Effect.gen(function* () {
      const name = yield* named(film);
      return yield* viewOf(yield* (yield* FreshFilm).project(args(name)));
    }),
  );

/** The project's handlers. */
export const projectGroup = HttpApiBuilder.group(ReviewHttpApi, 'project', (handlers) =>
  handlers
    .handle('get', ({ params, query }) =>
      project(params.film, (film) => [film, ...variantArgs(query), '--json']),
    )
    .handle('say', ({ params, payload }) =>
      project(params.film, (film) => {
        const { verb, flags } = sayArgs(payload.address, payload.say);
        return [verb, film, ...flags, ...variantArgs(payload), '--json', ...sayText(payload.say)];
      }),
    ),
);
