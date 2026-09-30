// A film's project over HTTP: the handlers of the review API's `project`
// group (`core/api.ts`). Each runs `film project … --json` in a fresh process
// (`FreshFilm.project`): the review has run for days and its imports of the
// film are as they were at its start, so only a new process reads the scenes'
// keys as the film now stands. Each write answers the project as it leaves
// it; a scene, act or render the film lacks is answered with its refusal.

import { Effect, Match, Option } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import type { PartAddress } from '../core/address.ts';
import { ReviewHttpApi } from '../core/api.ts';
import { answered, named } from './api-server.ts';
import { FreshFilm } from './fresh-film.ts';

/** `--variant v` when one is named (`main` otherwise). */
const variantArgs = (given: { readonly variant?: string }): ReadonlyArray<string> =>
  Option.match(Option.fromUndefinedOr(given.variant), {
    onNone: () => [],
    onSome: (v) => ['--variant', v],
  });

/**
 * The flags naming `address` to `film project approve` and `comment`: `film`
 * for the whole film (`--all` to approve, none to comment on it).
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

/**
 * `film project <args>` for `film`, named first, in a fresh process. Each
 * run answers in JSON; its args end with `--json` or with `--json -- <text>`,
 * so a comment that starts with a dash is still read as the comment.
 */
const project = (film: string, args: (film: string) => ReadonlyArray<string>) =>
  answered(
    Effect.flatMap(named(film), (name) => FreshFilm.use((fresh) => fresh.project(args(name)))),
  );

/** The project's handlers. */
export const projectGroup = HttpApiBuilder.group(ReviewHttpApi, 'project', (handlers) =>
  handlers
    .handle('get', ({ params, query }) =>
      project(params.film, (film) => [film, ...variantArgs(query), '--json']),
    )
    .handle('approve', ({ params, payload }) =>
      project(params.film, (film) => [
        'approve',
        film,
        ...addressArgs(payload.address, ['--all']),
        ...variantArgs(payload),
        '--json',
      ]),
    )
    .handle('approveAll', ({ params, payload }) =>
      project(params.film, (film) => ['approve', film, '--all', ...variantArgs(payload), '--json']),
    )
    .handle('comment', ({ params, payload }) =>
      project(params.film, (film) => [
        'comment',
        film,
        ...addressArgs(payload.address, []),
        ...variantArgs(payload),
        '--json',
        '--',
        payload.text,
      ]),
    ),
);
