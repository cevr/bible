/** The Electron main query embedder: native ONNX CPU (§9.5).
 *
 *  Identical to the Bun adapter in everything but its name, and deliberately so
 *  — the two run the same runtime on the same device. They are two files rather
 *  than one because the `adapter` label is what an operator reads in a
 *  `QueryEmbedderUnavailable`, and "which host declined" is the first thing that
 *  diagnostic has to answer.
 *
 *  §9.5 notes the model stays resident in Electron main, which is what makes
 *  tens of milliseconds the steady-state figure: the layer is built once with
 *  the runtime and the pipeline is memoized across every search.
 */

import type { Layer } from 'effect';

import type { QueryEmbedder } from './embedder.js';
import { layerTransformersEmbedder } from './embedder-transformers.js';

export const layerNodeEmbedder: Layer.Layer<QueryEmbedder> = layerTransformersEmbedder({
  adapter: 'electron-main',
  device: 'cpu',
});

export const Default = layerNodeEmbedder;
