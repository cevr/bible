// What the studio's provider derives from its recorder for the panel, so no
// component reads the machine's states: the controls each state offers and
// the keys that press them, the status line, the recording to review, the
// beat list's counts and badges, the meter, and each attempt's line.

import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import type { StudioAttempt, StudioBeat, StudioRefusal } from '../../core/studio.ts';
import { RecorderEvent, RecorderState } from './machine.ts';
import {
  attemptLine,
  beatBadge,
  beatCounts,
  controlsOf,
  eventOf,
  keyOf,
  meterOf,
  nearLimit,
  neighbour,
  reviewWav,
  statusOf,
} from './view.ts';
import { encodeWav } from './wav.ts';

const wav = encodeWav({ rate: 48000, samples: new Float32Array(48000 * 2.5) });
const mismatch: StudioRefusal = {
  _tag: 'TakeMismatch',
  message: 'TakeMismatch: thesis was heard as "the law is light" (40.0% of words differ)',
  heard: 'the law is light',
  wer: 0.4,
  attempt: 'thesis.ab12.flac',
};
const idle = RecorderState.Idle({ beat: 'a', kept: Option.none() });
const failed = (refusal: StudioRefusal) =>
  RecorderState.Failed({ beat: 'a', refusal, wav: Option.some(wav) });

const acts = (state: RecorderState) => controlsOf(state).map((c) => c.act);

describe('controlsOf', () => {
  test('each state offers only what the recorder takes there', () => {
    expect(acts(idle)).toEqual(['arm']);
    expect(acts(RecorderState.CountIn({ beat: 'a', n: 2 }))).toEqual(['cancel']);
    expect(acts(RecorderState.Recording({ beat: 'a', startedAt: 0, limit: 300 }))).toEqual([
      'stop',
      'cancel',
    ]);
    expect(acts(RecorderState.Review({ beat: 'a', wav }))).toEqual(['submit', 'retake', 'discard']);
    expect(acts(RecorderState.Importing({ beat: 'a', work: { _tag: 'Upload', wav } }))).toEqual([]);
    expect(acts(failed(mismatch))).toEqual(['acceptAnyway', 'arm', 'retry']);
    expect(acts(failed({ _tag: 'SttUntimed', message: 'no words timed' }))).toEqual([
      'arm',
      'retry',
    ]);
  });

  test('each control names its key', () => {
    expect(controlsOf(RecorderState.Review({ beat: 'a', wav })).map((c) => c.label)).toEqual([
      'Submit (K)',
      'Retake (R)',
      'Discard (Esc)',
    ]);
  });
});

describe('keyOf', () => {
  const key = (state: RecorderState, k: string) => keyOf(state, k);

  test('R records, Space stops, K submits or accepts, Esc cancels, discards or backs out', () => {
    expect(key(idle, 'r')).toEqual(Option.some({ _tag: 'Act', act: 'arm' }));
    expect(key(RecorderState.Recording({ beat: 'a', startedAt: 0, limit: 300 }), ' ')).toEqual(
      Option.some({ _tag: 'Act', act: 'stop' }),
    );
    expect(key(RecorderState.Review({ beat: 'a', wav }), 'k')).toEqual(
      Option.some({ _tag: 'Act', act: 'submit' }),
    );
    expect(key(RecorderState.Review({ beat: 'a', wav }), 'R')).toEqual(
      Option.some({ _tag: 'Act', act: 'retake' }),
    );
    expect(key(failed(mismatch), 'K')).toEqual(Option.some({ _tag: 'Act', act: 'acceptAnyway' }));
    expect(key(failed(mismatch), 'Escape')).toEqual(Option.some({ _tag: 'Act', act: 'retry' }));
    expect(key(RecorderState.CountIn({ beat: 'a', n: 3 }), 'Escape')).toEqual(
      Option.some({ _tag: 'Act', act: 'cancel' }),
    );
  });

  test('a studio key with nothing to do now is still the studio’s: it does nothing', () => {
    expect(key(idle, ' ')).toEqual(Option.some({ _tag: 'None' }));
    expect(key(RecorderState.Recording({ beat: 'a', startedAt: 0, limit: 300 }), 'k')).toEqual(
      Option.some({ _tag: 'None' }),
    );
  });

  test('←/→ step through the beats at rest or after a refusal, never while recording', () => {
    expect(key(idle, 'ArrowRight')).toEqual(Option.some({ _tag: 'Beat', step: 1 }));
    expect(key(failed(mismatch), 'ArrowLeft')).toEqual(Option.some({ _tag: 'Beat', step: -1 }));
    expect(
      key(RecorderState.Recording({ beat: 'a', startedAt: 0, limit: 300 }), 'ArrowRight'),
    ).toEqual(Option.some({ _tag: 'None' }));
    expect(key(RecorderState.Review({ beat: 'a', wav }), 'ArrowLeft')).toEqual(
      Option.some({ _tag: 'None' }),
    );
  });

  test('any other key is not the studio’s', () => {
    for (const k of ['n', 'c', '[', ']', 'z', 'Enter']) expect(key(idle, k)).toEqual(Option.none());
  });
});

describe('eventOf', () => {
  test('arm and retake carry the microphone picked', () => {
    const usb = Option.some('usb');
    expect(eventOf('arm', usb)).toEqual(RecorderEvent.Arm({ device: usb }));
    expect(eventOf('retake', usb)).toEqual(RecorderEvent.Retake({ device: usb }));
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
    ).toBe('recording · 3.3 s of at most 5 min');
    expect(
      statusOf(
        RecorderState.Recording({ beat: 'a', startedAt: 0, limit: 379.4 }),
        Option.some({ peak: 0.5, rms: 0.1, kept: 61.25 }),
      ),
    ).toBe('recording · 61.3 s of at most 6 min 19 s');
    expect(statusOf(RecorderState.Review({ beat: 'a', wav }), Option.none())).toBe(
      'review 2.5 s: hear it, then submit',
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
      kept: Option.some({ file: 'a.12.flac', heard: 'hello world', wer: 0.021, mixed: true }),
    });
    expect(statusOf(kept, Option.none())).toBe(
      'kept a.12.flac: heard “hello world” · 2.1% words differ',
    );
    const unmixed = RecorderState.Idle({
      beat: 'a',
      kept: Option.some({ file: 'a.12.flac', heard: 'hello', wer: 0, mixed: false }),
    });
    expect(statusOf(unmixed, Option.none())).toContain('the mix failed');
    expect(statusOf(failed(mismatch), Option.none())).toBe(mismatch.message);
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

  test('counts each state', () => {
    expect(beatCounts(beats)).toBe('1 recorded · 2 staging · 1 stale');
  });

  test('a stale badge says why', () => {
    expect(beats.map(beatBadge)).toEqual(['recorded', 'staging', 'stale: text changed', 'staging']);
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
      heard: 'hello world',
      wer: 0.125,
      at: 0,
      duration: 3.456,
      kept: true,
      current: true,
    };
    expect(attemptLine(a)).toBe('“hello world” · 12.5% · 3.5 s');
  });
});
