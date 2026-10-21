/**
 * The verify helpers' commands (`.claude/skills/verify-firsttheblade`),
 * each run as a script of the app (`bun run verify:<command>`), with no
 * `.env` read (`bun --no-env-file`): every one prints one JSON line on
 * success, and a tagged error and a non-zero exit on failure.
 *
 * - `launch --root <dir> --port <p>`: the preview in a scratch root, held
 *   until it is stopped; prints its record once it answers.
 * - `stop --root <dir>`: stops that preview by its recorded PID.
 * - `doctor --root <dir>` | `--origin <url>`: is the instance worth driving.
 * - `outbox --root <dir> [--to <address>]`: the letters the preview wrote.
 * - `drive <journey>… --root <dir> --port <p> --evidence <dir> [--no-video]`:
 *   the confirm journeys on a preview of their own.
 * - `stage up|down --stage agent-<name> --root <dir>`: a throwaway stage.
 */
import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Effect, Layer, Option } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import { FetchHttpClient } from 'effect/http';

import { doctorOrigin, doctorRoot } from './doctor.ts';
import { drive, JOURNEYS } from './drive.ts';
import { launch, outboxOf, stop } from './instance.ts';
import {
  DoctorReport,
  DriveReport,
  LaunchRecord,
  OutboxReport,
  printJson,
  Refused,
  StageReport,
  StopReport,
} from './model.ts';
import { readOutbox } from './outbox.ts';
import { stage } from './stage.ts';

const root = Flag.String('root').pipe(
  Flag.withDescription("The run's scratch root, outside the checkout or under its ignored tmp/"),
);
const port = Flag.Int('port').pipe(Flag.withDescription('A free port for this run, never 8470'));

const launchCommand = Command.make('launch', { root, port }, (input) =>
  Effect.scoped(
    Effect.gen(function* () {
      const { record, exited } = yield* launch(input.root, input.port);
      yield* printJson(LaunchRecord)(record);
      yield* exited;
    }),
  ),
).pipe(Command.withDescription('Launch the preview in a scratch root and hold it until stopped'));

const stopCommand = Command.make('stop', { root }, (input) =>
  Effect.flatMap(stop(input.root), printJson(StopReport)),
).pipe(Command.withDescription("Stop a root's preview by its recorded PID"));

const doctorCommand = Command.make(
  'doctor',
  {
    root: Flag.String('root').pipe(Flag.optional),
    origin: Flag.String('origin').pipe(Flag.optional),
  },
  (input) =>
    Effect.gen(function* () {
      if (Option.isSome(input.root)) return yield* doctorRoot(input.root.value);
      if (Option.isSome(input.origin)) return yield* doctorOrigin(input.origin.value);
      return yield* Refused.make({ message: 'name --root <dir> or --origin <url>' });
    }).pipe(Effect.flatMap(printJson(DoctorReport))),
).pipe(
  Command.withDescription(
    'Check that an instance is worth driving; names the first check that fails',
  ),
);

const outboxCommand = Command.make(
  'outbox',
  { root, to: Flag.String('to').pipe(Flag.optional) },
  (input) =>
    Effect.gen(function* () {
      const outbox = outboxOf(input.root);
      const letters = yield* readOutbox(outbox);
      const shown = Option.match(input.to, {
        onNone: () => letters,
        onSome: (to) => letters.filter((letter) => letter.to === to),
      });
      yield* printJson(OutboxReport)({ outbox, letters: shown });
    }),
).pipe(Command.withDescription("The letters a root's preview wrote, with the link in each"));

const driveCommand = Command.make(
  'drive',
  {
    journeys: Argument.Literals('journey', JOURNEYS).pipe(Argument.atLeast(1)),
    root,
    port,
    evidence: Flag.String('evidence').pipe(
      Flag.withDescription('Where the proof goes: <evidence>/<journey>/'),
    ),
    noVideo: Flag.Boolean('no-video').pipe(Flag.withDefault(false)),
  },
  (input) =>
    Effect.scoped(
      drive({
        journeys: input.journeys,
        root: input.root,
        port: input.port,
        evidence: input.evidence,
        video: !input.noVideo,
      }),
    ).pipe(Effect.flatMap(printJson(DriveReport))),
).pipe(Command.withDescription('Drive the confirm journeys on a preview launched for the drive'));

const stageCommand = Command.make(
  'stage',
  {
    action: Argument.Literals('action', ['up', 'down']),
    stage: Flag.String('stage').pipe(Flag.withDescription('agent-<name>; nothing else is taken')),
    root,
  },
  (input) => Effect.flatMap(stage(input), printJson(StageReport)),
).pipe(Command.withDescription('Deploy or destroy a throwaway agent-<name> stage'));

const verify = Command.make('verify').pipe(
  Command.withSubcommands([
    launchCommand,
    stopCommand,
    doctorCommand,
    outboxCommand,
    driveCommand,
    stageCommand,
  ]),
  Command.withDescription('Launch, check and drive the First the Blade site'),
);

const platform = Layer.mergeAll(FetchHttpClient.layer, BunServices.layer);

Command.run(verify, { version: '1.0.0' }).pipe(Effect.provide(platform), BunRuntime.runMain);
