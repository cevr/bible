/**
 * `sim.ts`'s commands: each parses its arguments, runs its step of the
 * drive (`drive.ts`) and prints one JSON result (`result.ts`). A step that
 * fails prints its tagged error and fails the command, so the process exits
 * non-zero.
 */
import { Clock, Console, Effect, Exit, Option, Schema } from 'effect';
import { Argument, CliError, Command, Flag } from 'effect/cli';

import {
  boot,
  doctor,
  RECORD,
  record,
  snapshot,
  down,
  fill,
  install,
  DIRECTIONS,
  log,
  open,
  type Outcome,
  type Place,
  scroll,
  serve,
  shot,
  tap,
} from './drive.ts';
import { BadArguments, HostFailed, type SimError } from './errors.ts';
import type { PlatformError } from 'effect/PlatformError';
import { Failure, Platform, Success } from './result.ts';

const encodeSuccess = Schema.encodeSync(Schema.fromJsonString(Success));
const encodeFailure = Schema.encodeSync(Schema.fromJsonString(Failure));

/** Run `step`, print its result as one JSON line, and fail on its error. */
export const report = <R>(
  command: string,
  step: Effect.Effect<Outcome, SimError | PlatformError, R>,
) =>
  Effect.gen(function* () {
    const started = yield* Clock.currentTimeMillis;
    const elapsed = Effect.map(Clock.currentTimeMillis, (now) => now - started);
    return yield* step.pipe(
      Effect.catchTag('PlatformError', (error) =>
        Effect.fail(HostFailed.make({ reason: error.message })),
      ),
      Effect.matchEffect({
        onSuccess: (done) =>
          Effect.flatMap(elapsed, (ms) =>
            Console.log(encodeSuccess({ ok: true, command, ...done, ms })),
          ),
        onFailure: (error) =>
          Effect.flatMap(elapsed, (ms) =>
            Console.log(
              encodeFailure({ ok: false, command, message: error.message, error, ms }),
            ).pipe(Effect.andThen(Effect.fail(error))),
          ),
      }),
    );
  });

const seconds = (fallback: number) =>
  Flag.Int('timeout').pipe(
    Flag.withDefault(fallback),
    Flag.withDescription('seconds to wait for readiness before failing'),
  );

const target = Argument.String('target').pipe(
  Argument.withDescription('id=<testID>, label=<accessibility label>, or a bare label'),
);

const expectFlag = Flag.String('expect').pipe(
  Flag.optional,
  Flag.withDescription('a target to wait for once the step is done'),
);

/** The commands, over the drive's place (the app's folder, the state folder, this script). */
export const simCommand = (place: Place) => {
  const state = Flag.String('state').pipe(
    Flag.withDefault(place.state),
    Flag.withDescription('the folder that keeps the drive session'),
  );
  const at = (dir: string): Place => ({ ...place, state: dir });

  const bootCommand = Command.make(
    'boot',
    {
      platform: Flag.Literals('platform', Platform.literals).pipe(
        Flag.withDefault('ios'),
        Flag.withDescription('ios: the verify-hymnal simulator; web: a headless browser'),
      ),
      port: Flag.Int('port').pipe(
        Flag.withDefault(8270),
        Flag.filter(
          (port) => port >= 8270 && port <= 8279,
          (port) => `port ${port} is outside 8270-8279`,
        ),
        Flag.withDescription('the dev server port, 8270-8279'),
      ),
      out: Flag.String('out').pipe(
        Flag.optional,
        Flag.withDescription('where logs and screenshots go (default tmp/verify-hymnal/<time>)'),
      ),
      timeout: seconds(180),
      state,
    },
    (flags) =>
      report(
        'boot',
        boot(at(flags.state), {
          platform: flags.platform,
          port: flags.port,
          out: flags.out,
          seconds: flags.timeout,
        }),
      ),
  ).pipe(Command.withDescription('Boot the simulator (or the web build) and the dev server'));

  const installCommand = Command.make(
    'install',
    {
      app: Flag.String('app').pipe(
        Flag.optional,
        Flag.withDescription('a built Hymnal.app to install instead of building this checkout'),
      ),
      prebuild: Flag.Boolean('prebuild').pipe(
        Flag.withDefault(false),
        Flag.withDescription('run one prebuild first (ios/ is stale, or its build/ was removed)'),
      ),
      expect: Flag.String('expect').pipe(
        Flag.withDefault('label=Hymns'),
        Flag.withDescription('a target that shows once the app has drawn'),
      ),
      timeout: seconds(180),
      state,
    },
    (flags) =>
      report(
        'install',
        install(at(flags.state), {
          app: flags.app,
          prebuild: flags.prebuild,
          expect: flags.expect,
          seconds: flags.timeout,
        }),
      ),
  ).pipe(Command.withDescription("Build this checkout's app, install it and launch it (iOS)"));

  const openCommand = Command.make(
    'open',
    {
      link: Argument.String('link').pipe(
        Argument.withDescription('hymnal://hymns/100, or the route /hymns/100'),
      ),
      expect: expectFlag,
      timeout: seconds(30),
      state,
    },
    (flags) => report('open', open(at(flags.state), flags.link, flags.expect, flags.timeout)),
  ).pipe(Command.withDescription('Open a screen by deep link (iOS) or route (web)'));

  const tapCommand = Command.make('tap', { target, timeout: seconds(10), state }, (flags) =>
    report('tap', tap(at(flags.state), flags.target, flags.timeout)),
  ).pipe(Command.withDescription('Tap an element by accessibility id or label'));

  const fillCommand = Command.make(
    'fill',
    {
      target,
      value: Argument.String('value').pipe(Argument.withDescription('the text to type')),
      timeout: seconds(10),
      state,
    },
    (flags) => report('fill', fill(at(flags.state), flags.target, flags.value, flags.timeout)),
  ).pipe(Command.withDescription('Type into a text field by accessibility id or label'));

  const scrollCommand = Command.make(
    'scroll',
    {
      target: Argument.String('target').pipe(
        Argument.withDescription('screen, or a target to scroll to (id=..., label=...)'),
      ),
      direction: Argument.Literals('direction', DIRECTIONS),
      timeout: seconds(10),
      state,
    },
    (flags) =>
      report('scroll', scroll(at(flags.state), flags.target, flags.direction, flags.timeout)),
  ).pipe(Command.withDescription('Scroll the screen, or until a target shows'));

  const shotCommand = Command.make(
    'shot',
    {
      name: Argument.String('name').pipe(
        Argument.optional,
        Argument.withDescription('the file name, without .png'),
      ),
      state,
    },
    (flags) => report('shot', shot(at(flags.state), flags.name)),
  ).pipe(Command.withDescription('Save a screenshot under <out>/shots'));

  const snapshotCommand = Command.make(
    'snapshot',
    {
      name: Argument.String('name').pipe(
        Argument.optional,
        Argument.withDescription('the file name, without .txt'),
      ),
      state,
    },
    (flags) => report('snapshot', snapshot(at(flags.state), flags.name)),
  ).pipe(Command.withDescription("Save the screen's accessibility tree under <out>/snapshots"));

  const recordCommand = Command.make(
    'record',
    {
      action: Argument.Literals('action', RECORD),
      name: Argument.String('name').pipe(
        Argument.optional,
        Argument.withDescription('the video file name, without its extension (start only)'),
      ),
      state,
    },
    (flags) => report('record', record(at(flags.state), flags.action, flags.name)),
  ).pipe(
    Command.withDescription('Start a video of the screen under <out>/video, or stop and save it'),
  );

  const logCommand = Command.make('log', { state }, (flags) =>
    report('log', log(at(flags.state))),
  ).pipe(Command.withDescription("Save the app's log since boot"));

  const doctorCommand = Command.make('doctor', { state }, (flags) =>
    report('doctor', doctor(at(flags.state))),
  ).pipe(Command.withDescription('Check, read only, that the booted drive is worth driving'));

  const downCommand = Command.make('down', { state }, (flags) =>
    report('down', down(at(flags.state))),
  ).pipe(Command.withDescription('Shut down what boot started'));

  const serveCommand = Command.make(
    'serve',
    { port: Flag.Int('port'), out: Flag.String('out'), state },
    (flags) => serve(at(flags.state), flags.port, flags.out),
  ).pipe(Command.withDescription('Run the dev server until stopped (boot starts it)'));

  return Command.make('sim').pipe(
    Command.withDescription('Drive the hymnal on the verify-hymnal simulator or the web'),
    Command.withSubcommands([
      bootCommand,
      installCommand,
      openCommand,
      tapCommand,
      fillCommand,
      scrollCommand,
      shotCommand,
      snapshotCommand,
      recordCommand,
      logCommand,
      doctorCommand,
      downCommand,
      serveCommand,
    ]),
  );
};

/** A parse failure (`ShowHelp` with the parser's errors), as opposed to a `--help` request. */
const badArguments = (error: unknown): error is CliError.ShowHelp =>
  CliError.isCliError(error) && error._tag === 'ShowHelp' && error.errors.length > 0;

/**
 * Run `sim <args>` so stdout holds one JSON result and nothing else. The
 * parser prints its help as it fails, so the run's console lines are held
 * until it ends: arguments that do not parse send the help to stderr and
 * print a `BadArguments` result; any other run prints its lines (a result,
 * or the help `--help` asked for) to stdout.
 */
export const runSim = (place: Place, args: ReadonlyArray<string>) =>
  Console.consoleWith((console) =>
    Effect.gen(function* () {
      const lines: Array<string> = [];
      const held: Console.Console = {
        ...console,
        log: (...parts: ReadonlyArray<unknown>) => void lines.push(parts.join(' ')),
      };
      const exit = yield* Command.runWith(simCommand(place), {
        version: '1.0.0',
        renderErrors: false,
      })(args).pipe(
        Effect.catchIf(badArguments, (help) =>
          Effect.fail(
            BadArguments.make({
              command: help.commandPath.join(' '),
              problems: help.errors.map((problem) => problem.message),
            }),
          ),
        ),
        Effect.provideService(Console.Console, held),
        Effect.exit,
      );
      const bad = Option.filter(Exit.findErrorOption(exit), Schema.is(BadArguments));
      if (Option.isNone(bad)) for (const line of lines) console.log(line);
      else {
        const error = bad.value;
        for (const line of lines) console.error(line);
        console.log(
          encodeFailure({
            ok: false,
            command: error.command,
            message: error.message,
            error,
            ms: 0,
          }),
        );
      }
      return yield* exit;
    }),
  );
