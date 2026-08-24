/** The embedder e2e's probe, run **inside Electron main**.
 *
 *  `electronApplication.evaluate` executes its callback in a vm sandbox that
 *  has neither `require` nor a dynamic-import callback, so no module — not
 *  even `effect` — can be loaded from the callback itself. The spec therefore
 *  bundles this file to CJS (the same esbuild recipe and externals as
 *  `main.cjs`) and the callback loads the bundle by **absolute path** through
 *  `process.mainModule.require`, which is the one loader the sandbox can
 *  reach. Everything the assertions need happens here, in real Effect code
 *  against the real `layerNodeEmbedder`; the callback only ferries JSON out.
 */

import { DIMENSIONS, MODEL_FINGERPRINT, QueryEmbedder } from '@bible/core/search';
import { layerNodeEmbedder } from '@bible/core/search/node';
import { Effect } from 'effect';

export interface ProbeVector {
  readonly length: number;
  readonly fingerprint: string;
  readonly dimensions: number;
  readonly values: readonly number[];
}

export type ProbeOutcome<A> =
  | { readonly ok: true; readonly value: A }
  | { readonly ok: false; readonly error: string };

const outcome = <A>(program: Effect.Effect<A, unknown>): Promise<ProbeOutcome<A>> =>
  Effect.runPromise(
    Effect.match(program, {
      onSuccess: (value): ProbeOutcome<A> => ({ ok: true, value }),
      onFailure: (error): ProbeOutcome<A> => ({ ok: false, error: String(error) }),
    }),
  );

/** One embed, with the pinned constants read from the same process. */
export const embedOnce = (text: string): Promise<ProbeOutcome<ProbeVector>> =>
  outcome(
    Effect.gen(function* () {
      const embedder = yield* QueryEmbedder;
      const vector = yield* embedder.embedQuery(text);
      return {
        length: vector.length,
        fingerprint: MODEL_FINGERPRINT,
        dimensions: DIMENSIONS,
        values: Array.from(vector),
      };
    }).pipe(Effect.provide(layerNodeEmbedder)),
  );

/** The same layer twice — §9.5's residency claim: the pipeline is memoized,
 *  so the second call reuses the loaded model. */
export const embedPair = (
  text: string,
): Promise<
  ProbeOutcome<{ readonly first: readonly number[]; readonly second: readonly number[] }>
> =>
  outcome(
    Effect.gen(function* () {
      const embedder = yield* QueryEmbedder;
      const first = yield* embedder.embedQuery(text);
      const second = yield* embedder.embedQuery(text);
      return { first: Array.from(first), second: Array.from(second) };
    }).pipe(Effect.provide(layerNodeEmbedder)),
  );
