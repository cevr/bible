/**
 * Test Assertions - Helpers for asserting on service call sequences
 *
 * Runner-agnostic assertion helpers that work with any test framework.
 */

import { Effect, Option, Predicate, Schema } from 'effect';

import type { CallField, ServiceCall } from './sequence-recorder.js';

/**
 * Error thrown when an assertion fails.
 * Test frameworks should catch this and report appropriately.
 */
export class AssertionError extends Schema.TaggedError<AssertionError>()('AssertionError', {
  message: Schema.String,
}) {}

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

/**
 * Asymmetric matcher pattern (Jest/Vitest style, e.g. expect.stringContaining).
 */
export interface AsymmetricMatcher {
  readonly asymmetricMatch: (value: CallField) => boolean;
}

/**
 * A single expected field: either a concrete value or an asymmetric matcher.
 */
export type CallFieldPattern = CallField | AsymmetricMatcher;

/**
 * Expected call pattern - only specified fields are checked.
 */
export interface CallPattern {
  readonly _tag: string;
  readonly [key: string]: CallFieldPattern;
}

const isMatcher = (pattern: CallFieldPattern): pattern is AsymmetricMatcher =>
  Predicate.hasProperty(pattern, 'asymmetricMatch');

/**
 * Check if a value matches an expected pattern.
 * Supports direct equality and asymmetric matchers (e.g., expect.stringContaining).
 */
const matches = (actual: CallField, expected: CallFieldPattern): boolean => {
  if (isMatcher(expected)) {
    return expected.asymmetricMatch(actual);
  }
  return actual === expected;
};

/**
 * Check if an actual call matches an expected pattern.
 * Only fields present in the pattern are compared.
 */
const callMatches = (actual: ServiceCall, expected: CallPattern): boolean => {
  if (actual._tag !== expected._tag) return false;

  return Object.entries(expected).every(([key, value]) => {
    if (key === '_tag') return true;
    if (!Predicate.isNotUndefined(value)) return true;
    const actualValue = actual[key];
    if (!Predicate.isNotUndefined(actualValue)) return false;
    return matches(actualValue, value);
  });
};

/**
 * Assert that expected calls appear in order within actual calls.
 *
 * Each expected call can be a partial match - only specified properties are checked.
 * Calls can have other calls between them (non-consecutive).
 *
 * @param actual The actual recorded service calls
 * @param expected Expected calls in order (partial matches allowed)
 */
export const assertSequence = (
  actual: ReadonlyArray<ServiceCall>,
  expected: ReadonlyArray<CallPattern>,
): Effect.Effect<void, AssertionError> =>
  Effect.gen(function* () {
    let actualIndex = 0;

    for (const expectedCall of expected) {
      let found = false;

      while (actualIndex < actual.length) {
        const actualCall = actual[actualIndex];
        actualIndex++;
        if (!Predicate.isNotUndefined(actualCall)) continue;

        if (callMatches(actualCall, expectedCall)) {
          found = true;
          break;
        }
      }

      if (!found) {
        const actualTags = actual.map((c) => c._tag).join(', ');
        return yield* AssertionError.make({
          message:
            `Expected call ${encodeJson(expectedCall)} not found in sequence.\n` +
            `Actual calls: [${actualTags}]`,
        });
      }
    }
  });

/**
 * Assert that all expected calls are present (order-independent).
 *
 * Use this when you want to verify calls happened but don't care about order.
 *
 * @param actual The actual recorded service calls
 * @param expected Expected calls (partial matches allowed)
 */
export const assertContains = (
  actual: ReadonlyArray<ServiceCall>,
  expected: ReadonlyArray<CallPattern>,
): Effect.Effect<void, AssertionError> =>
  Effect.gen(function* () {
    for (const expectedCall of expected) {
      const found = actual.some((actualCall) => callMatches(actualCall, expectedCall));

      if (!found) {
        const matchingCalls = actual.filter((c) => c._tag === expectedCall._tag);
        let actualSummary = `All calls: ${encodeJson(actual.map((c) => c._tag))}`;
        if (matchingCalls.length > 0)
          actualSummary = `Matching calls: ${encodeJson(matchingCalls)}`;

        return yield* AssertionError.make({
          message: `Expected call ${encodeJson(expectedCall)} not found in calls.\n${actualSummary}`,
        });
      }
    }
  });

/**
 * Assert that a specific call type appears exactly N times.
 *
 * @param calls The actual recorded service calls
 * @param tag The call type to count
 * @param count Expected count
 */
export const assertCallCount = (
  calls: ReadonlyArray<ServiceCall>,
  tag: string,
  count: number,
): Effect.Effect<void, AssertionError> =>
  Effect.gen(function* () {
    const actual = calls.filter((c) => c._tag === tag).length;
    if (actual !== count) {
      return yield* AssertionError.make({
        message: `Expected ${count} calls of type "${tag}", but found ${actual}`,
      });
    }
  });

/**
 * Assert that no calls of a specific type were made.
 *
 * @param calls The actual recorded service calls
 * @param tag The call type that should not appear
 */
export const assertNoCalls = (
  calls: ReadonlyArray<ServiceCall>,
  tag: string,
): Effect.Effect<void, AssertionError> => assertCallCount(calls, tag, 0);

/**
 * Get all calls of a specific type.
 * Useful for custom assertions.
 */
export const getCallsOfType = <T extends string>(
  calls: ReadonlyArray<ServiceCall>,
  tag: T,
): Array<ServiceCall<T>> => calls.filter((c): c is ServiceCall<T> => c._tag === tag);

/**
 * Get the first call of a specific type.
 */
export const getFirstCall = <T extends string>(
  calls: ReadonlyArray<ServiceCall>,
  tag: T,
): Option.Option<ServiceCall<T>> =>
  Option.fromUndefinedOr(calls.find((c): c is ServiceCall<T> => c._tag === tag));

/**
 * Get the last call of a specific type.
 */
export const getLastCall = <T extends string>(
  calls: ReadonlyArray<ServiceCall>,
  tag: T,
): Option.Option<ServiceCall<T>> => {
  const matching = getCallsOfType(calls, tag);
  return Option.fromUndefinedOr(matching[matching.length - 1]);
};
