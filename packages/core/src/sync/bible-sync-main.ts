#!/usr/bin/env bun

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect } from 'effect';
import { Command, Flag } from 'effect/unstable/cli';

import { defaultBibleSyncPaths, syncBible } from './bible-sync.js';

const force = Flag.boolean('force').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Recreate the canonical Bible database'),
);

const command = Command.make('sync-bible', { force }, ({ force }) =>
  Effect.gen(function* () {
    const paths = yield* defaultBibleSyncPaths();
    yield* syncBible(force, paths);
  }),
);

Command.run(command, { version: '1.0.0' }).pipe(
  Effect.provide(BunServices.layer),
  BunRuntime.runMain,
);
