import { Effect, Layer } from 'effect';

import { Quotations, type Problem } from '../../src/services/quotations.js';
import type { ServiceCall } from './sequence-recorder.js';

/** Problems the mock reports, by file path; a file not listed checks clean. */
export interface MockQuotationsConfig {
  problems?: Record<string, ReadonlyArray<Omit<Problem, 'file'>>>;
}

export interface MockQuotationsState {
  calls: ServiceCall[];
}

export const createMockQuotationsLayer = (
  config: MockQuotationsConfig,
  state: MockQuotationsState,
) =>
  Layer.succeed(
    Quotations,
    Quotations.of({
      check: (file) =>
        Effect.sync(() => {
          state.calls.push({ _tag: 'Quotations.check', path: file });
          const problems = (config.problems?.[file] ?? []).map((problem) => ({ ...problem, file }));
          return { file, checked: problems.length, problems };
        }),
    }),
  );
