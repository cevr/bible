// The studio's commands over a recorder's state: R records, Space stops, K
// submits or accepts, Esc cancels, discards or backs out, each only where
// the state has that control; ←/→ step through the beats at rest or after a
// refusal, never mid-take.

import { describe, expect, test } from 'bun:test';
import { Effect, Option } from 'effect';
import { BY_BUTTON, type Command, quiet } from '../../command/command.ts';
import { contextAt } from '../../command/context.ts';
import { SttUntimed, TakeMismatch } from '../../core/refusals.ts';
import { micCommands, studioCommands } from './commands.ts';
import { RecorderState } from './machine.ts';
import { type Act, controlFor, stepsBeats } from './view.ts';
import { encodeWav } from './wav.ts';

const wav = encodeWav({ rate: 48000, samples: new Float32Array(4800) });
const mismatch = TakeMismatch.make({
  id: 'thesis',
  script: 'the law is right',
  heard: 'the law is light',
  wer: 0.4,
  attempt: 'thesis.ab12.flac',
});
const idle = RecorderState.Idle({ beat: 'a', kept: Option.none() });
const recording = RecorderState.Recording({ beat: 'a', startedAt: 0, limit: 300 });
const review = RecorderState.Review({ beat: 'a', wav });
const refused = (refusal: TakeMismatch | SttUntimed) =>
  RecorderState.Failed({ beat: 'a', refusal, wav: Option.some(wav) });
const ctx = contextAt('lab', '/films/f/lab');

/** The studio's commands in `state`: what each run did, or `-` where it is not offered now. */
const pressed = (state: RecorderState) => {
  const did: Array<Act | number> = [];
  const commands = studioCommands({
    control: (command) => controlFor(state, command),
    perform: (act) => did.push(act),
    stepsBeats: () => stepsBeats(state),
    step: (by) => did.push(by),
  });
  const run = (c: Command) => {
    if (!c.when(ctx)) return '-';
    did.length = 0;
    Effect.runSync(Effect.orElseSucceed(c.run(ctx, BY_BUTTON), () => quiet));
    return did.join('');
  };
  return Object.fromEntries(commands.map((c) => [c.id, run(c)]));
};

describe('the studio as commands', () => {
  test('each control is its command where the state offers it; ←/→ step at rest or after a refusal', () => {
    expect(pressed(idle)).toEqual({
      'studio.record': 'arm',
      'studio.stop': '-',
      'studio.submit': '-',
      'studio.back': '-',
      'studio.beat-next': '1',
      'studio.beat-previous': '-1',
    });
    expect(pressed(RecorderState.CountIn({ beat: 'a', n: 3 }))).toMatchObject({
      'studio.record': '-',
      'studio.back': 'cancel',
      'studio.beat-next': '-',
    });
    expect(pressed(recording)).toEqual({
      'studio.record': '-',
      'studio.stop': 'stop',
      'studio.submit': '-',
      'studio.back': 'cancel',
      'studio.beat-next': '-',
      'studio.beat-previous': '-',
    });
    expect(pressed(review)).toMatchObject({
      'studio.record': 'arm',
      'studio.submit': 'submit',
      'studio.back': 'discard',
      'studio.beat-next': '-',
    });
    expect(pressed(refused(mismatch))).toMatchObject({
      'studio.record': 'arm',
      'studio.submit': 'acceptAnyway',
      'studio.back': 'retry',
      'studio.beat-previous': '-1',
    });
    expect(pressed(refused(SttUntimed.make({ file: 'a.wav', heard: 2 })))).toMatchObject({
      'studio.submit': '-',
      'studio.back': 'retry',
    });
    expect(
      Object.values(
        pressed(RecorderState.Importing({ beat: 'a', work: { _tag: 'Upload', wav } })),
      ).every((did) => did === '-'),
    ).toBe(true);
  });
});

describe('the microphone as commands', () => {
  test('⌘K offers each microphone but the one in use, found by typing, and picks it', () => {
    const picked: Array<Option.Option<string>> = [];
    const commands = micCommands(
      [
        { id: '', label: 'Default microphone', selected: false },
        { id: 'usb', label: 'USB', selected: true },
        { id: 'default', label: 'Default - Desk', selected: false },
      ],
      (device) => picked.push(device),
    );
    // A device whose own id is `default` (Chrome's alias) is a device's entry, apart from the default's.
    expect(commands.map((c) => [c.id, c.label, c.typed])).toEqual([
      ['studio.mic.default', 'Choose microphone: Default microphone', true],
      ['studio.mic.device.default', 'Choose microphone: Default - Desk', true],
    ]);
    for (const c of commands) Effect.runSync(c.run(ctx, BY_BUTTON));
    expect(picked).toEqual([Option.none(), Option.some('default')]);
  });
});
