// The one path a call on an export page takes: its answer decoded by the
// call's schema, a refusal or an answer that does not decode reported as the
// call's own error. What a page hands back for a frame's luma: one value per
// cell of the grid asked for. An empty read (no canvas to sample on) or a
// short one fails, so a loop is never compared on nothing and called clean.
// And Chromium's flags per platform. No Chromium.

import { describe, expect, test } from 'bun:test';
import { Effect, Result, Schema } from 'effect';
import type { LumaArea } from '../core/export-handle.ts';
import { CallRefused, type Invoke, framePage, launchArgs, lumaGrid } from './browser.ts';
import { EncodeFailed, FrameFailed } from './errors.ts';
import { testExportInfo } from './testing.ts';

/** A page whose every call hands back `answer`, or is refused with `refused`. */
const pageAnswering = (answer: Effect.Effect<unknown, CallRefused>) => {
  const invoke: Invoke = () => answer;
  return framePage(testExportInfo, 'Test film', invoke);
};

describe('framePage', () => {
  test('decodes an answer by its call: a frame comes back as bytes', () => {
    const page = pageAnswering(Effect.succeed('AQID'));
    expect(Effect.runSync(page.call('frame', 0, 'image/png'))).toEqual(new Uint8Array([1, 2, 3]));
  });

  test('an answer that does not decode fails the call, naming its frame', () => {
    const page = pageAnswering(Effect.succeed({ texts: 'nothing' }));
    const error = Effect.runSync(Effect.flip(page.call('probe', 12)));
    expect(error).toBeInstanceOf(FrameFailed);
    expect(error).toMatchObject({ frame: 12 });
    expect(error.message).toContain('the export handle answered');
  });

  test("a refused call is the call's own error, from its arguments", () => {
    const page = pageAnswering(Effect.fail(CallRefused.make({ reason: 'timed out' })));
    const call = page.call('encode', 240, 480, 1, false, { _tag: 'Software' });
    expect(Effect.runSync(Effect.flip(call))).toEqual(
      EncodeFailed.make({ from: 240, to: 480, reason: 'timed out' }),
    );
  });
});

describe('launchArgs', () => {
  test('macOS runs the GPU process through Metal for the hardware encoder', () => {
    expect(launchArgs('darwin')).toEqual([
      '--disable-gpu-vsync',
      '--disable-frame-rate-limit',
      '--enable-gpu',
      '--use-angle=metal',
      '--disable-accelerated-2d-canvas',
    ]);
  });

  test('Linux gets no macOS-only backend; the canvas draws in software everywhere', () => {
    expect(launchArgs('linux')).toEqual([
      '--disable-gpu-vsync',
      '--disable-frame-rate-limit',
      '--disable-accelerated-2d-canvas',
    ]);
  });
});

const area: LumaArea = { x: 0, y: 620, w: 1080, h: 608, cols: 4, rows: 2 };
const read = (cells: ReadonlyArray<number>) => Schema.decodeResult(lumaGrid(area))(cells);

describe('lumaGrid', () => {
  test('takes one luma per cell of the grid', () => {
    expect(read([1, 2, 3, 4, 5, 6, 7, 8])).toEqual(Result.succeed([1, 2, 3, 4, 5, 6, 7, 8]));
  });

  test('refuses an empty read, and one a cell short', () => {
    expect(Result.isFailure(read([]))).toBe(true);
    expect(Result.isFailure(read([1, 2, 3, 4, 5, 6, 7]))).toBe(true);
  });
});
