import { Command } from 'effect/unstable/cli';
import type { Schema } from 'effect';
import { Effect, Option } from 'effect';

import type { ContentTypeConfig } from './types';
import { files, folder, json } from './options';
import { ContentService } from '~/src/services/content';

export const makeListCommand = <F extends Schema.Top>(config: ContentTypeConfig<F>) =>
  Command.make('list', { json }, ({ json }) =>
    Effect.gen(function* () {
      const service = yield* ContentService;
      yield* service.list(json);
    }).pipe(Effect.provide(ContentService.make(config))),
  );

export const makeExportCommand = <F extends Schema.Top>(config: ContentTypeConfig<F>) =>
  Command.make('export', { files, folder }, (args) =>
    Effect.gen(function* () {
      const service = yield* ContentService;
      const targetFolder = Option.match(args.folder, {
        onSome: (f) => f,
        onNone: () => undefined,
      });
      yield* service.export(args.files, targetFolder);
    }).pipe(Effect.provide(ContentService.make(config))),
  );

export const makeSyncCommand = <F extends Schema.Top>(config: ContentTypeConfig<F>) =>
  Command.make('sync', { files }, (args) =>
    Effect.gen(function* () {
      const service = yield* ContentService;
      yield* service.sync(args.files);
    }).pipe(Effect.provide(ContentService.make(config))),
  );

export const makeDeleteCommand = <F extends Schema.Top>(config: ContentTypeConfig<F>) =>
  Command.make('delete', { files }, (args) =>
    Effect.gen(function* () {
      const service = yield* ContentService;
      yield* service.deleteNotes(args.files);
    }).pipe(Effect.provide(ContentService.make(config))),
  );
