import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

/** Bundle one browser entry the way the scripts do, and return its code. */
const bundle = (entry: string) =>
  Effect.gen(function* () {
    const built = yield* Effect.promise(() =>
      Bun.build({
        entrypoints: [`${import.meta.dir}/${entry}`],
        target: 'browser',
        format: 'esm',
      }),
    );
    expect(built.success).toBe(true);
    const texts = yield* Effect.forEach(built.outputs, (output) =>
      Effect.promise(() => output.text()),
    );
    return texts.join('\n');
  });

// The inspection wire's subprotocol and the attach loop's span name: present
// exactly when `effect-frame/inspection` is in the bundle.
const inspectionMarks = ['effect-frame-inspection.v1', 'InspectionAttach.attachGateway'];

describe('browser entries', () => {
  test('the production entry carries no inspection code', () =>
    Effect.runPromise(
      Effect.map(bundle('index.tsx'), (code) => {
        for (const mark of inspectionMarks) {
          expect(code).not.toContain(mark);
        }
        expect(code).not.toContain('/__inspect');
      }),
    ));

  test('the development entry attaches to an offered gateway', () =>
    Effect.runPromise(
      Effect.map(bundle('index.dev.tsx'), (code) => {
        for (const mark of inspectionMarks) {
          expect(code).toContain(mark);
        }
        expect(code).toContain('/__inspect');
      }),
    ));
});
