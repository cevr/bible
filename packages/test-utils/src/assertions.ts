/**
 * Test Assertions - Helpers for asserting on service call sequences
 *
 * Runner-agnostic assertion helpers that work with any test framework.
 */

import type { ServiceCall } from './sequence-recorder.js';

/**
 * Error thrown when an assertion fails.
 * Test frameworks should catch this and report appropriately.
 */
export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssertionError';
  }
}

/**
 * Check if a value matches an expected pattern.
 * Supports:
 * - Direct equality
 * - Asymmetric matchers (e.g., expect.stringContaining)
 * - undefined in expected means "any value"
 */
const matches = (actual: unknown, expected: unknown): boolean => {
  if (expected === undefined) return true;

  // Handle asymmetric matchers (Jest/Vitest style)
  if (expected !== null && typeof expected === 'object' && 'asymmetricMatch' in expected) {
    return (expected as { asymmetricMatch: (v: unknown) => boolean }).asymmetricMatch(actual);
  }

  return actual === expected;
};

/**
 * Check if an actual call matches an expected pattern.
 */
const callMatches = (actual: ServiceCall, expected: Partial<ServiceCall>): boolean => {
  if (actual._tag !== expected._tag) return false;

  for (const [key, value] of Object.entries(expected)) {
    if (key === '_tag') continue;
    if (!matches((actual as Record<string, unknown>)[key], value)) {
      return false;
    }
  }

  return true;
};

/**
 * Assert that expected calls appear in order within actual calls.
 *
 * Each expected call can be a partial match - only specified properties are checked.
 * Calls can have other calls between them (non-consecutive).
 *
 * @param actual The actual recorded service calls
 * @param expected Expected calls in order (partial matches allowed)
 * @throws AssertionError if a call is not found
 */
export const assertSequence = (
  actual: ServiceCall[],
  expected: Array<Partial<ServiceCall>>,
): void => {
  let actualIndex = 0;

  for (const expectedCall of expected) {
    let found = false;

    while (actualIndex < actual.length) {
      const actualCall = actual[actualIndex];
      actualIndex++;
      if (!actualCall) continue;

      if (callMatches(actualCall, expectedCall)) {
        found = true;
        break;
      }
    }

    if (!found) {
      const actualTags = actual.map((c) => c._tag).join(', ');
      throw new AssertionError(
        `Expected call ${JSON.stringify(expectedCall)} not found in sequence.\n` +
          `Actual calls: [${actualTags}]`,
      );
    }
  }
};

/**
 * Assert that all expected calls are present (order-independent).
 *
 * Use this when you want to verify calls happened but don't care about order.
 *
 * @param actual The actual recorded service calls
 * @param expected Expected calls (partial matches allowed)
 * @throws AssertionError if a call is not found
 */
export const assertContains = (
  actual: ServiceCall[],
  expected: Array<Partial<ServiceCall>>,
): void => {
  for (const expectedCall of expected) {
    const found = actual.some((actualCall) => callMatches(actualCall, expectedCall));

    if (!found) {
      const matchingCalls = actual.filter((c) => c._tag === expectedCall._tag);
      const actualSummary =
        matchingCalls.length > 0
          ? `Matching calls: ${JSON.stringify(matchingCalls, null, 2)}`
          : `All calls: ${JSON.stringify(actual.map((c) => c._tag))}`;

      throw new AssertionError(
        `Expected call ${JSON.stringify(expectedCall)} not found in calls.\n` + actualSummary,
      );
    }
  }
};

/**
 * Assert that a specific call type appears exactly N times.
 *
 * @param calls The actual recorded service calls
 * @param tag The call type to count
 * @param count Expected count
 * @throws AssertionError if count doesn't match
 */
export const assertCallCount = (calls: ServiceCall[], tag: string, count: number): void => {
  const actual = calls.filter((c) => c._tag === tag).length;
  if (actual !== count) {
    throw new AssertionError(`Expected ${count} calls of type "${tag}", but found ${actual}`);
  }
};

/**
 * Assert that no calls of a specific type were made.
 *
 * @param calls The actual recorded service calls
 * @param tag The call type that should not appear
 * @throws AssertionError if any calls of that type exist
 */
export const assertNoCalls = (calls: ServiceCall[], tag: string): void => {
  assertCallCount(calls, tag, 0);
};

/**
 * Get all calls of a specific type.
 * Useful for custom assertions.
 */
export const getCallsOfType = <T extends string>(
  calls: ServiceCall[],
  tag: T,
): Array<ServiceCall<T>> => calls.filter((c): c is ServiceCall<T> => c._tag === tag);

/**
 * Get the first call of a specific type, or undefined if none.
 */
export const getFirstCall = <T extends string>(
  calls: ServiceCall[],
  tag: T,
): ServiceCall<T> | undefined => calls.find((c): c is ServiceCall<T> => c._tag === tag);

/**
 * Get the last call of a specific type, or undefined if none.
 */
export const getLastCall = <T extends string>(
  calls: ServiceCall[],
  tag: T,
): ServiceCall<T> | undefined => {
  const matching = getCallsOfType(calls, tag);
  return matching[matching.length - 1];
};
