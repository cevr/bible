/**
 * `bun scripts/sticky.ts --udid <udid> [--app <Hymnal.app>] [--pass slow|fast|push|all] [--runs 3] --out <dir>`:
 * the home list's pinned topic row, checked in every frame of a simulator
 * recording.
 *
 * Each pass relaunches the app, scrolls past the large title, records the
 * screen (`xcrun simctl io recordVideo --codec h264`) while it drives the
 * list through agent-device, then reads every frame's column left of the
 * hymn rows' separators and judges where the pinned row's hairline sits
 * (`sticky/frames.ts`). It prints one JSON line per pass and run,
 * `{pass, run, frames, judged, missing, off, worst}`, and exits 0 only when
 * every pass of every run holds: no frame off by more than 1 pt, and at
 * least 95% of frames judged.
 *
 * - `slow`: three 360 pt drags in 1.2 s up, two down, one fling each way.
 * - `fast`: eight 560 pt drags in 400 ms to leave the top, then, recorded,
 *   six 560 pt drags in 250 ms each way, never back to the top.
 * - `push`: open a mid-list hymn and come back by the header's back button,
 *   then again by agent-device's in-app back (as `sim back` does). Its video
 *   shows a hymn page, so it goes to the trash once read.
 *
 * Run from `apps/hymnal`, on a Release build (`--app` installs one first).
 * The defaults are the iPhone 18 Pro's at the default text size: 3 px per
 * pt, list top 62 pt, topic row 36 pt. The app is never played: no pass
 * presses Play.
 */
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Duration, Effect, FileSystem, Option, Path, Schema } from 'effect';
import { Command, Flag } from 'effect/cli';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import { attempt, succeed } from './sim/tools.ts';
import { holds, judge, type Layout, linesIn, summarize } from './sticky/frames.ts';

const APP_ID = 'im.cvr.hymnal';
const SESSION = 'sticky-check';
const PASSES = ['slow', 'fast', 'push'] as const;
type Pass = (typeof PASSES)[number];

/** A pass's printed line. */
const Line = Schema.Struct({
  pass: Schema.Literals(PASSES),
  run: Schema.Int,
  frames: Schema.Int,
  judged: Schema.Int,
  missing: Schema.Int,
  off: Schema.Int,
  worst: Schema.Finite,
});

/** A pass's record: its line, the layout and each frame's verdict. */
const Record = Schema.Struct({
  ...Line.fields,
  layout: Schema.Struct({ scale: Schema.Finite, top: Schema.Finite, topic: Schema.Finite }),
  verdicts: Schema.Array(
    Schema.Union([
      Schema.TaggedStruct('Missing', {}),
      Schema.TaggedStruct('Seen', {
        pinned: Schema.Finite,
        pushed: Schema.Boolean,
        expected: Schema.Finite,
        deviation: Schema.Finite,
      }),
    ]),
  ),
});

const encodeLine = Schema.encodeSync(Schema.fromJsonString(Line));
const encodeRecord = Schema.encodeSync(Schema.fromJsonString(Record));

/** A pass did not hold. */
class StickyFailed extends Schema.TaggedError<StickyFailed>()('StickyFailed', {}) {
  override get message() {
    return 'a pass has a frame off its place, or too few frames judged';
  }
}

/** The column the check reads, in points: left of the hymn rows' separators. */
const COLUMN = { x: 4, width: 8, band: 260 };

const short = Duration.seconds(30);

const device = (args: ReadonlyArray<string>) =>
  succeed('agent-device', [...args, '--session', SESSION], short);

const pan = (x: number, y: number, dx: number, dy: number, ms: number) =>
  device(['gesture', 'pan', `${x}`, `${y}`, `${dx}`, `${dy}`, `${ms}`]);

const pause = (ms: number) => Effect.sleep(Duration.millis(ms));

/** Relaunch the app on the home list, and scroll it so a topic row is pinned. */
const launch = Effect.fn('Sticky.launch')(function* (udid: string, pass: Pass) {
  yield* attempt('xcrun', ['simctl', 'terminate', udid, APP_ID], short);
  yield* device(['open', APP_ID, '--platform', 'ios', '--udid', udid, '--relaunch']);
  yield* pause(3000);
  if (pass === 'fast') {
    for (let i = 0; i < 8; i++) yield* pan(200, 760, 0, -560, 400);
  } else yield* pan(200, 700, 0, -500, 600);
  yield* pause(1500);
});

/** The recorded part of each pass: the gestures a reader makes. */
const gestures = Effect.fn('Sticky.gestures')(function* (pass: Pass) {
  if (pass === 'slow') {
    for (let i = 0; i < 3; i++) yield* pan(200, 700, 0, -360, 1200);
    yield* pause(500);
    for (let i = 0; i < 2; i++) yield* pan(200, 300, 0, 360, 1200);
    yield* pause(500);
    yield* device(['gesture', 'fling', 'up', '200', '650', '420']);
    yield* pause(2000);
    yield* device(['gesture', 'fling', 'down', '200', '300', '300']);
    yield* pause(2000);
  }
  if (pass === 'fast') {
    for (let i = 0; i < 6; i++) yield* pan(200, 760, 0, -560, 250);
    for (let i = 0; i < 6; i++) yield* pan(200, 200, 0, 560, 250);
  }
  if (pass === 'push') {
    // The row at y = 520 is mid-list; (30, 80) is the header's back button.
    yield* device(['press', '200', '520']);
    yield* pause(2000);
    yield* device(['press', '30', '80']);
    yield* pause(2000);
    yield* device(['press', '200', '520']);
    yield* pause(2000);
    yield* device(['back', '--in-app']);
    yield* pause(2000);
  }
  yield* pause(1000);
});

/** Record the simulator's screen into `video` while `drive` runs; the recorder stops on SIGINT, as its own Ctrl-C does. */
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
      yield* pause(1500);
      const result = yield* drive;
      yield* recorder.kill({ killSignal: 'SIGINT', forceKillAfter: '10 seconds' });
      yield* recorder.exitCode;
      return result;
    }),
  );

/** Every frame's grey column, read through ffmpeg into a raw file beside the video. */
const columns = Effect.fn('Sticky.columns')(function* (video: string, layout: Layout) {
  const fs = yield* FileSystem.FileSystem;
  const x = Math.round(COLUMN.x * layout.scale);
  const width = Math.round(COLUMN.width * layout.scale);
  const height = Math.round(COLUMN.band * layout.scale);
  const raw = `${video}.gray`;
  yield* succeed(
    'ffmpeg',
    [
      '-v',
      'error',
      '-y',
      '-i',
      video,
      '-vf',
      `crop=${width}:${height}:${x}:0,format=gray`,
      '-fps_mode',
      'passthrough',
      '-f',
      'rawvideo',
      raw,
    ],
    Duration.minutes(5),
  );
  const bytes = yield* fs.readFile(raw);
  yield* fs.remove(raw);
  const size = width * height;
  return Array.from({ length: Math.floor(bytes.length / size) }, (_, frame) =>
    Array.from({ length: height }, (_, y) => {
      let sum = 0;
      for (let c = 0; c < width; c++) sum += bytes[frame * size + y * width + c] ?? 0;
      return sum / width;
    }),
  );
});

/** One pass of one run: drive, record, judge; its summary line, and each frame's verdict in `<pass>-<run>.json`. */
const check = Effect.fn('Sticky.check')(function* (
  udid: string,
  pass: Pass,
  run: number,
  out: string,
  layout: Layout,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const video = path.join(out, `${pass}-${run}.mp4`);
  yield* launch(udid, pass);
  yield* recording(udid, video, gestures(pass));
  yield* Effect.ignore(device(['close']));
  const verdicts = (yield* columns(video, layout)).map((rows) =>
    judge(linesIn(rows, layout.scale), layout),
  );
  const summary = summarize(verdicts);
  yield* fs.writeFileString(
    path.join(out, `${pass}-${run}.json`),
    encodeRecord({ pass, run, layout, ...summary, verdicts }),
  );
  if (pass === 'push') yield* succeed('trash', [video], short);
  yield* Console.log(encodeLine({ pass, run, ...summary }));
  return holds(summary);
});

const sticky = Command.make(
  'sticky',
  {
    udid: Flag.String('udid').pipe(Flag.withDescription('the simulator to drive')),
    app: Flag.String('app').pipe(
      Flag.optional,
      Flag.withDescription('a Release Hymnal.app to install first'),
    ),
    pass: Flag.Literals('pass', [...PASSES, 'all']).pipe(Flag.withDefault('all')),
    runs: Flag.Int('runs').pipe(Flag.withDefault(1)),
    out: Flag.String('out').pipe(Flag.withDescription('where the videos and frame verdicts go')),
    scale: Flag.Int('scale').pipe(Flag.withDefault(3)),
    top: Flag.Finite('top').pipe(
      Flag.withDefault(62),
      Flag.withDescription("the list's top in pt: the safe-area inset"),
    ),
    topic: Flag.Finite('topic').pipe(
      Flag.withDefault(36),
      Flag.withDescription("a topic row's height in pt: ceil(20 × fontScale) + 16"),
    ),
  },
  (flags) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.makeDirectory(flags.out, { recursive: true });
      if (Option.isSome(flags.app))
        yield* succeed(
          'xcrun',
          ['simctl', 'install', flags.udid, flags.app.value],
          Duration.minutes(2),
        );
      const layout: Layout = { scale: flags.scale, top: flags.top, topic: flags.topic };
      const passes = PASSES.filter((pass) => flags.pass === 'all' || flags.pass === pass);
      let held = true;
      for (let run = 1; run <= flags.runs; run++)
        for (const pass of passes)
          held = (yield* check(flags.udid, pass, run, flags.out, layout)) && held;
      if (!held) return yield* StickyFailed.make({});
    }).pipe(Effect.ensuring(Effect.ignore(device(['close'])))),
);

Command.run(sticky, { version: '1.0.0' }).pipe(Effect.provide(BunServices.layer), (program) =>
  BunRuntime.runMain(program),
);
