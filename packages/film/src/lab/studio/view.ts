// What the studio's panel shows of its recorder, derived: the controls each
// state offers (with the key that presses each), what a key does in a state,
// the status line, the recording under review, the beat list's counts and
// badges, the meter's reading, and each attempt's line. The provider hands
// these to the components, so none of them reads the machine's states. Pure.

import { Match, Option, Predicate } from 'effect';
import { timecode } from '../../core/time.ts';
import { STUDIO_IMPORT_WAIT_S, type StudioAttempt, type StudioBeat } from '../../core/studio.ts';
import { minutes } from './api.ts';
import { clipping, dbfs, type Level, type MicDevice } from './capture.ts';
import { RecorderEvent, type RecorderState, mismatchAttempt } from './machine.ts';
import { wavSeconds } from './wav.ts';

/** What a control does. */
export type Act = 'arm' | 'stop' | 'cancel' | 'submit' | 'discard' | 'acceptAnyway' | 'retry';

/** The studio's keys, as the panel names them. */
type StudioKey = 'R' | 'Space' | 'K' | 'Esc';

/** One button: what it does, what it says, and its key. */
export interface Control {
  readonly act: Act;
  readonly label: string;
  readonly key: StudioKey;
}

const control = (act: Act, name: string, key: StudioKey): Control => ({
  act,
  label: `${name} (${key})`,
  key,
});

const ARM = control('arm', 'Record', 'R');
const CANCEL = control('cancel', 'Cancel', 'Esc');

/** What the owner can do in `state`, in the order the panel shows it. */
export const controlsOf = (state: RecorderState): ReadonlyArray<Control> =>
  Match.value(state).pipe(
    Match.tagsExhaustive({
      Idle: () => [ARM],
      CountIn: () => [CANCEL],
      Recording: () => [control('stop', 'Stop', 'Space'), CANCEL],
      Review: () => [
        control('submit', 'Submit', 'K'),
        control('arm', 'Retake', 'R'),
        control('discard', 'Discard', 'Esc'),
      ],
      Importing: () => [],
      Checking: () => [],
      Failed: (s) => [
        ...Option.match(mismatchAttempt(s.refusal), {
          onNone: () => [],
          onSome: () => [control('acceptAnyway', 'Accept anyway', 'K')],
        }),
        ARM,
        control('retry', 'Back', 'Esc'),
      ],
    }),
  );

/** What a studio key does now: a control, a step through the beats, or nothing yet. */
type KeyAct =
  | { readonly _tag: 'Act'; readonly act: Act }
  | { readonly _tag: 'Beat'; readonly step: 1 | -1 }
  | { readonly _tag: 'None' };

/** The studio's key a `KeyboardEvent.key` is, if it is one. */
const PRESSED = new Map<string, StudioKey>([
  ['r', 'R'],
  ['R', 'R'],
  [' ', 'Space'],
  ['k', 'K'],
  ['K', 'K'],
  ['Escape', 'Esc'],
]);

const STEPS = new Map<string, 1 | -1>([
  ['ArrowRight', 1],
  ['ArrowLeft', -1],
]);

const NOTHING: KeyAct = { _tag: 'None' };

/** ←/→ move between beats only at rest or after a refusal, never mid-take. */
const steps = Predicate.or(Predicate.isTagged('Idle'), Predicate.isTagged('Failed'));

/**
 * What `key` does in `state`: none when it is not one of the studio's keys
 * (the lab's keys pass through); `None` when it is, but has nothing to do now
 * (it is still the studio's, so the lab does not take it either).
 */
export const keyOf = (state: RecorderState, key: string): Option.Option<KeyAct> =>
  Option.orElse(
    Option.map(Option.fromUndefinedOr(PRESSED.get(key)), (pressed): KeyAct =>
      Option.getOrElse(
        Option.map(
          Option.fromUndefinedOr(controlsOf(state).find((c) => c.key === pressed)),
          (c): KeyAct => ({ _tag: 'Act', act: c.act }),
        ),
        () => NOTHING,
      ),
    ),
    () =>
      Option.map(Option.fromUndefinedOr(STEPS.get(key)), (step): KeyAct =>
        Option.getOrElse(
          Option.map(Option.some(step).pipe(Option.filter(() => steps(state))), (s): KeyAct => ({
            _tag: 'Beat',
            step: s,
          })),
          () => NOTHING,
        ),
      ),
  );

/** The recorder event `act` sends, with the microphone picked for a recording. */
export const eventOf = (act: Act, device: Option.Option<string>): RecorderEvent =>
  Match.value(act).pipe(
    Match.withReturnType<RecorderEvent>(),
    Match.when('arm', () => RecorderEvent.Arm({ device })),
    Match.when('stop', () => RecorderEvent.Stop),
    Match.when('cancel', () => RecorderEvent.Cancel),
    Match.when('submit', () => RecorderEvent.Submit),
    Match.when('discard', () => RecorderEvent.Discard),
    Match.when('acceptAnyway', () => RecorderEvent.AcceptAnyway),
    Match.when('retry', () => RecorderEvent.Retry),
    Match.exhaustive,
  );

/** A word error rate as the panel prints it. */
const percent = (wer: number) => `${(wer * 100).toFixed(1)}%`;

/** A take's length as every time the studio shows: timecode. */
const seconds = (s: number) => timecode(s);

/** Within this many seconds of the take limit, the recording warns. */
const NEAR_LIMIT_S = 30;

/** The seconds kept so far, by the meter's count; 0 before any. */
const keptOf = (level: Option.Option<Level>) =>
  Option.getOrElse(
    Option.map(level, (l) => l.kept),
    () => 0,
  );

/** The seconds left before a recording stops itself; none unless recording. */
const leftOf = (state: RecorderState, level: Option.Option<Level>): Option.Option<number> =>
  Match.value(state).pipe(
    Match.tag('Recording', (s) => Option.some(s.limit - keptOf(level))),
    Match.orElse(() => Option.none()),
  );

/** Whether a recording is within NEAR_LIMIT_S of stopping itself. */
export const nearLimit = (state: RecorderState, level: Option.Option<Level>): boolean =>
  Option.exists(leftOf(state, level), (left) => left <= NEAR_LIMIT_S);

/** How the panel accepts a take heard as something else (the server's words say only what was heard). */
const ACCEPT_HINT = 'Accept anyway (K) keeps it as the take; Record (R) reads it again';

/** The status line: where the recorder stands, a take's result, or the refusal in the server's words. */
export const statusOf = (state: RecorderState, level: Option.Option<Level>): string =>
  Match.value(state).pipe(
    Match.tagsExhaustive({
      Idle: (s) =>
        Option.match(s.kept, {
          onNone: () => 'ready: R records this beat',
          onSome: (k) =>
            [
              `kept ${k.file}: heard “${k.transcript}” · ${percent(k.wer)} words differ`,
              ...Match.value(k.mix).pipe(
                Match.when('mixed', () => []),
                Match.when('failed', () => ['the mix failed; the lab log says why']),
                Match.when('unanswered', () => [
                  'the lab had not mixed it when the studio stopped waiting; reload once the lab log says mixed',
                ]),
                Match.exhaustive,
              ),
            ].join(' · '),
        }),
      CountIn: (s) => `recording in ${s.n}…`,
      Recording: (s) =>
        Option.match(
          Option.filter(leftOf(s, level), (left) => left <= NEAR_LIMIT_S),
          {
            onNone: () => `recording · ${seconds(keptOf(level))} of at most ${minutes(s.limit)}`,
            onSome: (left) =>
              `recording · ${Math.max(0, Math.ceil(left))} s left: the take stops itself at ${minutes(s.limit)}`,
          },
        ),
      Review: (s) => `review ${seconds(wavSeconds(s.wav))}: hear it, then submit`,
      Importing: (s) =>
        Match.value(s.work).pipe(
          Match.tagsExhaustive({
            Upload: () => 'importing: trimming, levelling and transcribing the take…',
            Keep: (w) => `keeping ${w.file}…`,
          }),
        ),
      Checking: () =>
        `the lab has not answered in ${minutes(STUDIO_IMPORT_WAIT_S)}: reading its attempts to see whether the take was kept…`,
      Failed: (s) =>
        [
          s.refusal.message,
          ...Option.match(mismatchAttempt(s.refusal), {
            onNone: () => [],
            onSome: () => [ACCEPT_HINT],
          }),
        ].join('\n'),
    }),
  );

/** The recording to hear before it is submitted: only while reviewing. */
export const reviewWav = (state: RecorderState): Option.Option<Uint8Array> =>
  Match.value(state).pipe(
    Match.tag('Review', (s) => Option.some(s.wav)),
    Match.orElse(() => Option.none()),
  );

/**
 * What the owner does before the page may reload (`ReloadGate`), while the
 * recorder holds a recording only this page has: one being made, one under
 * review or refused with it kept to retry, or one on its way to the lab
 * (a refusal brings it back to retry). None at rest.
 */
export const unsubmitted = (state: RecorderState): Option.Option<string> =>
  Match.value(state).pipe(
    Match.tag('CountIn', 'Recording', () => Option.some('stop the take being recorded')),
    Match.tag('Review', () => Option.some('submit or discard the take under review')),
    Match.tag('Importing', 'Checking', () => Option.some('let the take being kept land')),
    Match.tag('Failed', (s) =>
      Option.map(s.wav, () => 'go Back to the refused take and submit or discard it'),
    ),
    Match.orElse(() => Option.none()),
  );

/** How many beats stand where: `1 recorded · 2 staging · 1 stale`. */
export const beatCounts = (beats: ReadonlyArray<StudioBeat>): string =>
  (['recorded', 'staging', 'stale'] as const)
    .map((state) => `${beats.filter((b) => b.state === state).length} ${state}`)
    .join(' · ');

/** A beat's badge: its state, and why it is stale. */
export const beatBadge = (beat: StudioBeat): string =>
  Option.match(
    Option.fromUndefinedOr(beat.staleReason).pipe(Option.filter(() => beat.state === 'stale')),
    { onNone: () => beat.state, onSome: (reason) => `stale: ${reason}` },
  );

/** The beat `step` away from `id` in the list, if there is one. */
export const neighbour = (
  beats: ReadonlyArray<StudioBeat>,
  id: string,
  step: 1 | -1,
): Option.Option<string> =>
  Option.map(
    Option.fromUndefinedOr(beats[beats.findIndex((b) => b.id === id) + step]),
    (b) => b.id,
  );

/** The meter's reading: peak and RMS in dBFS, the bar's share of −60…0 dBFS, and the clip warning. */
export interface Meter {
  readonly peak: string;
  readonly rms: string;
  readonly fill: number;
  readonly clip: boolean;
}

/** The quietest level the meter reads; silence reads this. */
const FLOOR_DB = -60;

const decibels = (linear: number) => Math.max(FLOOR_DB, dbfs(linear));

const dbText = (linear: number) => `${decibels(linear).toFixed(1).replace('-', '−')} dBFS`;

/** The meter for the microphone's latest level; none while it is closed. */
export const meterOf = (level: Option.Option<Level>): Option.Option<Meter> =>
  Option.map(level, (l) => ({
    peak: dbText(l.peak),
    rms: dbText(l.rms),
    fill: Math.min(1, (decibels(l.peak) - FLOOR_DB) / -FLOOR_DB),
    clip: clipping(level),
  }));

/** One choice in the microphone picker; the empty id is the browser's default. */
export interface MicOption {
  readonly id: string;
  readonly label: string;
  readonly selected: boolean;
}

/**
 * The microphone picker: the default first, then each microphone the browser
 * lists (by its label, or its id while unnamed), the one picked selected. A
 * remembered microphone the browser does not list is shown, selected, as the
 * one picked before, and called not connected once the browser names its
 * microphones (before that it may only be unnamed): so the picker never
 * seems to be on Default while it is not, and Default can be picked again.
 */
export const micOptions = (
  devices: ReadonlyArray<MicDevice>,
  device: Option.Option<string>,
): ReadonlyArray<MicOption> => {
  const listed = devices
    .filter((d) => d.id !== '')
    .map((d) => ({
      id: d.id,
      label: d.label || d.id,
      selected: Option.contains(device, d.id),
    }));
  const named = devices.some((d) => d.id !== '');
  const gone = Option.filter(device, (id) => !devices.some((d) => d.id === id));
  return [
    { id: '', label: 'Default microphone', selected: Option.isNone(device) },
    ...listed,
    ...Option.match(gone, {
      onNone: () => [],
      onSome: (id) => [
        {
          id,
          label: ['the microphone picked before', ...['(not connected)'].filter(() => named)].join(
            ' ',
          ),
          selected: true,
        },
      ],
    }),
  ];
};

/** An attempt as its row reads: what was heard, how far off the line, how long. */
export const attemptLine = (attempt: StudioAttempt): string =>
  `“${attempt.transcript}” · ${percent(attempt.wer)} · ${seconds(attempt.duration)}`;
