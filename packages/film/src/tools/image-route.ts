// The image route the storyboard draws its panels on: `okra image`, on its
// Codex route only (the subscription, no charge per image). Never `--model`:
// that leaves the subscription for the paid Images API. A call sends only the
// prompt and the reference images; a prompt that names a home path, an email
// address or a key is refused before it leaves (`PromptPersonal`). Tests and
// a dry run use a layer that draws nothing over the network.

import { Context, Duration, Effect, FileSystem, Layer, Option, Schema } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { collectWithin } from './process.ts';

/** One image asked of the route: the prompt, its reference images (paths), its size, where it lands. */
export interface ImageRequest {
  readonly prompt: string;
  readonly refs: ReadonlyArray<string>;
  /** `1536x1024`. */
  readonly size: string;
  readonly out: string;
}

/** The size a board panel is drawn at: the film's 16:9 frame, as near as the route draws. */
export const PANEL_SIZE = '1536x1024';

/** The longest one image may take before the call is stopped. */
const IMAGE_LIMIT = Duration.minutes(6);

/** A call that drew nothing: the route's own words for why. */
class ImageRouteFailed extends Schema.TaggedError<ImageRouteFailed>()('ImageRouteFailed', {
  reason: Schema.String,
}) {
  override get message() {
    return `okra image drew nothing: ${this.reason}`;
  }
}

/** A prompt naming something private: it never leaves the machine. */
class PromptPersonal extends Schema.TaggedError<PromptPersonal>()('PromptPersonal', {
  found: Schema.String,
}) {
  override get message() {
    return `the prompt names something private (${this.found}); it was not sent`;
  }
}

/** What a prompt must never carry: a home path, an email address, a key or token. */
const PERSONAL: ReadonlyArray<readonly [string, RegExp]> = [
  ['a home path', /(?:\/Users\/|\/home\/|~\/)[^\s]*/],
  ['an email address', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
  ['a key', /\b(?:sk|pk|rk|ghp|gho|ghs|xox[abprs])[-_][A-Za-z0-9_-]{10,}/],
  ['a token', /\b[A-Za-z0-9+/_-]{40,}={0,2}/],
];

/** What private thing `prompt` names, if any (what it is, never the thing itself). */
export const personalIn = (prompt: string): Option.Option<string> =>
  Option.fromUndefinedOr(PERSONAL.find(([, re]) => re.test(prompt))?.[0]);

/** The arguments of one `okra image` call: never `--model`. */
export const okraArgs = (request: ImageRequest): ReadonlyArray<string> => [
  'image',
  request.prompt,
  '--size',
  request.size,
  ...request.refs.flatMap((ref) => ['--ref', ref]),
  '-o',
  request.out,
];

interface ImageRouteService {
  /** Draw one image to `request.out`. */
  readonly draw: (request: ImageRequest) => Effect.Effect<void, ImageRouteFailed | PromptPersonal>;
}

export class ImageRoute extends Context.Service<ImageRoute, ImageRouteService>()(
  '@bible/film/tools/ImageRoute',
) {
  /** `okra image` on its Codex route. */
  static readonly layer = Layer.effect(
    ImageRoute,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const fs = yield* FileSystem.FileSystem;
      const draw = Effect.fn('ImageRoute.draw')(function* (request: ImageRequest) {
        const found = personalIn(request.prompt);
        if (Option.isSome(found)) return yield* PromptPersonal.make({ found: found.value });
        const done = yield* collectWithin(
          spawner,
          'okra image',
          ChildProcess.make('okra', [...okraArgs(request)]),
          IMAGE_LIMIT,
        ).pipe(Effect.mapError((e) => ImageRouteFailed.make({ reason: e.message })));
        const made = yield* fs.exists(request.out).pipe(Effect.orElseSucceed(() => false));
        if (done.exitCode !== 0 || !made)
          return yield* ImageRouteFailed.make({
            reason: `exit ${done.exitCode}: ${done.stderr.trim().split('\n').slice(-3).join(' | ')}`,
          });
      });
      return ImageRoute.of({ draw });
    }),
  );

  /**
   * A route that draws `bytes(request)` to `request.out` (tests, a dry run):
   * the same guard, nothing sent anywhere.
   */
  static readonly fake = (bytes: (request: ImageRequest) => Uint8Array) =>
    Layer.effect(
      ImageRoute,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        return ImageRoute.of({
          draw: (request) =>
            Effect.gen(function* () {
              const found = personalIn(request.prompt);
              if (Option.isSome(found)) return yield* PromptPersonal.make({ found: found.value });
              yield* fs
                .writeFile(request.out, bytes(request))
                .pipe(Effect.mapError((e) => ImageRouteFailed.make({ reason: e.message })));
            }),
        });
      }),
    );
}
