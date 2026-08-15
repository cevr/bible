/**
 * @bible/test-utils - Testing utilities for Bible Tools
 *
 * Runner-agnostic test helpers following the Effect testing pattern:
 * - Sequence recording for observable side effects
 * - Generic test layer factory
 * - Assertion helpers for call sequences
 */

// Sequence recorder
export {
  CallSequence,
  CallSequenceLayer,
  recordCall,
  getCallSequence,
  clearCallSequence,
  withRecording,
  type BaseServiceCall,
  type CallField,
  type ServiceCall,
} from './sequence-recorder.js';

// Assertions
export {
  AssertionError,
  type AsymmetricMatcher,
  type CallFieldPattern,
  type CallPattern,
  assertSequence,
  assertContains,
  assertCallCount,
  assertNoCalls,
  getCallsOfType,
  getFirstCall,
  getLastCall,
} from './assertions.js';

// Test layers
export { createRecordingTestLayer, runWithCallSequence } from './test-layers.js';
