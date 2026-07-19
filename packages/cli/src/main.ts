/**
 * Bible Tools CLI Entry Point
 *
 * The Effect command graph owns the non-interactive command surface.
 */

import { Command } from 'effect/unstable/cli';
import { BunServices, BunRuntime } from '@effect/platform-bun';
import { Effect, Layer } from 'effect';

import { rootCommand } from './commands/root.js';
import { printSummary, trace, traceSync } from './instrumentation/trace.js';
import { AppleScriptLive } from './services/apple-script.js';
import { ChimeLive } from './services/chime.js';
import { CliLoggerLive } from './services/logger.js';

trace('process start');

trace('CLI command imports complete');

const cli = traceSync('Command.run', () =>
  Command.run(rootCommand, {
    version: 'v1.0.0',
  }),
);

const ServicesLayer = Layer.mergeAll(AppleScriptLive, ChimeLive, CliLoggerLive, BunServices.layer);

trace('starting Effect execution');

cli.pipe(
  Effect.tap(() => Effect.sync(() => trace('Effect execution complete'))),
  Effect.provide(ServicesLayer),
  Effect.ensuring(Effect.sync(() => printSummary())),
  BunRuntime.runMain,
);
