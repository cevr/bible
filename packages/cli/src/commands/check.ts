/**
 * `bible check` — verify every quotation in a teaching document against the
 * corpus it claims to quote, before the document is exported.
 *
 * Scripture bullets are compared with the KJV `bible verse` returns; witness
 * lines with the paragraph their refcode cites, through the same corpus-wide
 * lookup as `bible egw lookup` (books, periodicals, letters). A witness must
 * also be one unspliced clause of at most 30 words. Any problem exits 1.
 */

import { BunServices } from '@effect/platform-bun';
import { parseBibleQuery } from '@bible/core/bible';
import { BibleService } from '@bible/core/bible/service';
import * as BibleDbBun from '@bible/core/bible-db/bun';
import { nodesToText } from '@bible/core/egw';
import { WritingsService } from '@bible/core/writings/service';
import { Argument, Command, Flag } from 'effect/cli';
import { Console, Effect, FileSystem, Layer, Option, Schema, SchemaGetter } from 'effect';

import { versesForBibleQuery } from '~/src/lib/bible-query';
import {
  citationsIn,
  isSpliced,
  quotationAppearsIn,
  quotedWordCount,
  WITNESS_WORD_LIMIT,
  type Citation,
} from '~/src/lib/quote-check';
import { ServiceLayer as WritingsLayer } from './egw/layers.js';
import { CliProcess } from '../services/process.js';

type ProblemKind =
  | 'verse-unresolved'
  | 'verse-mismatch'
  | 'witness-unresolved'
  | 'witness-mismatch'
  | 'witness-spliced'
  | 'witness-too-long';

interface Problem {
  readonly file: string;
  readonly line: number;
  readonly kind: ProblemKind;
  readonly detail: string;
}

const JsonString = Schema.Unknown.pipe(
  Schema.encodeTo(Schema.String, {
    decode: SchemaGetter.parseJson(),
    encode: SchemaGetter.stringifyJson({ space: 2 }),
  }),
);
const encodeJson = Schema.encodeUnknownEffect(JsonString);

const preview = (quote: string) => {
  if (quote.length <= 70) return `"${quote}"`;
  return `"${quote.slice(0, 70)}…"`;
};

const versesFor = (reference: string) =>
  Effect.gen(function* () {
    const parsed = parseBibleQuery(reference);
    if (parsed._tag === 'search') return [];
    return yield* versesForBibleQuery(parsed).pipe(Effect.orElseSucceed(() => []));
  });

/** The KJV text a Scripture bullet cites, or none when the reference names no
 *  verse. A one-chapter book is cited `Jude 14`; the parser wants `Jude 1:14`. */
const scriptureText = (reference: string) =>
  Effect.gen(function* () {
    let verses = yield* versesFor(reference);
    const oneChapter = reference.match(/^(.+?)\s+(\d+(?:-\d+)?)$/);
    if (verses.length === 0 && oneChapter?.[1] && oneChapter[2]) {
      verses = yield* versesFor(`${oneChapter[1]} 1:${oneChapter[2]}`);
    }
    if (verses.length === 0) return Option.none<string>();
    return Option.some(verses.map((verse) => verse.text).join(' '));
  });

/** The text a witness marker cites: the first of its candidate refcodes that
 *  any paragraph in the corpus is cited as. */
const witnessText = (refcodes: readonly string[]) =>
  Effect.gen(function* () {
    const writings = yield* WritingsService;
    for (const refcode of refcodes) {
      const matches = yield* writings.paragraphsByRefcode(refcode);
      if (matches.length > 0) {
        return Option.some({
          refcode,
          text: matches.map((match) => nodesToText(match.paragraph.nodes)).join(' '),
        });
      }
    }
    return Option.none<{ readonly refcode: string; readonly text: string }>();
  });

const checkCitation = (file: string, citation: Citation) =>
  Effect.gen(function* () {
    const problem = (kind: ProblemKind, detail: string): Problem => ({
      file,
      line: citation.line,
      kind,
      detail,
    });

    if (citation._tag === 'scripture') {
      const text = yield* scriptureText(citation.reference);
      if (Option.isNone(text)) return [problem('verse-unresolved', citation.reference)];
      if (!quotationAppearsIn(text.value, citation.quote)) {
        return [problem('verse-mismatch', `${citation.reference}: ${preview(citation.quote)}`)];
      }
      return [];
    }

    const problems: Problem[] = [];
    const [named = ''] = citation.refcodes.toReversed();
    if (isSpliced(citation.quote)) problems.push(problem('witness-spliced', named));
    const words = quotedWordCount(citation.quote);
    if (words > WITNESS_WORD_LIMIT) {
      problems.push(problem('witness-too-long', `${named}: ${words} words`));
    }
    const source = yield* witnessText(citation.refcodes);
    if (Option.isNone(source)) {
      problems.push(
        problem('witness-unresolved', `${citation.kind} ${citation.refcodes[0] ?? ''}`),
      );
    } else if (!quotationAppearsIn(source.value.text, citation.quote)) {
      problems.push(
        problem('witness-mismatch', `${source.value.refcode}: ${preview(citation.quote)}`),
      );
    }
    return problems;
  });

const files = Argument.String('file').pipe(
  Argument.withDescription('Markdown documents to check'),
  Argument.variadic({ min: 1 }),
);
const json = Flag.Boolean('json').pipe(
  Flag.withDescription('Output JSON instead of formatted text'),
  Flag.withDefault(false),
);

const CheckLive = Layer.mergeAll(
  WritingsLayer,
  BibleService.Live.pipe(Layer.provide(BibleDbBun.Default), Layer.provide(BunServices.layer)),
  BunServices.layer,
);

export const check = Command.make('check', { files, json }, (args) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const reports = yield* Effect.forEach(args.files, (file) =>
      Effect.gen(function* () {
        const citations = citationsIn(yield* fs.readFileString(file));
        const problems = yield* Effect.forEach(citations, (citation) =>
          checkCitation(file, citation),
        );
        return { file, checked: citations.length, problems: problems.flat() };
      }),
    );

    if (args.json) {
      yield* Console.log(yield* encodeJson({ files: reports }));
    } else {
      for (const report of reports) {
        for (const found of report.problems) {
          yield* Console.log(`${found.file}:${found.line} ${found.kind} ${found.detail}`);
        }
        yield* Console.log(
          `${report.file}: ${report.checked} quotations checked, ${report.problems.length} problems`,
        );
      }
    }

    if (reports.some((report) => report.problems.length > 0)) {
      const cliProcess = yield* CliProcess;
      return yield* cliProcess.exitFailure;
    }
  }).pipe(Effect.provide(CheckLive)),
).pipe(
  Command.withDescription(
    "Verify a document's Scripture and witness quotations word for word against the corpus",
  ),
);
