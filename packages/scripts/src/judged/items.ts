// The judged rules' selectors: the items of one source a rule judges, each
// with its first line, its last line, its offset, its text and its key. The runner
// (`sources.ts`) reads every item of the repo and asks the model of those
// the store does not answer; the oxlint plugin
// (`packages/scripts/lint/judged.ts`) takes every item of a file it lints
// and reports the answers kept for them. Both read a source through `parse`
// (oxc-parser), so an item's text, and with it its cache key, is the same in
// both. An item's key is its text with the whitespace a formatter moves
// folded: in code each run of it is one space, and none beside a mark that
// is not a letter, a digit or `_`; in a comment and in prose each run is one
// space; a literal's text (a string, a template's text, a regular
// expression, JSX text) is kept as written, so two items whose words differ
// never share a key. This module runs in Node (oxlint's plugin host) and in Bun, so it
// imports nothing of either.
//
//   comments       each comment block (a block comment, or a run of line
//                  comments on lines one after another, each first on its
//                  line; a line comment after code is a block of its own)
//   commentedCode  each comment block first on its line with the code it sits
//                  on: the outermost node that starts the next line
//   testCases      each test case (`it`/`test`, a name and a function,
//                  layered or `.each` too) of a test file, with the file's
//                  imports
//   functions      each named function of a source that is not a test, with
//                  the comment it sits under; one longer than FUNCTION_LINES
//                  is no item, and the named functions inside it are
//   scriptBeats    each beat's `say` and `picture` of a film's `script.ts`,
//                  and of a series script's Markdown, in its tables' rows or
//                  its `**say:**` and `**picture:**` paragraphs
//                  (`markdownBeats`)

import { Option, Predicate } from 'effect';
import { type Comment, type Node, type Program, parseSync, visitorKeys } from 'oxc-parser';

export const SELECTORS = [
  'comments',
  'commentedCode',
  'testCases',
  'functions',
  'scriptBeats',
] as const;

export type Selector = (typeof SELECTORS)[number];

/**
 * One item a judged rule reads: its first and last lines (1-based), its
 * offset, its words, and its key: its words with the whitespace a formatter
 * moves folded.
 */
export interface Item {
  readonly line: number;
  readonly end: number;
  readonly start: number;
  readonly text: string;
  readonly key: string;
}

/** A source as the selectors read it. */
interface Source {
  readonly file: string;
  readonly text: string;
  readonly program: Program;
  readonly comments: ReadonlyArray<Comment>;
}

/** `text` parsed as the file `file`. */
export const parse = (file: string, text: string): Source => {
  const { program, comments } = parseSync(file, text);
  return { file, text, program, comments };
};

/** The most lines of code an item shows; past it the rest is named, not shown. */
const CODE_LINES = 80;

/** The longest function `functions` takes whole. */
const FUNCTION_LINES = 120;

const TEST = /\.(?:test|spec)\.[cm]?tsx?$/;
const NOT_SOURCE = /(?:^|\/)(?:fixtures|e2e|testing)(?:\/|\.ts$)/;
const FILM_SCRIPT = /(?:^|\/)apps\/animations\/src\/films\/.+\/script\.ts$/;
const SERIES_SCRIPT = /(?:^|\/)apps\/animations\/series\/.+\/scripts\/[^/]+\.md$/;

/** Whether `selector` reads the file `file` (a path from the repo's root). */
export const selects = (selector: Selector, file: string): boolean => {
  switch (selector) {
    case 'comments':
    case 'commentedCode':
      return !file.endsWith('.md');
    case 'testCases':
      return TEST.test(file);
    case 'functions':
      return !file.endsWith('.md') && !TEST.test(file) && !NOT_SOURCE.test(file);
    case 'scriptBeats':
      return FILM_SCRIPT.test(file) || SERIES_SCRIPT.test(file);
  }
};

/**
 * Whether oxlint lints `file`, and so the plugin reports its findings: every
 * file the runner reads but a Markdown series script.
 */
export const readByOxlint = (file: string) => !file.endsWith('.md');

/** The 1-based line of each offset in `text`, by its line starts. */
const lineReader = (text: string) => {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return {
    lineOf: (offset: number) => {
      let low = 0;
      let high = starts.length - 1;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if ((starts[mid] ?? 0) <= offset) low = mid;
        else high = mid - 1;
      }
      return low + 1;
    },
    startOf: (line: number) => starts[line - 1] ?? 0,
  };
};

/** A comment's words: its markers, a JSDoc line's leading `*` and the edges' blank lines gone. */
const wordsOf = (type: Comment['type'], value: string) => {
  if (type === 'Line') return value.replace(/^ /, '').trimEnd();
  return value
    .split('\n')
    .map((line) => line.replace(/^\s*\*? ?/, '').trimEnd())
    .join('\n')
    .trim();
};

/** A comment block: its lines, its offsets, its words, and whether it stands first on its line. */
interface Block {
  readonly line: number;
  readonly end: number;
  readonly start: number;
  readonly close: number;
  readonly text: string;
  readonly alone: boolean;
}

/** Each comment block of `source`, in order. */
const commentBlocks = (source: Source): ReadonlyArray<Block> => {
  const { lineOf, startOf } = lineReader(source.text);
  const blocks: Array<{
    line: number;
    end: number;
    start: number;
    close: number;
    words: Array<string>;
    run: boolean;
    alone: boolean;
  }> = [];
  for (const comment of source.comments) {
    const line = lineOf(comment.start);
    const end = lineOf(comment.end);
    const alone = source.text.slice(startOf(line), comment.start).trim() === '';
    const run = comment.type === 'Line' && alone;
    const last = blocks.at(-1);
    const words = wordsOf(comment.type, comment.value);
    if (run && last?.run === true && last.end === line - 1) {
      last.end = end;
      last.close = comment.end;
      last.words.push(words);
    } else
      blocks.push({
        line,
        end,
        start: comment.start,
        close: comment.end,
        words: [words],
        run,
        alone,
      });
  }
  return blocks
    .map((b) => ({ ...b, text: b.words.join('\n').trim() }))
    .filter((b) => b.text !== '');
};

/** Whether a value read off a node is a node: an object with a string `type`. */
const isNode = (value: unknown): value is Node =>
  Predicate.hasProperty(value, 'type') && Predicate.isString(value.type);

/** The child nodes of `node`, in source order, by the parser's own visitor keys. */
const childrenOf = (node: Node): ReadonlyArray<Node> =>
  (visitorKeys[node.type] ?? []).flatMap((key) => {
    const value: unknown = Reflect.get(node, key);
    if (Array.isArray(value)) return value.filter(isNode);
    return Option.toArray(Option.liftPredicate(value, isNode));
  });

/**
 * Walks `node` and its descendants, outer first: `visit` answers whether to
 * go inside the node it is given.
 */
const walk = (node: Node, visit: (node: Node) => boolean) => {
  if (!visit(node)) return;
  for (const child of childrenOf(node)) walk(child, visit);
};

/** A span of a source a key reads apart from its code: a literal (its text as written) or a comment (its words). */
interface Span {
  readonly start: number;
  readonly end: number;
  readonly words: Option.Option<string>;
}

/** Whether `node` is a literal whose text is its meaning: a string, a regular expression, a template's text or JSX text. */
const isLiteralText = (source: Source, node: Node) => {
  if (node.type === 'TemplateElement' || node.type === 'JSXText') return true;
  if (node.type !== 'Literal') return false;
  const first = source.text[node.start];
  return first === '"' || first === "'" || first === '/';
};

const SPANS = new WeakMap<Source, ReadonlyArray<Span>>();

/** The comments and literal texts of `source`, in order (none of them overlaps another). */
const spansOf = (source: Source): ReadonlyArray<Span> => {
  const known = SPANS.get(source);
  if (known) return known;
  const spans: Array<Span> = source.comments.map((comment) => ({
    start: comment.start,
    end: comment.end,
    words: Option.some(foldProse(wordsOf(comment.type, comment.value))),
  }));
  walk(source.program, (node) => {
    if (!isLiteralText(source, node)) return true;
    spans.push({ start: node.start, end: node.end, words: Option.none() });
    return false;
  });
  spans.sort((a, b) => a.start - b.start);
  SPANS.set(source, spans);
  return spans;
};

/** Prose as its key reads it: each run of whitespace one space, none at the edges. */
const foldProse = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Code as its key reads it: each run of whitespace one space, none beside a mark that is not a letter, a digit or `_`, none at the edges. */
const foldCode = (text: string) => foldProse(text).replace(/ ?([^\p{L}\p{N}_ ]) ?/gu, '$1');

/**
 * The source from `start` to `end` as its key reads it: its code folded,
 * each comment its words (its markers and a JSDoc line's `*` gone) as prose,
 * each literal's text as written; a span the range cuts, its part as prose.
 */
const keyOfRange = (source: Source, start: number, end: number) => {
  const spans = spansOf(source);
  let low = 0;
  let high = spans.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if ((spans[mid]?.end ?? 0) <= start) low = mid + 1;
    else high = mid;
  }
  let key = '';
  let at = start;
  for (const span of spans.slice(low)) {
    if (span.start >= end) break;
    const from = Math.max(span.start, at);
    const to = Math.min(span.end, end);
    const whole = from === span.start && to === span.end;
    const text = source.text.slice(from, to);
    const read = Option.match(span.words, {
      onNone: () => text,
      onSome: (words) => {
        if (whole) return `/*${words}*/`;
        return foldProse(text);
      },
    });
    key += foldCode(source.text.slice(at, from)) + read;
    at = to;
  }
  return key + foldCode(source.text.slice(at, end));
};

/** The code from `start` to `end`, cut to its first `CODE_LINES` lines with the rest counted, and its key. */
const capped = (source: Source, start: number, end: number) => {
  const lines = source.text.slice(start, end).split('\n');
  if (lines.length <= CODE_LINES)
    return { text: source.text.slice(start, end), key: keyOfRange(source, start, end) };
  const cut = start + lines.slice(0, CODE_LINES).join('\n').length;
  const rest = `\n[… ${lines.length - CODE_LINES} more lines]`;
  return {
    text: `${source.text.slice(start, cut)}${rest}`,
    key: `${keyOfRange(source, start, cut)}${rest}`,
  };
};

/** The outermost node that starts at `offset`, if any. */
const nodeAt = (program: Program, offset: number): Option.Option<Node> => {
  let found = Option.none<Node>();
  walk(program, (node) => {
    if (Option.isSome(found) || node.end <= offset || node.start > offset) return false;
    if (node.start === offset && node.type !== 'Program') {
      found = Option.some(node);
      return false;
    }
    return true;
  });
  return found;
};

/** Each comment block first on its line, with the node that starts the line under it. */
const commentedCode = (source: Source): ReadonlyArray<Item> => {
  const { lineOf, startOf } = lineReader(source.text);
  return commentBlocks(source)
    .filter((block) => block.alone)
    .flatMap((block) => {
      const next = startOf(block.end + 1);
      const first =
        next + (source.text.slice(next).length - source.text.slice(next).trimStart().length);
      if (lineOf(first) !== block.end + 1) return [];
      return Option.toArray(
        Option.map(nodeAt(source.program, first), (node) => {
          const code = capped(source, node.start, node.end);
          return {
            line: block.line,
            end: lineOf(node.end),
            start: block.start,
            text: `Comment:\n${block.text}\n\nCode it sits on:\n${code.text}`,
            key: `Comment:\n${foldProse(block.text)}\n\nCode it sits on:\n${code.key}`,
          };
        }),
      );
    });
};

/**
 * The name a callee is called by at its root: `it` in `it.effect.skip`, in
 * `it.effect.layer(x)` and in `test.each(rows)`.
 */
const rootName = (node: Node): Option.Option<string> => {
  if (node.type === 'Identifier') return Option.some(node.name);
  if (node.type === 'MemberExpression') return rootName(node.object);
  if (node.type === 'CallExpression') return rootName(node.callee);
  return Option.none();
};

const FUNCTIONS = new Set(['ArrowFunctionExpression', 'FunctionExpression']);

/** Whether `node` is a test case: `it` or `test` (or a member of either) called with a name and a function. */
const isCase = (node: Node) =>
  node.type === 'CallExpression' &&
  Option.exists(rootName(node.callee), (name) => name === 'it' || name === 'test') &&
  Option.exists(Option.fromUndefinedOr(node.arguments[0]), (name) =>
    ['Literal', 'TemplateLiteral'].includes(name.type),
  ) &&
  node.arguments.some((argument) => FUNCTIONS.has(argument.type));

/** Each test case of a test file, with the file's imports. */
const testCases = (source: Source): ReadonlyArray<Item> => {
  const { lineOf } = lineReader(source.text);
  const statements = source.program.body.filter(
    (statement) => statement.type === 'ImportDeclaration',
  );
  const imports = statements
    .map((statement) => source.text.slice(statement.start, statement.end))
    .join('\n');
  const importsKey = statements
    .map((statement) => keyOfRange(source, statement.start, statement.end))
    .join('\n');
  const items: Array<Item> = [];
  walk(source.program, (node) => {
    if (!isCase(node)) return true;
    const test = capped(source, node.start, node.end);
    items.push({
      line: lineOf(node.start),
      end: lineOf(node.end),
      start: node.start,
      text: `Imports:\n${imports}\n\nTest:\n${test.text}`,
      key: `Imports:\n${importsKey}\n\nTest:\n${test.key}`,
    });
    return false;
  });
  return items;
};

/** Whether `node` makes a function: one written out, or a call handed one (`Effect.fn('f')(function* …)`). */
const makesFunction = (node: Node): boolean =>
  FUNCTIONS.has(node.type) ||
  (node.type === 'CallExpression' &&
    (node.arguments.some((argument) => FUNCTIONS.has(argument.type)) ||
      makesFunction(node.callee)));

/** Whether `node` is a named function: a declaration, a binding, a method or an object's function. */
const isNamedFunction = (node: Node) => {
  switch (node.type) {
    case 'FunctionDeclaration':
      return Option.isSome(Option.fromNullOr(node.id));
    case 'VariableDeclarator':
      return (
        node.id.type === 'Identifier' &&
        Option.exists(Option.fromNullOr(node.init), (init) => makesFunction(init))
      );
    case 'MethodDefinition':
      return true;
    case 'Property':
      return !node.shorthand && FUNCTIONS.has(node.value.type);
    default:
      return false;
  }
};

/** Each named function of a source, with the comment block that ends on the line above it. */
const functions = (source: Source): ReadonlyArray<Item> => {
  const { lineOf, startOf } = lineReader(source.text);
  const above = new Map(
    commentBlocks(source)
      .filter((block) => block.alone)
      .map((block) => [block.end + 1, block]),
  );
  const items: Array<Item> = [];
  walk(source.program, (node) => {
    if (!isNamedFunction(node)) return true;
    const line = lineOf(node.start);
    const end = lineOf(node.end);
    if (end - line + 1 > FUNCTION_LINES) return true;
    const doc = Option.fromUndefinedOr(above.get(line));
    const first = Option.match(doc, { onNone: () => line, onSome: (block) => block.line });
    items.push({
      line,
      end,
      start: node.start,
      text: source.text.slice(startOf(first), node.end),
      key: keyOfRange(source, startOf(first), node.end),
    });
    return false;
  });
  return items;
};

/** A property's key as a name: `say` in `say: …` or `'say': …`. */
const keyOf = (node: Node): Option.Option<string> => {
  if (node.type === 'Identifier') return Option.some(node.name);
  if (node.type === 'Literal' && Predicate.isString(node.value)) return Option.some(node.value);
  return Option.none();
};

/** The words of a string a beat writes: a literal's value, or a template's source between its backticks. */
const wordsOfString = (source: Source, node: Node): Option.Option<string> => {
  if (node.type === 'Literal' && Predicate.isString(node.value)) return Option.some(node.value);
  if (node.type === 'TemplateLiteral')
    return Option.some(source.text.slice(node.start + 1, node.end - 1));
  return Option.none();
};

const BEAT_KEYS = new Set(['say', 'picture']);

/** Each `say` and `picture` string of a film's script. */
const scriptBeats = (source: Source): ReadonlyArray<Item> => {
  const { lineOf } = lineReader(source.text);
  const items: Array<Item> = [];
  walk(source.program, (node) => {
    if (node.type !== 'Property') return true;
    const key = keyOf(node.key).pipe(Option.filter((name) => BEAT_KEYS.has(name)));
    const words = Option.flatMap(key, () => wordsOfString(source, node.value));
    Option.map(Option.all([key, words]), ([name, text]) =>
      items.push({
        line: lineOf(node.start),
        end: lineOf(node.end),
        start: node.start,
        text: `${name}: ${text}`,
        key: `${name}: ${foldProse(text)}`,
      }),
    );
    return Option.isNone(words);
  });
  return items;
};

/** The items `selector` reads in `source`. */
export const itemsOf = (selector: Selector, source: Source): ReadonlyArray<Item> => {
  switch (selector) {
    case 'comments':
      return commentBlocks(source).map((b) => ({
        line: b.line,
        end: b.end,
        start: b.start,
        text: b.text,
        key: foldProse(b.text),
      }));
    case 'commentedCode':
      return commentedCode(source);
    case 'testCases':
      return testCases(source);
    case 'functions':
      return functions(source);
    case 'scriptBeats':
      return scriptBeats(source);
  }
};

/** A table row's cells, its edge pipes gone. */
const cellsOf = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim());

/** The column whose header starts with one of `names`. */
const columnOf = (header: ReadonlyArray<string>, names: ReadonlyArray<string>) =>
  Option.liftPredicate(
    header.findIndex((cell) => names.some((name) => cell.startsWith(name))),
    (at) => at >= 0,
  );

/** A beat's paragraph in a series script: `**say:** …` or `**picture:** …` (never `**cite:**`). */
const PARAGRAPH = /^\*\*(say|picture):\*\*\s*(.*)$/i;

/** A line that ends a beat's paragraph: a blank line, another bold label, a table row or a heading. */
const ENDS_PARAGRAPH = /^\s*$|^\*\*|^\s*\||^#/;

/**
 * Each beat's `say` and `picture` of a series script, in either form the
 * series write them: a beat table's rows (the column headed `Say` or
 * `Spoken`, and the one headed `Picture` or `On screen`), or a beat's
 * `**say:**` and `**picture:**` paragraphs, each to the next blank line,
 * bold label, table row or heading. A `**cite:**` paragraph names its
 * sources by design, and is not read. Oxlint reads no Markdown, so only the
 * runner reads these.
 */
export const markdownBeats = (text: string): ReadonlyArray<Item> => {
  const items: Array<Item> = [];
  let columns = Option.none<{ readonly say: number; readonly picture: number }>();
  let paragraph = Option.none<{
    name: string;
    line: number;
    start: number;
    words: Array<string>;
  }>();
  const close = () => {
    Option.map(paragraph, ({ name, line, start, words }) => {
      const said = words.join(' ').trim();
      if (said !== '')
        items.push({
          line,
          end: line + words.length - 1,
          start,
          text: `${name}: ${said}`,
          key: `${name}: ${foldProse(said)}`,
        });
    });
    paragraph = Option.none();
  };
  let offset = 0;
  text.split('\n').forEach((row, i) => {
    const start = offset;
    offset += row.length + 1;
    if (Option.isSome(paragraph) && !ENDS_PARAGRAPH.test(row)) {
      paragraph.value.words.push(row.trim());
      return;
    }
    close();
    const opened = PARAGRAPH.exec(row);
    if (opened) {
      paragraph = Option.some({
        name: (opened[1] ?? '').toLowerCase(),
        line: i + 1,
        start,
        words: [opened[2] ?? ''],
      });
      return;
    }
    if (!row.trim().startsWith('|')) {
      columns = Option.none();
      return;
    }
    const cells = cellsOf(row);
    if (cells.every((cell) => /^:?-+:?$/.test(cell))) return;
    if (Option.isNone(columns)) {
      columns = Option.all({
        say: columnOf(cells, ['Say', 'Spoken']),
        picture: columnOf(cells, ['Picture', 'On screen']),
      });
      return;
    }
    for (const [name, at] of Object.entries(columns.value)) {
      const words = cells[at] ?? '';
      if (words !== '')
        items.push({
          line: i + 1,
          end: i + 1,
          start,
          text: `${name}: ${words}`,
          key: `${name}: ${foldProse(words)}`,
        });
    }
  });
  close();
  return items;
};
