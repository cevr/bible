// What `bun run redfirst` reads and prints: the cases of a JUnit report, the
// lines a diff added to a file, and which new or changed cases passed against
// the base's product sources (a test a defect cannot fail).

import { Option } from 'effect';
import { type Node, Visitor, parseSync } from 'oxc-parser';

/** One case of a run: where it starts, its name, and whether it passed. */
interface Case {
  readonly file: string;
  readonly line: number;
  readonly name: string;
  readonly passed: boolean;
}

const attribute = (tag: string, key: string): string =>
  new RegExp(`\\s${key}="([^"]*)"`).exec(tag)?.[1] ?? '';

const unescapeXml = (text: string): string =>
  text
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');

/**
 * The cases of `bun test --reporter=junit`, each with the file (relative to
 * `prefix`, the package the run started in) and the line it starts on. A
 * case passed when its element holds no failure, error or skip.
 */
export const casesOf = (junit: string, prefix: string): ReadonlyArray<Case> =>
  [...junit.matchAll(/<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g)].map((m) => {
    const tag = m[1] ?? '';
    const body = m[3] ?? '';
    const suite = unescapeXml(attribute(tag, 'classname'));
    const name = unescapeXml(attribute(tag, 'name'));
    return {
      file: `${prefix}${attribute(tag, 'file')}`,
      line: Number(attribute(tag, 'line')),
      name: [suite, name].filter((part) => part !== '').join(' > '),
      passed: !/<(failure|error|skipped)\b/.test(body),
    };
  });

/** The lines (1-based, in the new file) a unified diff of one file added. */
export const addedLines = (diff: string): ReadonlySet<number> => {
  const added = new Set<number>();
  let at = 0;
  for (const line of diff.split('\n')) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      at = Number(hunk[1]);
      continue;
    }
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) {
      added.add(at);
      at += 1;
    } else if (!line.startsWith('-') && !line.startsWith('\\')) at += 1;
  }
  return added;
};

/** The lines (1-based, both ends in) of one case's own code: its title and its body. */
interface Span {
  readonly from: number;
  readonly to: number;
}

const TEST_RUNNERS: ReadonlySet<string> = new Set(['test', 'it']);

/** The name a callee starts from: `test` of `test.each([…])`, `it` of `it.skip`. */
const calleeRoot = (node: Node): string => {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression') return calleeRoot(node.object);
  if (node.type === 'CallExpression') return calleeRoot(node.callee);
  return '';
};

/**
 * The span of each case a test file declares, from its title to its call's
 * end: for `test.each(table)(title, body)` the table is left out, a row being
 * a case of its own (a row added is a case the base lacks).
 */
export const caseSpans = (file: string, text: string): ReadonlyArray<Span> => {
  const starts = [0, ...[...text.matchAll(/\n/g)].map((m) => m.index + 1)];
  const lineOf = (offset: number) => starts.findLastIndex((start) => start <= offset) + 1;
  const spans: Array<Span> = [];
  new Visitor({
    CallExpression: (node) => {
      // `test.each(table)` (one argument) is the callee of the case's own call, not a case.
      if (!TEST_RUNNERS.has(calleeRoot(node.callee)) || node.arguments.length < 2) return;
      for (const title of node.arguments.slice(0, 1))
        spans.push({ from: lineOf(title.start), to: lineOf(node.end) });
    },
  }).visit(parseSync(file, text).program);
  return spans;
};

/**
 * Whether the diff touched a case: an added line in the smallest span holding
 * the line the run names for it (a `test.each`'s cases share one), or on that
 * line when no span holds it.
 */
const touched = (c: Case, spans: ReadonlyArray<Span>, added: ReadonlySet<number>): boolean => {
  const holding = spans
    .filter((span) => span.from <= c.line && c.line <= span.to)
    .toSorted((a, b) => a.to - a.from - (b.to - b.from))[0] ?? { from: c.line, to: c.line };
  return [...added].some((line) => holding.from <= line && line <= holding.to);
};

/** A case's key across the two runs: its file and full name. */
export const caseKey = (c: Case): string => `${c.file}\u0000${c.name}`;

/** What the diff did to one test file: the lines it added and the spans of its cases at HEAD. */
interface FileChange {
  readonly added: ReadonlySet<number>;
  readonly spans: ReadonlyArray<Span>;
}

/**
 * The new or changed cases of `head` (the head's tests run against the base's
 * sources): those whose key `baseKeys` (the base's own run) lacks, and those
 * whose own lines the diff touched.
 */
export const newOrChanged = (
  head: ReadonlyArray<Case>,
  baseKeys: ReadonlySet<string>,
  changes: ReadonlyMap<string, FileChange>,
): ReadonlyArray<Case> =>
  head.filter((c) => {
    if (!baseKeys.has(caseKey(c))) return true;
    return Option.exists(Option.fromUndefinedOr(changes.get(c.file)), (change) =>
      touched(c, change.spans, change.added),
    );
  });

/** The test files a run named that answered no case: red whole, as a file that cannot load on the base. */
export const unloaded = (
  files: ReadonlyArray<string>,
  cases: ReadonlyArray<Case>,
): ReadonlyArray<string> => files.filter((file) => !cases.some((c) => c.file === file));

/**
 * The report: each browser-tier file not run, each file red whole, every new
 * or changed case that passed on the base, then a count line.
 */
export const reportLines = (
  range: string,
  cases: ReadonlyArray<Case>,
  files: { readonly skipped: ReadonlyArray<string>; readonly unloaded: ReadonlyArray<string> },
): ReadonlyArray<string> => {
  const green = cases.filter((c) => c.passed);
  return [
    ...files.skipped.map((file) => `redfirst ${file} not run (a browser tier: run it by hand)`),
    ...files.unloaded.map((file) => `redfirst ${file} red whole: no case ran on the base`),
    ...green.map((c) => `redfirst green on base: ${c.file}:${c.line} ${c.name}`),
    `redfirst ${range} cases=${cases.length} red=${cases.length - green.length} green=${green.length}`,
  ];
};
