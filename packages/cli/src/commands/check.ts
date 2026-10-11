/**
 * `bible check` — verify every quotation in a teaching document against the
 * corpus it claims to quote, before the document is exported. Any problem
 * exits 1; `bible export` runs the same check and refuses on a problem.
 */

import { Argument, Command, Flag } from 'effect/cli';
import { Console, Effect, FileSystem, Schema, SchemaGetter } from 'effect';

import { formatProblem, Quotations } from '../services/quotations.js';
import { CliProcess } from '../services/process.js';

const JsonString = Schema.Unknown.pipe(
  Schema.encodeTo(Schema.String, {
    decode: SchemaGetter.parseJson(),
    encode: SchemaGetter.stringifyJson({ space: 2 }),
  }),
);
const encodeJson = Schema.encodeUnknownEffect(JsonString);

const files = Argument.String('file').pipe(
  Argument.withDescription('Markdown documents to check'),
  Argument.variadic({ min: 1 }),
);
const json = Flag.Boolean('json').pipe(
  Flag.withDescription('Output JSON instead of formatted text'),
  Flag.withDefault(false),
);

export const check = Command.make('check', { files, json }, (args) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const quotations = yield* Quotations;
    const reports = yield* Effect.forEach(args.files, (file) =>
      Effect.flatMap(fs.readFileString(file), (markdown) => quotations.check(file, markdown)),
    );

    if (args.json) {
      yield* Console.log(yield* encodeJson({ files: reports }));
    } else {
      for (const report of reports) {
        for (const found of report.problems) yield* Console.log(formatProblem(found));
        yield* Console.log(
          `${report.file}: ${report.checked} quotations checked, ${report.problems.length} problems`,
        );
      }
    }

    if (reports.some((report) => report.problems.length > 0)) {
      const cliProcess = yield* CliProcess;
      return yield* cliProcess.exitFailure;
    }
  }),
).pipe(
  Command.withDescription(
    "Verify a document's Scripture and witness quotations word for word against the corpus",
  ),
);
