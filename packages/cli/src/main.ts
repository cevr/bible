/**
 * Bible Tools CLI Entry Point
 *
 * The Effect command graph owns the non-interactive command surface.
 */

import { Command } from 'effect/unstable/cli';
import { BunServices, BunRuntime } from '@effect/platform-bun';
import { Effect, Layer } from 'effect';

import { rootCommand } from './commands/root.js';
import { printSummary, trace, traceEffect } from './instrumentation/trace.js';
import { AppleScriptLive } from './services/apple-script.js';
import { ChimeLive } from './services/chime.js';
import { CliLoggerLive } from './services/logger.js';

const cli = Command.run(rootCommand, {
  version: 'v1.0.0',
});

const AppleScriptLayer = AppleScriptLive.pipe(Layer.provide(BunServices.layer));
const ChimeLayer = ChimeLive.pipe(Layer.provide(BunServices.layer));
const ServicesLayer = Layer.mergeAll(
  AppleScriptLayer,
  ChimeLayer,
  CliLoggerLive,
  BunServices.layer,
);

Effect.gen(function* () {
  yield* trace('process start');
  yield* trace('CLI command imports complete');
  yield* trace('starting Effect execution');
  yield* traceEffect('Command.run', cli);
  yield* trace('Effect execution complete');
}).pipe(
  Effect.provide(ServicesLayer),
  Effect.ensuring(printSummary.pipe(Effect.provide(ServicesLayer))),
  BunRuntime.runMain,
);
