import type { FileSystem } from 'effect';
import { Layer, Path } from 'effect';
import type { HttpClient } from 'effect/unstable/http';

import type { AI } from '../../src/services/ai.js';
import type { AppleScript } from '../../src/services/apple-script.js';
import type { Chime } from '../../src/services/chime.js';

import { createMockAILayer, type MockAIConfig } from './mock-ai.js';
import {
  createMockAppleScriptLayer,
  type MockAppleScriptConfig,
  type MockAppleScriptState,
} from './mock-apple-script.js';
import { createMockChimeLayer, type MockChimeState } from './mock-chime.js';
import { createMockFileSystemLayer, type MockFileSystemConfig } from './mock-filesystem.js';
import { createMockHttpLayer, type MockHttpConfig } from './mock-http.js';
import { CallSequenceLayer, type CallSequence, type ServiceCall } from './sequence-recorder.js';

/**
 * Configuration for creating a test layer.
 */
export interface TestLayerConfig {
  /** Mock file system state */
  files?: MockFileSystemConfig;
  /** Mock AI responses */
  ai?: MockAIConfig;
  /** Mock HTTP responses */
  http?: MockHttpConfig;
  /** Mock AppleScript configuration */
  appleScript?: MockAppleScriptConfig;
}

/**
 * State returned from creating a test layer.
 * Includes cleanup functions and mutable state for assertions.
 */
export interface TestLayerState {
  /** The composed layer to provide to the CLI */
  layer: Layer.Layer<
    | FileSystem.FileSystem
    | Path.Path
    | HttpClient.HttpClient
    | AI
    | AppleScript
    | Chime
    | CallSequence
  >;
  /** Get all calls recorded (from services and external) */
  getAllCalls: () => ServiceCall[];
}

/**
 * Create a composite test layer with all mocked services.
 *
 * This follows the Effect testing pattern of providing mock layers
 * for all external dependencies while running actual command logic.
 */
export const createTestLayer = (config: TestLayerConfig = {}): TestLayerState => {
  // Shared state for service calls
  const appleScriptState: MockAppleScriptState = { calls: [] };
  const chimeState: MockChimeState = { calls: [] };
  const mockHttp = createMockHttpLayer(config.http ?? { responses: {} });

  // Create mock file system
  const mockFs = createMockFileSystemLayer(config.files ?? { files: {}, directories: [] });

  // Create mock AI
  const mockAI = createMockAILayer(config.ai ?? { responses: { high: [], low: [] } });

  // Create mock AppleScript service
  const mockAppleScript = createMockAppleScriptLayer(config.appleScript ?? {}, appleScriptState);

  // Create mock Chime service
  const mockChime = createMockChimeLayer(chimeState);

  // Use the real Path layer (it's pure computation, no mocking needed)
  const mockPath = Path.layer;

  // Compose all layers; CallSequence is provided via provideMerge so it's both
  // available to layers that depend on it (e.g. mockFs.layer) AND exposed in the
  // composed layer's output (so getCallSequence can be yielded by tests).
  const composedLayer = Layer.mergeAll(
    mockFs.layer,
    mockAI.layer,
    mockAppleScript,
    mockChime,
    mockHttp.layer,
    mockPath,
  ).pipe(Layer.provideMerge(CallSequenceLayer));

  return {
    layer: composedLayer,
    getAllCalls: () => [
      // Service layer calls (recorded via Effect context)
      ...appleScriptState.calls,
      ...chimeState.calls,
      // External calls (recorded outside Effect context)
      ...mockAI.state.calls,
      ...mockHttp.state.calls,
    ],
  };
};
