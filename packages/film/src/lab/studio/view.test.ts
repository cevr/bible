// What the studio's provider derives from its recorder for the panel, so no
// component reads the machine's states: the controls each state offers and
// the commands that press them, the status line, the recording to review, the
// beat list's counts and badges, the meter, and each attempt's line.

import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import { SttUntimed, TakeMismatch } from '../../core/refusals.ts';
import type { StudioAttempt, StudioBeat } from '../../core/studio.ts';
import { RecorderEvent, RecorderState } from './machine.ts';
import {
  atRest,
  attemptLine,
  beatBadge,
  controlsOf,
  eventOf,
  meterOf,
  micOptions,
  nearLimit,
  neighbour,
  reviewWav,
  statusOf,
} from './view.ts';
import { encodeWav } from './wav.ts';

const wav = encodeWav({ rate: 48000, samples: new Float32Array(48000 * 2.5) });
const mismatch = TakeMismatch.make({
  id: 'thesis',
  script: 'the law is right',
  heard: 'the law is light',
  wer: 0.4,
  attempt: 'thesis.ab12.flac',
});
const idle = RecorderState.Idle({ beat: 'a', kept: Option.none() });
const failed = (refusal: TakeMismatch | SttUntimed) =>
  RecorderState.Failed({ beat: 'a', refusal, wav: Option.some(wav) });

const acts = (state: RecorderState) => controlsOf(state).map((c) => c.act);

describe('atRest', () => {
  test('only a recorder with no take to lose is at rest: idle, or refused with none kept', () => {
    expect(atRest(idle)).toBe(true);
    expect(atRest(RecorderState.Failed({ beat: 'a', refusal: mismatch, wav: Option.none() }))).toBe(
      true,
    );
    // A refused take kept to retry (a microphone lost mid-take, a mismatch) is the owner's work.
    expect(atRest(failed(mismatch))).toBe(false);
    expect(atRest(RecorderState.CountIn({ beat: 'a', n: 2 }))).toBe(false);
    expect(atRest(RecorderState.Review({ beat: 'a', wav }))).toBe(false);
  });
});

describe('controlsOf', () => {
  test('each state offers only what the recorder takes there', () => {
    expect(acts(idle)).toEqual(['arm']);
    expect(acts(RecorderState.CountIn({ beat: 'a', n: 2 }))).toEqual(['cancel']);
    expect(acts(RecorderState.Recording({ beat: 'a', startedAt: 0, limit: 300 }))).toEqual([
      'stop',
      'cancel',
    ]);
    expect(acts(RecorderState.Review({ beat: 'a', wav }))).toEqual(['submit', 'arm', 'discard']);
    expect(acts(RecorderState.Importing({ beat: 'a', work: { _tag: 'Upload', wav } }))).toEqual([]);
    expect(acts(failed(mismatch))).toEqual(['acceptAnyway', 'arm', 'retry']);
    expect(acts(failed(SttUntimed.make({ file: 'a.wav', heard: 2 })))).toEqual(['arm', 'retry']);
  });

  test('each control is pressed by its command, as its key and its button are', () => {
    expect(controlsOf(RecorderState.Review({ beat: 'a', wav })).map((c) => c.command)).toEqual([
      'studio.submit',
      'studio.record',
      'studio.back',
    ]);
    expect(controlsOf(failed(mismatch)).map((c) => c.command)).toEqual([
      'studio.submit',
      'studio.record',
      'studio.back',
    ]);
  });
});

describe('eventOf', () => {
  test('arm carries the microphone picked', () => {
    const usb = Option.some('usb');
    expect(eventOf('arm', usb)).toEqual(RecorderEvent.Arm({ device: usb }));
    expect(eventOf('acceptAnyway', usb)).toEqual(RecorderEvent.AcceptAnyway);
  });
});

describe('statusOf', () => {
  test('the count, the recording, the review, the import', () => {
    expect(statusOf(RecorderState.CountIn({ beat: 'a', n: 2 }), Option.none())).toBe(
      'recording in 2…',
    );
    expect(
      statusOf(
        RecorderState.Recording({ beat: 'a', startedAt: 0, limit: 300 }),
        Option.some({ peak: 0.5, rms: 0.1, kept: 3.25 }),
      ),
    ).toBe('recording · 00:00:03:08 of at most 5 min');
    expect(
      statusOf(
        RecorderState.Recording({ beat: 'a', startedAt: 0, limit: 379.4 }),
        Option.some({ peak: 0.5, rms: 0.1, kept: 61.25 }),
      ),
    ).toBe('recording · 00:01:01:08 of at most 6 min 19 s');
    expect(statusOf(RecorderState.Review({ beat: 'a', wav }), Option.none())).toBe(
      'review 00:00:02:15: hear it, then submit',
    );
    expect(
      statusOf(
        RecorderState.Importing({ beat: 'a', work: { _tag: 'Upload', wav } }),
        Option.none(),
      ),
    ).toBe('importing: trimming, levelling and transcribing the take…');
  });

  test('near the take limit the recording warns how long is left, in the warning tone', () => {
    const recording = RecorderState.Recording({ beat: 'a', startedAt: 0, limit: 300 });
    const at = (kept: number) => Option.some({ peak: 0.5, rms: 0.1, kept });
    expect(nearLimit(recording, at(269))).toBe(false);
    expect(nearLimit(recording, at(275))).toBe(true);
    expect(nearLimit(idle, at(275))).toBe(false);
    expect(statusOf(recording, at(275.2))).toBe(
      'recording · 25 s left: the take stops itself at 5 min',
    );
  });

  test('a take kept says what was heard; a refusal is the server’s words', () => {
    const kept = RecorderState.Idle({
      beat: 'a',
      kept: Option.some({ file: 'a.12.flac', transcript: 'hello world', wer: 0.021, mix: 'mixed' }),
    });
    expect(statusOf(kept, Option.none())).toBe(
      'kept a.12.flac: heard “hello world” · 2.1% words differ',
    );
    const unmixed = RecorderState.Idle({
      beat: 'a',
      kept: Option.some({ file: 'a.12.flac', transcript: 'hello', wer: 0, mix: 'failed' }),
    });
    expect(statusOf(unmixed, Option.none())).toContain('the mix failed');
    // A mismatch says how the panel accepts it (the server's words say only what was heard).
    expect(statusOf(failed(mismatch), Option.none())).toBe(
      `${mismatch.message}\nAccept anyway (K) keeps it as the take; Record (R) reads it again`,
    );
    const lost = SttUntimed.make({ file: 'a.wav', heard: 2 });
    expect(statusOf(failed(lost), Option.none())).toBe(lost.message);
  });
});

describe('reviewWav', () => {
  test('only while reviewing', () => {
    expect(reviewWav(RecorderState.Review({ beat: 'a', wav }))).toEqual(Option.some(wav));
    expect(reviewWav(failed(mismatch))).toEqual(Option.none());
  });
});

const beat = (
  id: string,
  state: StudioBeat['state'],
  extra: Partial<StudioBeat> = {},
): StudioBeat => ({
  id,
  file: `${id}.wav`,
  parts: [],
  sources: [],
  state,
  recorded: state === 'recorded',
  attempts: 0,
  ...extra,
});

describe('the beat list', () => {
  const beats = [
    beat('a', 'recorded'),
    beat('b', 'staging'),
    beat('c', 'stale', { staleReason: 'text changed' }),
    beat('d', 'staging'),
  ];

  test("a badge names its state in the owner's words, and a stale one says why", () => {
    expect(beats.map(beatBadge)).toEqual(['recorded', 'scratch', 'stale: text changed', 'scratch']);
  });

  test('←/→ step to the neighbour, and stop at either end', () => {
    expect(neighbour(beats, 'b', 1)).toEqual(Option.some('c'));
    expect(neighbour(beats, 'b', -1)).toEqual(Option.some('a'));
    expect(neighbour(beats, 'a', -1)).toEqual(Option.none());
    expect(neighbour(beats, 'd', 1)).toEqual(Option.none());
  });
});

describe('meterOf', () => {
  test('peak and RMS in dBFS, the bar’s share, and the clip warning at −1 dBFS', () => {
    const quiet = meterOf(Option.some({ peak: 0.1, rms: 0.05, kept: 0 }));
    expect(Option.map(quiet, (m) => [m.peak, m.rms, m.clip])).toEqual(
      Option.some(['−20.0 dBFS', '−26.0 dBFS', false]),
    );
    const hot = meterOf(Option.some({ peak: 0.95, rms: 0.4, kept: 0 }));
    expect(Option.map(hot, (m) => m.clip)).toEqual(Option.some(true));
    expect(Option.map(hot, (m) => m.fill > 0.9 && m.fill <= 1)).toEqual(Option.some(true));
    expect(meterOf(Option.none())).toEqual(Option.none());
  });
});

describe('attemptLine', () => {
  test('what was heard, how far it is off the line, and how long it runs', () => {
    const a: StudioAttempt = {
      file: 'a.1.flac',
      transcript: 'hello world',
      wer: 0.125,
      at: 0,
      duration: 3.456,
      kept: true,
      current: true,
    };
    expect(attemptLine(a)).toBe('“hello world” · 12.5% · 00:00:03:14');
  });
});

describe('micOptions', () => {
  const devices = [
    { id: 'usb', label: 'USB interface' },
    { id: 'built', label: '' },
  ];

  test('the default first, then each microphone by its label (its id when unnamed), the one picked selected', () => {
    expect(micOptions(devices, Option.some('usb'))).toEqual([
      { id: '', label: 'Default microphone', selected: false },
      { id: 'usb', label: 'USB interface', selected: true },
      { id: 'built', label: 'built', selected: false },
    ]);
    expect(micOptions(devices, Option.none()).map((o) => o.selected)).toEqual([true, false, false]);
  });

  test('a remembered microphone that is gone shows as gone and selected, so Default can be picked again', () => {
    expect(micOptions(devices, Option.some('gone'))).toEqual([
      { id: '', label: 'Default microphone', selected: false },
      { id: 'usb', label: 'USB interface', selected: false },
      { id: 'built', label: 'built', selected: false },
      { id: 'gone', label: 'the microphone picked before (not connected)', selected: true },
    ]);
  });

  test('before the browser names its microphones, the remembered one is not called gone', () => {
    expect(micOptions([{ id: '', label: '' }], Option.some('usb'))).toEqual([
      { id: '', label: 'Default microphone', selected: false },
      { id: 'usb', label: 'the microphone picked before', selected: true },
    ]);
  });
});
