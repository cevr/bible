/**
 * `bible egw report`: the weekly corpus sync's report, read in the terminal.
 *
 * The sync on Cloudflare keeps each run's report as Markdown and serves it at
 * `egw.cvr.im/sync/<name>` (apps/egw-search). This fetches the `.md` and
 * renders it with Bun's Markdown renderer; `--web` opens the page instead.
 */

import { Console, Effect, Schema } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import { HttpClient, HttpClientResponse } from 'effect/http';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

const REPORTS = 'https://egw.cvr.im/sync';

class ReportError extends Schema.TaggedError<ReportError>()('ReportError', {
  message: Schema.String,
  cause: Schema.Unknown,
}) {}

const name = Argument.String('name').pipe(
  Argument.withDescription('The report, by name (20261018T090012Z); the newest when left out'),
  Argument.withDefault('latest'),
);
const web = Flag.Boolean('web').pipe(
  Flag.withDescription('Open the report in the browser'),
  Flag.withDefault(false),
);

const fetchReport = (report: string) =>
  HttpClient.get(`${REPORTS}/${encodeURIComponent(report)}.md`).pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.flatMap((response) => response.text),
    Effect.mapError((cause) =>
      ReportError.make({ message: `No sync report "${report}" at ${REPORTS}`, cause }),
    ),
  );

const render = (markdown: string) =>
  Effect.try({
    try: () => Bun.markdown.ansi(markdown),
    catch: (cause) => ReportError.make({ message: 'The report did not render', cause }),
  });

const openPage = (report: string) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const url = `${REPORTS}/${encodeURIComponent(report)}`;
    yield* spawner
      .string(ChildProcess.make('open', [url]))
      .pipe(
        Effect.mapError((cause) => ReportError.make({ message: `Could not open ${url}`, cause })),
      );
    yield* Console.log(url);
  });

export const egwReport = Command.make('report', { name, web }, (args) =>
  Effect.gen(function* () {
    if (args.web) return yield* openPage(args.name);
    yield* Console.log(yield* render(yield* fetchReport(args.name)));
  }),
).pipe(Command.withDescription("Read the weekly corpus sync's report"));
