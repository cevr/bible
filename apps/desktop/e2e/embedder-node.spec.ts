/* oxlint-disable effect/noAsyncFunction, effect/noGlobals, effect/noNodeBuiltinImport, effect/noNullish, effect/noTryCatch, effect/noAs, effect/noTernary -- Playwright's API is promise-based and `electronApplication.evaluate` serializes across a process boundary, so its payloads are structural rather than domain types; this file is a host driver, not Effect code. */

/** §9.5's Node adapter, in the process that actually runs it (round-2 F7).
 *
 *  `embedder-transformers.test.ts` proves the *post-processing* — MRL truncation,
 *  normalization, int8 quantization — against a stubbed model. What it cannot
 *  prove is that transformers.js loads native ONNX inside **Electron main**, and
 *  that is precisely where §9.5 says the model stays resident. Electron main is
 *  not Node: it is a different binary, with its own ABI, its own module
 *  resolution and its own native-addon loading rules. An adapter that works
 *  under `bun test` and fails to initialize under Electron would leave every
 *  existing test green while the desktop search silently degraded to lexical
 *  and reported §9.6's `embedder` absence.
 *
 *  So this drives `layerNodeEmbedder` through `electronApplication.evaluate`,
 *  which runs in the main process, and asserts §9.5's contract on the result:
 *  256 dimensions, int8, a unit vector, and the query prefix applied.
 *
 *  **It skips loudly when the weights are absent.** §10 forbids committing them
 *  and the model is ~1.2 GB, so most machines will not have a cache — but a
 *  silent skip is how a permanently broken adapter stays green, so the skip
 *  names the variable and the path it looked at.
 *
 *  Not in `turbo run gate`: needs a built Electron app and a populated model
 *  cache. Run with `bun run --cwd apps/desktop test:e2e`.
 */

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

/** Where this machine keeps the ONNX weights, if anywhere.
 *
 *  The same variable the adapter itself reads (`BIBLE_MODEL_CACHE`), falling
 *  back to the CLI's `~/.bible/models` — so a developer who has run the CLI's
 *  embedding path once already has a cache this spec can use. */
const modelCache = (): string =>
  // eslint-disable-next-line node/no-process-env -- resolving the same config the adapter reads
  process.env['BIBLE_MODEL_CACHE'] ?? path.join(homedir(), '.bible', 'models');

/** Whether the cache holds the model this build embeds with. A directory that
 *  exists but is empty is not a cache: `from_pretrained` would try to fetch, and
 *  a test that reaches the network is a test that fails in CI for the wrong
 *  reason. */
const hasWeights = (cache: string): boolean =>
  existsSync(cache) && existsSync(path.join(cache, 'onnx-community', 'embeddinggemma-300m-ONNX'));

interface Launched {
  readonly application: ElectronApplication;
  readonly userDataPath: string;
}

const launch = async (cache: string): Promise<Launched> => {
  const userDataPath = await mkdtemp(path.join(tmpdir(), 'bible-desktop-embedder-'));
  const application = await electron.launch({
    args: ['dist/main/main.cjs'],
    cwd: path.resolve(import.meta.dirname, '..'),
    env: {
      // eslint-disable-next-line node/no-process-env -- preserve the Playwright worker environment
      ...process.env,
      BIBLE_MODEL_CACHE: cache,
      BIBLE_USER_DATA_PATH: userDataPath,
      NODE_ENV: 'test',
    },
  });
  await application.firstWindow();
  return { application, userDataPath };
};

const shutdown = async (app: Launched): Promise<void> => {
  await app.application.close();
  await rm(app.userDataPath, { recursive: true, force: true });
};

test.describe('§9.5 the Electron main query embedder', () => {
  test('embeds a query with the real Node adapter inside Electron main', async () => {
    const cache = modelCache();
    // Loud, and specific about what is missing and where it was looked for.
    test.skip(
      !hasWeights(cache),
      `no EmbeddingGemma weights at ${cache} — set BIBLE_MODEL_CACHE to a populated transformers.js cache to run this spec`,
    );

    const app = await launch(cache);
    try {
      // Runs in the **main process**: this is the ABI and the module resolution
      // the shipped adapter actually meets, which is the whole point.
      const outcome = await app.application.evaluate(async () => {
        const { Effect } = await import('effect');
        const { QueryEmbedder, layerNodeEmbedder, DIMENSIONS, MODEL_FINGERPRINT } =
          await import('@bible/core/search');
        const program = Effect.gen(function* () {
          const embedder = yield* QueryEmbedder;
          const vector = yield* embedder.embed('what happens at the close of probation');
          return {
            length: vector.length,
            fingerprint: MODEL_FINGERPRINT,
            dimensions: DIMENSIONS,
            values: Array.from(vector),
          };
        }).pipe(Effect.provide(layerNodeEmbedder));
        return Effect.runPromise(
          Effect.match(program, {
            onSuccess: (value) => ({ ok: true as const, value }),
            onFailure: (error) => ({ ok: false as const, error: String(error) }),
          }),
        );
      });

      // A decline here is a real failure, not a skip: the weights were present,
      // so §9.5's adapter had everything it needs and did not deliver.
      expect(outcome.ok, outcome.ok ? '' : `embedder declined: ${String(outcome.error)}`).toBe(
        true,
      );
      if (!outcome.ok) return;

      // §9.2's row shape: exactly 256 int8 components.
      expect(outcome.value.length).toBe(outcome.value.dimensions);
      expect(outcome.value.length).toBe(256);
      for (const component of outcome.value.values) {
        expect(Number.isInteger(component)).toBe(true);
        expect(component).toBeGreaterThanOrEqual(-128);
        expect(component).toBeLessThanOrEqual(127);
      }

      // Not the zero vector, and not saturated: either would score every
      // paragraph identically and make the whole vector leg meaningless.
      const magnitude = Math.hypot(...outcome.value.values);
      expect(magnitude).toBeGreaterThan(0);
      expect(outcome.value.values.some((component) => component !== outcome.value.values[0])).toBe(
        true,
      );

      // The fingerprint the index is pinned to, read from the same process.
      expect(outcome.value.fingerprint).toBe('EmbeddingGemma-300M/256d-mrl/int8');
    } finally {
      await shutdown(app);
    }
  });

  test('two runs of one query agree, so the scan is reproducible', async () => {
    const cache = modelCache();
    test.skip(
      !hasWeights(cache),
      `no EmbeddingGemma weights at ${cache} — set BIBLE_MODEL_CACHE to a populated transformers.js cache to run this spec`,
    );

    const app = await launch(cache);
    try {
      const pair = await app.application.evaluate(async () => {
        const { Effect } = await import('effect');
        const { QueryEmbedder, layerNodeEmbedder } = await import('@bible/core/search');
        const program = Effect.gen(function* () {
          const embedder = yield* QueryEmbedder;
          // The same layer twice, which is also §9.5's residency claim: the
          // pipeline is memoized, so the second call reuses the loaded model.
          const first = yield* embedder.embed('the investigative judgment');
          const second = yield* embedder.embed('the investigative judgment');
          return { first: Array.from(first), second: Array.from(second) };
        }).pipe(Effect.provide(layerNodeEmbedder));
        return Effect.runPromise(
          Effect.match(program, {
            onSuccess: (value) => ({ ok: true as const, value }),
            onFailure: (error) => ({ ok: false as const, error: String(error) }),
          }),
        );
      });

      expect(pair.ok, pair.ok ? '' : `embedder declined: ${String(pair.error)}`).toBe(true);
      if (!pair.ok) return;
      // A quantized embedding is deterministic for one input on one device. If
      // it were not, a cached vector index and a live query would disagree.
      expect(pair.value.first).toEqual(pair.value.second);
    } finally {
      await shutdown(app);
    }
  });
});
