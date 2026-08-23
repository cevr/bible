/** The web worker query embedder: transformers.js on WebGPU (§9.5).
 *
 *  `webgpu`, and no fallback. §9.5 is explicit that "the WASM fallback (~3-7 s
 *  est. for a 300M model) is not a supported query path": a search box that
 *  blocks for seconds is not a search box, so a browser without WebGPU declines
 *  and the client degrades to lexical-only carrying §9.6's `embedder` absence.
 *
 *  The decline is not written here. `loadTransformersEmbedder` already turns a
 *  device that will not initialize into `QueryEmbedderUnavailable`, and WebGPU's
 *  absence is exactly that — so the no-WebGPU path is the ordinary failure path
 *  rather than a branch this file has to detect. One less place for the web
 *  client to behave differently from its siblings.
 */

import type { Layer } from 'effect';

import type { QueryEmbedder } from './embedder.js';
import { layerTransformersEmbedder } from './embedder-transformers.js';

export const layerBrowserEmbedder: Layer.Layer<QueryEmbedder> = layerTransformersEmbedder({
  adapter: 'web-worker',
  device: 'webgpu',
});

export const Default = layerBrowserEmbedder;
