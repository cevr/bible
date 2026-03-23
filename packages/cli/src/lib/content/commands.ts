// @effect-diagnostics strictEffectProvide:off
import { Command } from '@effect/cli';
import type { Schema } from 'effect';
import { Effect, Option } from 'effect';

import type { ContentTypeConfig } from './types';
import { file, files, folder, instructions, json } from './options';
import { AI } from '~/src/services/ai';
import { ContentService } from '~/src/services/content';
import { requiredModel } from '~/src/services/model';

export const makeListCommand = <F extends Schema.Schema.AnyNoContext>(
  config: ContentTypeConfig<F>,
) =>
  Command.make('list', { json }, ({ json }) =>
    ContentService.pipe(
      Effect.flatMap((service) => service.list(json)),
      Effect.provide(ContentService.make(config)),
    ),
  );

export const makeReviseCommand = <F extends Schema.Schema.AnyNoContext>(
  config: ContentTypeConfig<F>,
) =>
  Command.make('revise', { file, instructions, model: requiredModel }, (args) =>
    ContentService.pipe(
      Effect.flatMap((service) => service.revise(args.file, args.instructions)),
      Effect.provide(ContentService.make(config)),
    ),
  ).pipe(Command.provide((args) => AI.fromModel(args.model)));

export const makeExportCommand = <F extends Schema.Schema.AnyNoContext>(
  config: ContentTypeConfig<F>,
) =>
  Command.make('export', { files, folder }, (args) =>
    ContentService.pipe(
      Effect.flatMap((service) => {
        const targetFolder = Option.match(args.folder, {
          onSome: (f) => f,
          onNone: () => undefined,
        });
        return service.export(args.files, targetFolder);
      }),
      Effect.provide(ContentService.make(config)),
    ),
  );

export const makeSyncCommand = <F extends Schema.Schema.AnyNoContext>(
  config: ContentTypeConfig<F>,
) =>
  Command.make('sync', { files }, (args) =>
    ContentService.pipe(
      Effect.flatMap((service) => service.sync(args.files)),
      Effect.provide(ContentService.make(config)),
    ),
  );

export const makeDeleteCommand = <F extends Schema.Schema.AnyNoContext>(
  config: ContentTypeConfig<F>,
) =>
  Command.make('delete', { files }, (args) =>
    ContentService.pipe(
      Effect.flatMap((service) => service.deleteNotes(args.files)),
      Effect.provide(ContentService.make(config)),
    ),
  );
