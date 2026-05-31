import { describe, expect, test } from 'bun:test';
import { Effect, Schema } from 'effect';

import { Grade } from '../src/lib/grading/grade.ts';
import { Grader, type GradeInput } from '../src/lib/grading/grader.ts';

/*
 * Tests the Grader service contract and the Grade structured-output schema. The
 * real Anthropic path is exercised end-to-end in the endpoint + fixture-loop tasks
 * (with a live key); here we keep things deterministic: the layerTest proves the
 * service shape, and a Grade round-trip proves the contract the model must satisfy.
 */

const input: GradeInput = {
  transcript: 'Daniel was sealed until 1798, then people could understand it again.',
  sourceText: 'The book was sealed until the time of the end, which began in 1798...',
  keyPoints: [
    { id: 'kp1', label: 'Sealed until the end', detail: 'Shut up until the time of the end.' },
    { id: 'kp2', label: '1798', detail: 'The time of the end began in 1798.' },
  ],
};

const sampleGrade: Grade = {
  score: 80,
  summary: 'Strong grasp of the unsealing and its date; the third point was lighter.',
  keyPoints: [
    { keyPointId: 'kp1', status: 'covered', explanation: 'Clearly stated the sealing.' },
    { keyPointId: 'kp2', status: 'covered', explanation: 'Gave the 1798 date.' },
  ],
  freeClaims: [],
};

describe('Grader service', () => {
  test('layerTest returns the supplied Grade through the service', async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const grader = yield* Grader;
        return yield* grader.grade(input);
      }).pipe(Effect.provide(Grader.layerTest(sampleGrade))),
    );
    expect(result.score).toBe(80);
    expect(result.keyPoints).toHaveLength(2);
    expect(result.keyPoints[0]?.status).toBe('covered');
  });
});

describe('Grade structured-output schema', () => {
  const decode = Schema.decodeUnknownEffect(Grade);

  test('decodes a well-formed model payload', async () => {
    const payload = {
      score: 72,
      summary: 'Good coverage with one gap.',
      keyPoints: [
        { keyPointId: 'kp1', status: 'covered', explanation: 'Stated it.' },
        { keyPointId: 'kp2', status: 'partial', explanation: 'Date was vague.' },
      ],
      freeClaims: [
        { claim: 'The little horn is Rome.', status: 'correct', explanation: 'Matches source.' },
      ],
    };
    const grade = await Effect.runPromise(decode(payload));
    expect(grade.score).toBe(72);
    expect(grade.freeClaims).toHaveLength(1);
  });

  test('rejects an out-of-range score', async () => {
    const exit = await Effect.runPromiseExit(
      decode({ score: 140, summary: 's', keyPoints: [], freeClaims: [] }),
    );
    expect(exit._tag).toBe('Failure');
  });

  test('rejects an invalid key-point status', async () => {
    const exit = await Effect.runPromiseExit(
      decode({
        score: 50,
        summary: 's',
        keyPoints: [{ keyPointId: 'kp1', status: 'maybe', explanation: 'x' }],
        freeClaims: [],
      }),
    );
    expect(exit._tag).toBe('Failure');
  });
});
