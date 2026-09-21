import { syncEgwCorpus, type EgwSyncProgress } from '@bible/core/corpus-supply';
import { Console, Effect } from 'effect';
import { Command, Flag } from 'effect/unstable/cli';

import { CliProcess } from '../../services/process.js';
import { encodeJson } from './format.js';
import { FullLayer } from './layers.js';

const syncLang = Flag.String('lang').pipe(
  Flag.withDescription('Language code (default: en)'),
  Flag.withDefault('en'),
);
const syncConcurrency = Flag.Int('concurrency').pipe(
  Flag.withAlias('c'),
  Flag.withDescription('Concurrent book downloads (default: 2)'),
  Flag.withDefault(2),
);
const syncRefresh = Flag.Boolean('refresh').pipe(
  Flag.withDescription('Download every remote book again'),
  Flag.withDefault(false),
);
const syncJson = Flag.Boolean('json').pipe(
  Flag.withDescription('Output the final report as JSON'),
  Flag.withDefault(false),
);

const progressLine = (progress: EgwSyncProgress): string => {
  let marker = 'failed';
  if (progress.status === 'installed') marker = 'stored';
  return `[${String(progress.completed)}/${String(progress.total)}] ${marker} ${progress.code} (id ${String(progress.id)})`;
};

export const egwSync = Command.make(
  'sync',
  {
    lang: syncLang,
    concurrency: syncConcurrency,
    refresh: syncRefresh,
    json: syncJson,
  },
  (args) =>
    Effect.gen(function* () {
      const report = yield* syncEgwCorpus({
        lang: args.lang,
        concurrency: args.concurrency,
        refresh: args.refresh,
        onProgress: (progress) => Console.error(progressLine(progress)),
      });

      if (args.json) {
        yield* Console.log(yield* encodeJson(report));
      } else {
        yield* Console.log(`Remote books: ${String(report.remote)}`);
        yield* Console.log(`Present before: ${String(report.installedBefore)}`);
        yield* Console.log(`Attempted: ${String(report.attempted)}`);
        yield* Console.log(`Installed: ${String(report.installed)}`);
        yield* Console.log(`Present now: ${String(report.present)}`);
        yield* Console.log(`Missing: ${String(report.missing.length)}`);
        yield* Console.log(`Local-only books kept: ${String(report.localOnly)}`);
        const expected = report.failures.filter((failure) => failure.expected);
        if (expected.length > 0) {
          yield* Console.log(
            `Withheld by the library (expected): ${String(expected.length)} — ${expected
              .map((failure) => failure.code)
              .join(', ')}`,
          );
        }
        for (const failure of report.failures) {
          if (failure.expected) continue;
          yield* Console.error(
            `Failed ${failure.code} (id ${String(failure.id)}): ${failure.error}`,
          );
        }
      }

      // `missing` excludes the books the library withholds, so a run whose only
      // failures are the known-unavailable ones now exits 0. Before that
      // exclusion this command could never succeed, which made the exit code
      // useless to a scheduler.
      if (report.missing.length > 0) {
        const cliProcess = yield* CliProcess;
        return yield* cliProcess.exitFailure;
      }
    }),
).pipe(
  Command.withDescription('Mirror the remote EGW catalog into the local corpus'),
  Command.provide(() => FullLayer),
);
