/**
 * Whether a teaching document's quotations are word for word what they cite.
 *
 * Scripture bullets are compared with the KJV `bible verse` returns; witness
 * lines with the paragraph their refcode cites, through the same corpus-wide
 * lookup as `bible egw lookup` (books, periodicals, letters). A witness must
 * also be one unspliced clause of at most 30 words.
 *
 * `bible check` reports what this finds; `bible export` refuses a document
 * with any problem, so nothing misquoted reaches Notes.
 */

import { BunServices } from '@effect/platform-bun';
import { parseBibleQuery } from '@bible/core/bible';
import { BibleService } from '@bible/core/bible/service';
import * as BibleDbBun from '@bible/core/bible-db/bun';
import { nodesToText } from '@bible/core/egw';
import { WritingsService } from '@bible/core/writings/service';
import { Cause, Context, Effect, Layer, Option } from 'effect';

import { versesForBibleQuery } from '~/src/lib/bible-query';
import {
  citationsIn,
  isSpliced,
  quotationAppearsIn,
  quotedWordCount,
  WITNESS_WORD_LIMIT,
  type Citation,
} from '~/src/lib/quote-check';
import { ServiceLayer as WritingsLayer } from '../commands/egw/layers.js';

type ProblemKind =
  | 'verse-unresolved'
  | 'verse-mismatch'
  | 'witness-unresolved'
  | 'witness-mismatch'
  | 'witness-spliced'
  | 'witness-too-long';

export interface Problem {
  readonly file: string;
  readonly line: number;
  readonly kind: ProblemKind;
  readonly detail: string;
}

interface QuotationReport {
  readonly file: string;
  readonly checked: number;
  readonly problems: readonly Problem[];
}

interface QuotationsService {
  /** Check every quotation `markdown` makes; `file` only labels the report. */
  readonly check: (
    file: string,
    markdown: string,
  ) => Effect.Effect<QuotationReport, Cause.UnknownError>;
}

export class Quotations extends Context.Service<Quotations, QuotationsService>()(
  '@bible/cli/services/quotations/Quotations',
) {}

/** One problem per line, the shape `bible check` and `bible export` print. */
export const formatProblem = (problem: Problem) =>
  `${problem.file}:${problem.line} ${problem.kind} ${problem.detail}`;

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

const CorpusLive = Layer.mergeAll(
  WritingsLayer,
  BibleService.Live.pipe(Layer.provide(BibleDbBun.Default), Layer.provide(BunServices.layer)),
);

/** The corpus databases open only when a document actually quotes something,
 *  so commands that never check (and documents with no quotations) pay nothing. */
export const QuotationsLive = Layer.succeed(
  Quotations,
  Quotations.of({
    check: (file, markdown) => {
      const citations = citationsIn(markdown);
      if (citations.length === 0) return Effect.succeed({ file, checked: 0, problems: [] });
      return Effect.forEach(citations, (citation) => checkCitation(file, citation)).pipe(
        Effect.map((problems) => ({ file, checked: citations.length, problems: problems.flat() })),
        Effect.provide(CorpusLive),
        Effect.mapError((error) => new Cause.UnknownError(error, 'quotation check failed')),
      );
    },
  }),
);
