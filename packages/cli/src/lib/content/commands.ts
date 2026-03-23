// @effect-diagnostics strictEffectProvide:off
import { Command } from 'effect/unstable/cli';
import type { Schema } from 'effect';
import { Effect, Option } from 'effect';

import type { ContentTypeConfig } from './types';
import { file, files, folder, instructions, json } from './options';
import { AI } from '~/src/services/ai';
import { ContentService } from '~/src/services/content';
import { requiredModel } from '~/src/services/model';

export const makeListCommand = <F extends Schema.Top>(config: ContentTypeConfig<F>) =>
  Command.make('list', { json }, ({ json }) =>
    Effect.gen(function* () {
      const service = yield* ContentService;
      yield* service.list(json);
    }).pipe(Effect.provide(ContentService.make(config))),
  );

export const makeReviseCommand = <F extends Schema.Top>(config: ContentTypeConfig<F>) =>
  Command.make('revise', { file, instructions, model: requiredModel }, (args) =>
    Effect.gen(function* () {
      const service = yield* ContentService;
      yield* service.revise(args.file, args.instructions);
    }).pipe(Effect.provide(ContentService.make(config))),
  ).pipe(Command.provide((args) => AI.fromModel(args.model)));

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
