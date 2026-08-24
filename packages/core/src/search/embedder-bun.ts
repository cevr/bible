/** The Bun (CLI) query embedder: native ONNX CPU (§9.5).
 *
 *  A device choice and nothing else. Everything that decides what a query vector
 *  *is* — the model, the MRL truncation, the quantization — lives in
 *  `embedder-transformers.ts`, so this file cannot make the CLI's vectors differ
 *  from the desktop's. That is what §10's adapter parity check is asserting, and
 *  the cheapest way to satisfy it is to leave the three adapters nothing to
 *  disagree about.
 *
 *  `cpu` rather than any accelerator: §9.5 measures the native CPU path at tens
 *  of milliseconds with the model resident, which is well inside a CLI's budget,
 *  and a GPU provider would be a second execution path to reconcile.
 */

import { Config, Option } from 'effect';
import type { Layer } from 'effect';

import type { QueryEmbedder } from './embedder.js';
import { layerTransformersEmbedder } from './embedder-transformers.js';

/** `~/.bible/models`, beside the corpora the same host already resolves there.
 *  A fallback, not a default cache move: `BIBLE_MODEL_CACHE` still wins, and a
 *  host with no `HOME` reads as "no fallback" rather than failing. */
const bibleHomeModels: Config.Config<Option.Option<string>> = Config.option(
  Config.string('HOME'),
).pipe(Config.map(Option.map((home) => `${home}/.bible/models`)));

export const layerBunEmbedder: Layer.Layer<QueryEmbedder> = layerTransformersEmbedder({
  adapter: 'bun',
  device: 'cpu',
  fallbackCacheDir: bibleHomeModels,
});

export const Default = layerBunEmbedder;
