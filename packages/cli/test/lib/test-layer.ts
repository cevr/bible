import path from 'path';

import type { FileSystem } from 'effect';
import { Layer, Path } from 'effect';

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
import { installMockFetch, type MockHttpConfig, type MockHttpState } from './mock-http.js';
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
  /** Call the cleanup function when done with the test */
  cleanup: () => void;
  /** The composed layer to provide to the CLI */
  layer: Layer.Layer<
    FileSystem.FileSystem | Path.Path | AI | AppleScript | Chime | CallSequence,
    never,
    never
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
  const cleanupFns: Array<() => void> = [];

  // Shared state for service calls
  const appleScriptState: MockAppleScriptState = { calls: [] };
  const chimeState: MockChimeState = { calls: [] };
  let httpState: MockHttpState | null = null;

  // Create mock file system
  const mockFs = createMockFileSystemLayer(config.files ?? { files: {}, directories: [] });

  // Create mock AI
  const mockAI = createMockAILayer(config.ai ?? { responses: { high: [], low: [] } });

  // Create mock AppleScript service
  const mockAppleScript = createMockAppleScriptLayer(config.appleScript ?? {}, appleScriptState);

  // Create mock Chime service
  const mockChime = createMockChimeLayer(chimeState);

  // Install mock fetch
  if (config.http) {
    const fetchResult = installMockFetch(config.http);
    httpState = fetchResult.state;
    cleanupFns.push(fetchResult.cleanup);
  }

  // Create a mock Path layer (use real path implementation since it's pure computation)
  const mockPath = Layer.succeed(Path.Path, {
    ...path,
    fromFileUrl: (url: URL | string) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      return urlStr.replace('file://', '');
    },
    toFileUrl: (p: string) => new URL(`file://${p}`),
  } as Path.Path);

  // Compose all layers
  const composedLayer = Layer.mergeAll(
    CallSequenceLayer,
    mockFs.layer,
    mockAI.layer,
    mockAppleScript,
    mockChime,
    mockPath,
  );

  return {
    layer: composedLayer,
    cleanup: () => {
      for (const fn of cleanupFns) {
        fn();
      }
    },
    getAllCalls: () => [
      // Service layer calls (recorded via Effect context)
      ...appleScriptState.calls,
      ...chimeState.calls,
      // External calls (recorded outside Effect context)
      ...mockAI.state.calls,
      ...(httpState?.calls ?? []),
    ],
  };
};
