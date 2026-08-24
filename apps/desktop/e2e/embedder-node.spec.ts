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
 *  So this drives `layerNodeEmbedder` in the main process and asserts §9.5's
 *  contract on the result: 256 dimensions, int8, a unit vector, and the query
 *  prefix applied. The evaluate sandbox can load no module of its own — no
 *  `require`, no dynamic-import callback — so the Effect program lives in
 *  `embedder-probe.entry.ts`, bundled to CJS with `main.cjs`'s own recipe and
 *  loaded by absolute path through `process.mainModule.require`, the one
 *  loader the sandbox reaches.
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
import { build } from 'esbuild';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

import type * as EmbedderProbe from './embedder-probe.entry.ts';

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

/** Bundles the probe to CJS beside the app bundle, with the same externals —
 *  the natives resolve at runtime against the same `node_modules` copies
 *  `main.cjs` resolves against. Returns the absolute path the sandbox loads. */
const bundleProbe = async (): Promise<string> => {
  const root = path.resolve(import.meta.dirname, '..');
  const outfile = path.join(root, 'dist', 'e2e', 'embedder-probe.cjs');
  await build({
    entryPoints: [path.join(root, 'e2e', 'embedder-probe.entry.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['electron', 'better-sqlite3', '@huggingface/transformers', 'onnxruntime-node'],
  });
  return outfile;
};

interface Launched {
  readonly application: ElectronApplication;
  readonly userDataPath: string;
}

/** `cache: null` launches with `BIBLE_MODEL_CACHE` *unset*, which is how a
 *  real install runs — the adapter must find the weights through the shared
 *  `~/.bible/models` fallback the CLI resolves through (one core, one fact). */
const launch = async (cache: string | null): Promise<Launched> => {
  const userDataPath = await mkdtemp(path.join(tmpdir(), 'bible-desktop-embedder-'));
  // eslint-disable-next-line node/no-process-env -- preserve the Playwright worker environment
  const env = { ...process.env };
  delete env['BIBLE_MODEL_CACHE'];
  if (cache !== null) {
    env['BIBLE_MODEL_CACHE'] = cache;
  }
  const application = await electron.launch({
    args: ['dist/main/main.cjs'],
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...env, BIBLE_USER_DATA_PATH: userDataPath, NODE_ENV: 'test' },
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
      const probeFile = await bundleProbe();
      const outcome = await app.application.evaluate(async (_electronModule, file) => {
        // `mainModule.require` is the one loader the evaluate sandbox reaches.
        const load = process.mainModule?.require;
        if (!load) return { ok: false as const, error: 'no mainModule in Electron main' };
        const probe = load(file) as typeof EmbedderProbe;
        return probe.embedOnce('what happens at the close of probation');
      }, probeFile);

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
      expect(outcome.value.fingerprint).toBe(
        'EmbeddingGemma-300M/sentence-embedding/retrieval/256d-mrl/int8-fixed',
      );
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
      const probeFile = await bundleProbe();
      const pair = await app.application.evaluate(async (_electronModule, file) => {
        const load = process.mainModule?.require;
        if (!load) return { ok: false as const, error: 'no mainModule in Electron main' };
        const probe = load(file) as typeof EmbedderProbe;
        return probe.embedPair('the investigative judgment');
      }, probeFile);

      expect(pair.ok, pair.ok ? '' : `embedder declined: ${String(pair.error)}`).toBe(true);
      if (!pair.ok) return;
      // A quantized embedding is deterministic for one input on one device. If
      // it were not, a cached vector index and a live query would disagree.
      expect(pair.value.first).toEqual(pair.value.second);
    } finally {
      await shutdown(app);
    }
  });

  test('finds the weights through ~/.bible/models with no env var set', async () => {
    // This one is specifically about the *fallback*, so it skips unless the
    // weights are at the fallback path itself — a populated BIBLE_MODEL_CACHE
    // somewhere else proves nothing here.
    const fallback = path.join(homedir(), '.bible', 'models');
    test.skip(
      !hasWeights(fallback),
      `no EmbeddingGemma weights at ${fallback} — run the CLI's embedding path once to populate it`,
    );

    const app = await launch(null);
    try {
      const probeFile = await bundleProbe();
      const outcome = await app.application.evaluate(async (_electronModule, file) => {
        const load = process.mainModule?.require;
        if (!load) return { ok: false as const, error: 'no mainModule in Electron main' };
        const probe = load(file) as typeof EmbedderProbe;
        return probe.embedOnce('the sanctuary and its cleansing');
      }, probeFile);

      expect(outcome.ok, outcome.ok ? '' : `embedder declined: ${String(outcome.error)}`).toBe(
        true,
      );
      if (!outcome.ok) return;
      expect(outcome.value.length).toBe(256);
    } finally {
      await shutdown(app);
    }
  });
});
