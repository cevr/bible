import { Effect, Layer } from 'effect';

import {
  InteractiveReader,
  type InteractiveReaderService,
} from '../../src/services/interactive-reader.js';
import type { ServiceCall } from './sequence-recorder.js';

export interface MockInteractiveReaderState {
  calls: ServiceCall[];
}

/** Deterministic adapter used to test the exact production command graph. */
export const createMockInteractiveReaderLayer = (state: MockInteractiveReaderState) => {
  const service: InteractiveReaderService = {
    open: (destination) =>
      Effect.sync(() => {
        state.calls.push({ _tag: 'InteractiveReader.open', destination });
      }),
  };

  return Layer.succeed(InteractiveReader, service);
};
