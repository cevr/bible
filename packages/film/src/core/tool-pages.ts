// A tool's answer within a budget, for the lab's easel tools on its MCP
// (`tools/easel-mcp.ts`). An agent's client cuts a long result (Claude Code
// warns past 10,000 tokens and cuts past 25,000; others sooner), and a result
// cut in its middle loses what came after it unseen. So each answer encodes to
// at most `RESULT_BUDGET` characters of JSON and says how to read on: a
// check's findings a page at a time, from a cursor that names its report (a
// page asked of a report whose findings have changed since starts again from
// the first, and says so); a film's cue lines whole (a line longer than an
// answer goes on by its column); a journal's newest entries, the older ones
// counted, with the file that holds them all. Pure.

import { Hash, Option, Schema } from 'effect';
import { addressKey } from './address.ts';
import type { CheckLine } from './schema.ts';

/** The most characters an answer encodes to as JSON, escapes included. */
const RESULT_BUDGET = 8_000;

/** A count or cursor no answer reaches: an answer is measured with it where its own goes, so its own always fits. */
const FAR = 999_999_999;

/** The most findings a check answer lists; the rest are counted. */
const CHECK_MAX_FINDINGS = 24;

/** The most characters of one finding's message, or of its place, a check answer keeps. */
const FINDING_CHARS = 400;

/** The most characters of one journal entry an answer keeps: the file holds it whole. */
const ENTRY_CHARS = 800;

/** `text` cut to `chars`, saying so. */
export const clip = (text: string, chars: number): string => {
  if (text.length <= chars) return text;
  return `${text.slice(0, chars)}… (${text.length - chars} more characters)`;
};

/** A high surrogate: the first half of a character a cut must not split. */
const isHighSurrogate = (code: number) => code >= 0xd8_00 && code <= 0xdb_ff;

/** The largest size in `[0, high]` that `fits`, which holds for every size below one it holds for. */
const largestFitting = (high: number, fits: (size: number) => boolean): number => {
  let low = 0;
  let top = high;
  while (low < top) {
    const mid = Math.ceil((low + top) / 2);
    if (fits(mid)) low = mid;
    else top = mid - 1;
  }
  return low;
};

/** Whether `value` encodes under `schema` to JSON within the budget. */
const fitsUnder = <T, E>(schema: Schema.Codec<T, E>) => {
  const encode = Schema.encodeSync(Schema.fromJsonString(schema));
  return (value: T): boolean => encode(value).length <= RESULT_BUDGET;
};

// ---------------------------------------------------------------------------
// A check's findings

/** One finding as a check answer lists it: errors first, each with its part of the film. */
const CheckFinding = Schema.Struct({
  level: Schema.Literals(['error', 'warning']),
  tag: Schema.String,
  /** Its part of the film: `film`, `act:<name>`, `scenes:<id>,…` or `short:<id>`. */
  where: Schema.String,
  /** Its film second, when it has one. */
  time: Schema.optionalKey(Schema.Finite),
  message: Schema.String,
});
type CheckFinding = typeof CheckFinding.Type;

/** Where a check's next page starts: its first finding's place, and the report it is a place in. */
const CheckCursor = Schema.Struct({ from: Schema.Int, report: Schema.String });

export const CheckPage = Schema.Struct({
  errors: Schema.Int,
  warnings: Schema.Int,
  /** The place of the first finding listed among all of them, errors first (0: the first). */
  from: Schema.Int,
  findings: Schema.Array(CheckFinding),
  /** Present when the page asked for was in a report whose findings have changed: this one starts again from the first. */
  restarted: Schema.optionalKey(Schema.String),
  /** Present when findings remain past this page: the `from` and `report` that list them. */
  next: Schema.optionalKey(CheckCursor),
});
type CheckPage = typeof CheckPage.Type;
const checkFits = fitsUnder(CheckPage);
const encodeFinding = Schema.encodeSync(Schema.fromJsonString(CheckFinding));

/** A check page asked for: the place to start at and the report it is in, both from an answer's `next`. */
interface CheckAt {
  readonly from?: number;
  readonly report?: string;
}

/** A finding as a page lists it. */
const findingOf = (line: CheckLine): CheckFinding => ({
  level: line.level,
  tag: line.tag,
  where: Option.match(Option.fromUndefinedOr(line.address), {
    onNone: () => 'film',
    onSome: (address) => addressKey(address.part),
  }),
  ...Option.match(Option.fromUndefinedOr(line.address?.time), {
    onNone: () => ({}),
    onSome: (time) => ({ time }),
  }),
  message: line.message,
});

/**
 * A report's fingerprint: its count and a hash of every finding, whole and in
 * order. A finding fixed, added or reworded between pages changes it.
 */
const reportOf = (findings: ReadonlyArray<CheckFinding>): string => {
  const hash = Hash.string(findings.map((finding) => encodeFinding(finding)).join('\n'));
  return `${findings.length}.${(hash >>> 0).toString(16)}`;
};

/**
 * The check's findings, errors first, from `at.from` on: as many as fit (at
 * most 24), and `next` when more remain. A cursor from another report
 * (findings fixed or added since its page) starts again from the first, and
 * says so, so no finding is skipped unseen.
 */
export const checkPage = (lines: ReadonlyArray<CheckLine>, at: CheckAt): CheckPage => {
  const errors = lines.filter((line) => line.level === 'error');
  const warnings = lines.filter((line) => line.level === 'warning');
  const whole = [...errors, ...warnings].map(findingOf);
  const report = reportOf(whole);
  const findings = whole.map((finding) => ({
    ...finding,
    where: clip(finding.where, FINDING_CHARS),
    message: clip(finding.message, FINDING_CHARS),
  }));
  // A later page is read only in the report it was given for: a `from` of
  // another report, or of none, would skip findings that moved up.
  const changed = Option.liftPredicate(
    at,
    (asked) => (asked.from ?? 0) > 0 && asked.report !== report,
  );
  const restarted = Option.match(changed, {
    onNone: () => ({}),
    onSome: () => ({
      restarted:
        'the findings changed since the page asked for (some fixed, or new), or no report was given: listed again from the first',
    }),
  });
  const start = Option.match(changed, {
    onNone: () => Math.min(at.from ?? 0, findings.length),
    onSome: () => 0,
  });
  const page = (count: number): CheckPage => ({
    errors: errors.length,
    warnings: warnings.length,
    from: start,
    findings: findings.slice(start, start + count),
    ...restarted,
  });
  const count = largestFitting(Math.min(CHECK_MAX_FINDINGS, findings.length - start), (size) =>
    checkFits({ ...page(size), next: { from: FAR, report } }),
  );
  if (start + count >= findings.length) return page(count);
  return { ...page(count), next: { from: start + count, report } };
};

// ---------------------------------------------------------------------------
// A film's cue lines

/** Where a cues answer goes on: a line, and a character in it (both from 1). */
const CuesCursor = Schema.Struct({ from: Schema.Int, column: Schema.Int });

export const CuesPage = Schema.Struct({
  /** Where `lines` starts: the line and the character in it. A column past 1 goes on inside the line the last answer stopped in. */
  from: Schema.Int,
  column: Schema.Int,
  /** How many lines there are. */
  total: Schema.Int,
  /** The lines from `from`/`column`, whole: the last is cut only when it alone is longer than an answer. */
  lines: Schema.Array(Schema.String),
  /** Present when a cue ends after its scene (`CuesLate`'s words): the lines still stand. */
  late: Schema.optionalKey(Schema.String),
  /** Present with `next`: what was left out to fit, and how to read it. */
  rest: Schema.optionalKey(Schema.String),
  /** Present when the lines go on: the `from` and `column` that read the rest. */
  next: Schema.optionalKey(CuesCursor),
});
type CuesPage = typeof CuesPage.Type;
const cuesFits = fitsUnder(CuesPage);

/** A cues page asked for: the line and the character to start at, both from an answer's `next`. */
interface CuesAt {
  readonly from?: number;
  readonly column?: number;
}

/**
 * The cue lines from line `at.from`, character `at.column`: every whole line
 * that fits, or, when the first alone is longer than an answer, as much of it
 * as fits; and `next` where the rest starts. No line is cut and dropped: what
 * one answer leaves out the next one reads.
 */
export const cuesPage = (
  all: ReadonlyArray<string>,
  late: Option.Option<string>,
  at: CuesAt,
): CuesPage => {
  const from = Math.max(1, Math.min(at.from ?? 1, all.length));
  const column = Math.max(1, Math.min(at.column ?? 1, (all[from - 1] ?? '').length + 1));
  const lines = [
    ...all.slice(from - 1, from).map((first) => first.slice(column - 1)),
    ...all.slice(from),
  ];
  const base = {
    from,
    column,
    total: all.length,
    ...Option.match(late, {
      onNone: () => ({}),
      onSome: (text) => ({ late: clip(text, FINDING_CHARS) }),
    }),
  };
  const restOf = (left: number) =>
    `${left} more lines left out to fit: call cues again with next.from and next.column`;
  const count = largestFitting(lines.length, (size) =>
    cuesFits({
      ...base,
      lines: lines.slice(0, size),
      rest: restOf(FAR),
      next: { from: FAR, column: 1 },
    }),
  );
  if (count === lines.length) return { ...base, lines };
  if (count > 0)
    return {
      ...base,
      lines: lines.slice(0, count),
      rest: restOf(lines.length - count),
      next: { from: from + count, column: 1 },
    };
  // The first line alone is longer than an answer: as much of it as fits.
  const first = lines[0] ?? '';
  const rest = `line ${from} goes on past this answer: call cues again with next.from and next.column`;
  let size = largestFitting(first.length, (chars) =>
    cuesFits({ ...base, lines: [first.slice(0, chars)], rest, next: { from: FAR, column: FAR } }),
  );
  // Never between the two halves of one character.
  if (size > 1 && isHighSurrogate(first.charCodeAt(size - 1))) size -= 1;
  size = Math.max(1, size);
  return { ...base, lines: [first.slice(0, size)], rest, next: { from, column: column + size } };
};

// ---------------------------------------------------------------------------
// A journal's newest entries

export const JournalPage = Schema.Struct({
  /** The journal's file, which holds every entry whole. */
  file: Schema.String,
  /** The newest entries asked for that fit, oldest first, one line each. */
  lines: Schema.Array(Schema.String),
  /** Present when older entries were left out: how many, and where they are. */
  earlier: Schema.optionalKey(Schema.String),
});
type JournalPage = typeof JournalPage.Type;
const journalFits = fitsUnder(JournalPage);

/**
 * `lines` (oldest first; `left` older ones not among them) as an answer: the
 * newest that fit, each cut to 800 characters, and how many earlier entries
 * the answer leaves out, with the file that holds them.
 */
export const journalPage = (
  file: string,
  lines: ReadonlyArray<string>,
  left: number,
): JournalPage => {
  const kept = lines.map((line) => clip(line, ENTRY_CHARS));
  const earlierOf = (count: number) => `${count} earlier entries not shown: ${file} holds them all`;
  const count = largestFitting(kept.length, (size) =>
    journalFits({ file, lines: kept.slice(kept.length - size), earlier: earlierOf(FAR) }),
  );
  const shown = kept.slice(kept.length - count);
  const out = left + kept.length - count;
  if (out === 0) return { file, lines: shown };
  return { file, lines: shown, earlier: earlierOf(out) };
};
