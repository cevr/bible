/**
 * `bun scripts/follow.ts --udid <udid> --hymn <n> --out <dir> [--every 500] [--session verify-hymnal]`:
 * one Play tap on a hymn page, and the sung line followed to the end.
 *
 * Run from `apps/hymnal`, on a booted simulator whose app shows hymn `<n>`'s
 * page with sound off (`sim open hymns/<n>`, then `sim tap label=Sound`
 * until the page reads `Sound off`): it refuses to press Play with sound
 * on. It presses `Play hymn <n>` once and touches nothing else. It records
 * the screen (`<out>/follow-<n>.mp4`) and reads the accessibility tree
 * (`agent-device snapshot --json`) about every `--every` ms until the
 * player ends, or until the hymn's timeline has run a minute over. Each
 * snapshot is reduced to the lines' selected states and frames and the
 * scroll's frame (`follow/samples.ts`): no words are kept. It writes them
 * with the verdict to `<out>/follow-<n>.json`, prints the verdict as one
 * JSON line, and exits 0 only when it holds.
 */
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import {
  Array as Arr,
  Clock,
  Console,
  Duration,
  Effect,
  FileSystem,
  Option,
  Path,
  Schema,
} from 'effect';
import { Command, Flag } from 'effect/cli';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import { timelineOf } from '../src/follow/timeline.ts';
import { readTiming } from '../vite/timing.ts';
import { judge, type Sample, sampleOf } from './follow/samples.ts';
import { succeed } from './sim/tools.ts';

const RectSchema = Schema.Struct({
  x: Schema.Finite,
  y: Schema.Finite,
  width: Schema.Finite,
  height: Schema.Finite,
});

/** The part of `agent-device snapshot --json` the check reads. */
const Snapshot = Schema.Struct({
  data: Schema.Struct({
    nodes: Schema.Array(
      Schema.Struct({
        identifier: Schema.optional(Schema.String),
        label: Schema.optional(Schema.String),
        selected: Schema.optional(Schema.Boolean),
        rect: Schema.optional(RectSchema),
      }),
    ),
  }),
});

const decodeSnapshot = Schema.decodeUnknownEffect(Schema.fromJsonString(Snapshot));

/** The printed verdict. */
const Verdict = Schema.Struct({
  hymn: Schema.Int,
  samples: Schema.Int,
  lines: Schema.Int,
  seen: Schema.Int,
  missed: Schema.Array(Schema.Int),
  backwards: Schema.Int,
  last: Schema.Boolean,
  outside: Schema.Int,
  doubled: Schema.Int,
  mismatched: Schema.Int,
  ended: Schema.Boolean,
  touches: Schema.Int,
  holds: Schema.Boolean,
});

/** The run's record: the verdict and every sample. */
const Record = Schema.Struct({
  verdict: Verdict,
  samples: Schema.Array(
    Schema.Struct({
      at: Schema.Finite,
      lines: Schema.Array(Schema.Struct({ selected: Schema.Boolean, rect: RectSchema })),
      scroll: Schema.Union([RectSchema, Schema.Literal(false)]),
      ended: Schema.Boolean,
    }),
  ),
});

const encodeVerdict = Schema.encodeSync(Schema.fromJsonString(Verdict));
const encodeRecord = Schema.encodeSync(Schema.fromJsonString(Record));

/** The run did not hold, or could not start. */
class FollowFailed extends Schema.TaggedError<FollowFailed>()('FollowFailed', {
  reason: Schema.String,
}) {
  override get message() {
    return this.reason;
  }
}

const short = Duration.seconds(30);

/** How long past the timeline's end the check waits for the player to end. */
const OVER = Duration.minutes(1);

const quoted = (value: string) => `"${value.replaceAll('"', '\\"')}"`;

/**
 * The nodes of one snapshot, read without activating the app. `--raw` keeps
 * the lines scrolled out of view, which the presented tree drops
 * (`visibility.reasons` names `scroll-hidden-below`): the judge indexes the
 * lines by their order, so it needs every one.
 */
const nodesNow = Effect.fn('Follow.nodesNow')(function* (session: string) {
  const output = yield* succeed(
    'agent-device',
    ['snapshot', '--json', '--raw', '--observe-only', '--force-full', '--session', session],
    short,
  );
  const snapshot = yield* decodeSnapshot(output).pipe(
    Effect.mapError(() => FollowFailed.make({ reason: 'a snapshot did not decode' })),
  );
  return snapshot.data.nodes;
});

/** Record the simulator's screen into `video` while `drive` runs; the recorder stops on SIGINT. */
const recording = <A, E, R>(udid: string, video: string, drive: Effect.Effect<A, E, R>) =>
  Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const recorder = yield* spawner.spawn(
        ChildProcess.make(
          'xcrun',
          ['simctl', 'io', udid, 'recordVideo', '--codec', 'h264', '--force', video],
          { detached: false, forceKillAfter: '10 seconds' },
        ),
      );
      yield* Effect.sleep(Duration.millis(1500));
      const result = yield* drive;
      yield* recorder.kill({ killSignal: 'SIGINT', forceKillAfter: '10 seconds' });
      yield* recorder.exitCode;
      return result;
    }),
  );

/** Press Play once, then sample until the player ends or `limit` ms pass. */
const play = Effect.fn('Follow.play')(function* (
  session: string,
  hymn: number,
  every: number,
  limit: number,
) {
  yield* succeed(
    'agent-device',
    ['press', `label=${quoted(`Play hymn ${hymn}`)}`, '--session', session],
    short,
  );
  const start = yield* Clock.currentTimeMillis;
  const samples: Array<Sample> = [];
  let ended = false;
  let at = 0;
  while (!ended && at < limit) {
    const nodes = yield* nodesNow(session);
    at = (yield* Clock.currentTimeMillis) - start;
    const sample = sampleOf(nodes, hymn, at);
    samples.push(sample);
    ended = sample.ended;
    const spent = (yield* Clock.currentTimeMillis) - start - at;
    yield* Effect.sleep(Duration.millis(Math.max(0, every - spent)));
  }
  return samples;
});

const follow = Command.make(
  'follow',
  {
    udid: Flag.String('udid').pipe(Flag.withDescription('the booted simulator')),
    hymn: Flag.Int('hymn').pipe(Flag.withDescription('the hymn whose page is open')),
    out: Flag.String('out').pipe(Flag.withDescription('where the video and the samples go')),
    every: Flag.Int('every').pipe(
      Flag.withDefault(500),
      Flag.withDescription('ms between snapshots'),
    ),
    session: Flag.String('session').pipe(
      Flag.withDefault('verify-hymnal'),
      Flag.withDescription("agent-device's session, the sim helper's by default"),
    ),
  },
  (flags) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      yield* fs.makeDirectory(flags.out, { recursive: true });
      const timeline = yield* Arr.findFirst(readTiming(), ([number]) => number === flags.hymn).pipe(
        Option.flatMap(([, encoded]) => timelineOf(encoded)),
        Effect.fromOption,
        Effect.mapError(() => FollowFailed.make({ reason: `hymn ${flags.hymn} has no timeline` })),
      );
      const before = yield* nodesNow(flags.session);
      if (!before.some((node) => node.label === `Play hymn ${flags.hymn}`))
        return yield* FollowFailed.make({ reason: `the page shows no Play hymn ${flags.hymn}` });
      if (!before.some((node) => node.label === 'Sound off'))
        return yield* FollowFailed.make({ reason: 'sound is not off: Play is not pressed' });
      const limit = timeline.end - timeline.first + Duration.toMillis(OVER);
      const samples = yield* recording(
        flags.udid,
        path.join(flags.out, `follow-${flags.hymn}.mp4`),
        play(flags.session, flags.hymn, flags.every, limit),
      );
      const lengths = timeline.lines.map((line) => line.until - line.start);
      const verdict = judge(flags.hymn, lengths, samples, 1);
      yield* fs.writeFileString(
        path.join(flags.out, `follow-${flags.hymn}.json`),
        encodeRecord({ verdict, samples }),
      );
      yield* Console.log(encodeVerdict(verdict));
      if (!verdict.holds) return yield* FollowFailed.make({ reason: 'the follow did not hold' });
    }),
);

Command.run(follow, { version: '1.0.0' }).pipe(Effect.provide(BunServices.layer), (program) =>
  BunRuntime.runMain(program),
);
