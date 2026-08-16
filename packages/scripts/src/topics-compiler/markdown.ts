import { Match, Option, Schema } from 'effect';

import {
  BlockquoteBlock,
  CitationInline,
  EmphasisInline,
  HeadingBlock,
  LinkInline,
  ListBlock,
  ParagraphBlock,
  ScriptureInline,
  StrongInline,
  TextInline,
  type Block,
  type Inline,
} from '@bible/core/wiki';

/** The authored subset of markdown the wiki compiles. Deliberately small: the
 *  §2.2 node union is the contract three clients render, and every construct
 *  admitted here is one all three must be able to draw. Anything outside the
 *  subset stays literal text rather than becoming a silently dropped node.
 *
 *  Block and inline structure come from `Bun.markdown`, the CommonMark parser
 *  the repo already renders its static site with — not from hand-rolled
 *  regexes, which got emphasis, nesting, and escaping subtly wrong and had to
 *  re-derive rules CommonMark already specifies.
 *
 *  `Bun.markdown.render` is string-in / string-out: each callback receives its
 *  children *already rendered as a string*. To recover a typed tree rather than
 *  HTML, every callback emits its node as JSON wrapped in delimiters that
 *  cannot occur in authored markdown (U+0001 / U+0002 are control characters,
 *  and `parseBody` strips them — along with the placeholder mark — out of the
 *  source before parsing, so a body carrying one cannot forge a node). Parents
 *  then decode their children back out of that string. The encoding is an
 *  implementation detail confined to this module.
 */

const OPEN = '\u0001';
const CLOSE = '\u0002';

/** The two wiki constructs CommonMark knows nothing about. Both are resolved by
 *  a pre-pass rather than by scanning text nodes afterwards, because the parser
 *  splits runs of text at its own boundaries: `[[Dan 8:14]]` arrives as three
 *  separate text nodes (`[`, `[`, `Dan 8:14]]`), so a post-hoc scan would have
 *  to reassemble what the parser took apart. Substituting an opaque
 *  single-token placeholder first keeps each construct atomic through parsing —
 *  verified to survive inside emphasis, list items, and blockquotes.
 *
 *  The pre-pass runs *before* CommonMark, so it must reproduce the two places
 *  CommonMark holds text literal — code, and backslash escapes — or it rewrites
 *  text the author asked to be left alone. `protectedSpans` below does exactly
 *  that, and substitution is applied only outside what it finds. */
const CITATION = /\{\{([^|{}]+)\|([^{}]*)\}\}/gu;
const SCRIPTURE = /\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/gu;
/** The placeholder delimiter. Scanned for by hand rather than with a regex:
 *  a pattern over a control character reads poorly and is needlessly general
 *  for a token whose shape is fixed at `MARK digits MARK`. */
const MARK = '\u001f';
const HTML_COMMENT = /<!--[\s\S]*?-->/gu;

/** A `{{REFCODE|...}}` whose quoted text carries no letter and no digit —
 *  blank, or punctuation only.
 *
 *  It does not become a `CitationInline`: such a quote matches any paragraph
 *  holding the same punctuation, so it would verify against a refcode without
 *  the source having said anything. It is reported rather than dropped:
 *  silently discarding it would turn an authoring mistake into a page that
 *  cites nothing, so the compiler fails the build on it (§3.4 step 6). */
export interface BlankCitation {
  readonly refcode: string;
  readonly quote: string;
}

/** What the pre-pass produces: the rewritten source, the nodes its placeholders
 *  stand for, and any malformed citation the compiler must reject. */
interface Substituted {
  readonly text: string;
  readonly nodes: readonly Inline[];
  readonly blank: readonly BlankCitation[];
}

/** Whether the character at `position` is backslash-escaped. Counts the run of
 *  backslashes before it: an odd run escapes, an even run is escaped
 *  backslashes and leaves the character live — the same rule CommonMark §2.4
 *  applies. */
const isEscaped = (text: string, position: number): boolean => {
  let backslashes = 0;
  let index = position - 1;
  while (index >= 0 && text[index] === '\\') {
    backslashes += 1;
    index -= 1;
  }
  return backslashes % 2 === 1;
};

/** Whether a quote asserts anything at all. A quote with no letter and no digit
 *  — blank, or `...`, or a lone dash — is a substring of any paragraph carrying
 *  the same punctuation, so it would verify against a refcode without the
 *  source having said anything. The compiler applies the same predicate to the
 *  normalized quote (§3.4 step 6); this is the parse-time half of one rule. */
const QUOTES_TEXT = /[\p{L}\p{N}]/u;

const quotesText = (quote: string): boolean => QUOTES_TEXT.test(quote);

/** A half-open `[start, end)` region of the source the pre-pass must not
 *  rewrite. */
interface Span {
  readonly start: number;
  readonly end: number;
}

/** A fence opener: three or more backticks or tildes at the start of a line,
 *  with up to three leading spaces (CommonMark §4.5). The info string is
 *  whatever follows on that line. */
const FENCE = /^ {0,3}(`{3,}|~{3,})[^\n]*$/u;
/** An indented code block line: four leading spaces or a tab (CommonMark §4.4).
 *  A blank line does not close one, so runs of them stay inside. */
const INDENTED = /^(?: {4}|\t)/u;
const BLANK_LINE = /^[ \t]*$/u;

/** Every region CommonMark would render literally: fenced code, indented code,
 *  and inline code spans.
 *
 *  Scanned line by line for the block forms, then character by character for
 *  backtick runs, matching a run only against a closer of equal length as
 *  CommonMark §6.1 requires. An unclosed opener protects nothing — CommonMark
 *  treats its backticks as literal text, so the pre-pass does too. */
const protectedSpans = (body: string): readonly Span[] => {
  const spans: Span[] = [];
  const lines = body.split('\n');
  let offset = 0;
  let fence = Option.none<string>();
  let fenceStart = 0;
  let indentedStart = Option.none<number>();
  const openRegions: Span[] = [];
  let cursor = 0;
  for (const line of lines) {
    const lineStart = offset;
    const lineEnd = offset + line.length;
    offset = lineEnd + 1;
    if (Option.isSome(fence)) {
      // A closer is a run of the opener's character, at least as long, alone on
      // its line.
      const closer = line.trim();
      const marker = fence.value;
      if (
        closer.length >= marker.length &&
        [...closer].every((character) => character === marker[0])
      ) {
        spans.push({ start: fenceStart, end: lineEnd });
        fence = Option.none();
      }
      continue;
    }
    const opener = Option.fromNullishOr(FENCE.exec(line)).pipe(
      Option.flatMap((match) => Option.fromNullishOr(match[1])),
    );
    if (Option.isSome(opener)) {
      // An unclosed fence runs to the end of the document (CommonMark §4.5).
      fence = opener;
      fenceStart = lineStart;
      if (Option.isSome(indentedStart)) {
        spans.push({ start: indentedStart.value, end: lineStart });
        indentedStart = Option.none();
      }
      continue;
    }
    if (INDENTED.test(line)) {
      if (Option.isNone(indentedStart)) indentedStart = Option.some(lineStart);
      continue;
    }
    if (Option.isSome(indentedStart) && !BLANK_LINE.test(line)) {
      spans.push({ start: indentedStart.value, end: lineStart });
      indentedStart = Option.none();
    }
  }
  if (Option.isSome(fence)) spans.push({ start: fenceStart, end: body.length });
  if (Option.isSome(indentedStart)) spans.push({ start: indentedStart.value, end: body.length });

  // Inline code spans are only meaningful outside the block forms found above,
  // so the remaining open regions are scanned rather than the whole body.
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  for (const span of sorted) {
    if (span.start > cursor) openRegions.push({ start: cursor, end: span.start });
    cursor = Math.max(cursor, span.end);
  }
  if (cursor < body.length) openRegions.push({ start: cursor, end: body.length });

  for (const region of openRegions) {
    let index = region.start;
    while (index < region.end) {
      if (body[index] === '\\') {
        // An escaped backtick opens nothing.
        index += 2;
        continue;
      }
      if (body[index] !== '`') {
        index += 1;
        continue;
      }
      let run = index;
      while (run < region.end && body[run] === '`') run += 1;
      const length = run - index;
      let search = run;
      let closed = Option.none<number>();
      while (search < region.end) {
        if (body[search] !== '`') {
          search += 1;
          continue;
        }
        let candidate = search;
        while (candidate < region.end && body[candidate] === '`') candidate += 1;
        if (candidate - search === length) {
          closed = Option.some(candidate);
          break;
        }
        search = candidate;
      }
      if (Option.isNone(closed)) {
        // Unclosed: the backticks are literal, and the text after them is still
        // open to substitution.
        index = run;
        continue;
      }
      spans.push({ start: index, end: closed.value });
      index = closed.value;
    }
  }
  return spans.sort((a, b) => a.start - b.start);
};

/** The complement of `protectedSpans`: the regions substitution may rewrite. */
const openSpans = (body: string, guarded: readonly Span[]): readonly Span[] => {
  const open: Span[] = [];
  let cursor = 0;
  for (const span of guarded) {
    if (span.start > cursor) open.push({ start: cursor, end: span.start });
    cursor = Math.max(cursor, span.end);
  }
  if (cursor < body.length) open.push({ start: cursor, end: body.length });
  return open;
};

/** Substitutes every citation and scripture reference with a placeholder token,
 *  outside code and outside a backslash escape.
 *
 *  Code is skipped because CommonMark renders it literally: an author writing
 *  `` `[[Dan 8:14]]` `` is showing the syntax, not using it, and rewriting it
 *  would make the two indistinguishable in the compiled page. A backslash
 *  before the opener is the escape CommonMark already defines for exactly this
 *  purpose, and it is consumed so the rendered text reads `[[Dan 8:14]]`
 *  without its backslash. */
const substitute = (body: string): Substituted => {
  const nodes: Inline[] = [];
  const blank: BlankCitation[] = [];
  const placeholder = (node: Inline): string => {
    nodes.push(node);
    return `${MARK}${String(nodes.length - 1)}${MARK}`;
  };
  const substituteRegion = (region: string): string =>
    region
      .replace(CITATION, (match, refcode: string, quoted: string, position: number) => {
        if (isEscaped(region, position)) return match;
        const trimmed = quoted.trim();
        if (!quotesText(trimmed)) {
          blank.push({ refcode: refcode.trim(), quote: quoted });
          // Left in place as literal text so the authored source stays visible
          // in the failure the compiler raises.
          return match;
        }
        return placeholder(CitationInline.make({ refcode: refcode.trim(), text: trimmed }));
      })
      // `String.replace` hands an unmatched optional group over as `undefined`;
      // it is converted to `Option` here, at the one boundary where the regex
      // engine is spoken to, so the label is a presence-or-absence value
      // everywhere after.
      .replace(SCRIPTURE, (...args: readonly unknown[]) => {
        const match = String(args[0]);
        // `String.replace` puts the offset after the capture groups; this
        // pattern has two, so it is argument three.
        const position = Number(args[3]);
        if (isEscaped(region, position)) return match;
        const reference = String(args[1]).trim();
        const label = Option.fromNullishOr(args[2]).pipe(
          Option.map((value) => String(value).trim()),
          Option.filter((value) => value.length > 0),
        );
        return placeholder(
          ScriptureInline.make({
            reference,
            text: Option.getOrElse(label, () => reference),
          }),
        );
      });

  const guarded = protectedSpans(body);
  const open = openSpans(body, guarded);
  const parts: string[] = [];
  let cursor = 0;
  for (const region of open) {
    if (region.start > cursor) parts.push(body.slice(cursor, region.start));
    parts.push(substituteRegion(body.slice(region.start, region.end)));
    cursor = region.end;
  }
  if (cursor < body.length) parts.push(body.slice(cursor));
  return { text: parts.join(''), nodes, blank } satisfies Substituted;
};

/** The encoded node forms the callbacks emit. Decoding them back into the §2.2
 *  union is a Schema boundary like any other: the payload is a string this
 *  module produced, but it is still parsed rather than trusted. */
const EncodedText = Schema.Struct({ kind: Schema.Literal('text'), value: Schema.String });
const EncodedInline = Schema.Struct({
  kind: Schema.Literals(['emphasis', 'strong']),
  children: Schema.String,
});
const EncodedLink = Schema.Struct({
  kind: Schema.Literal('link'),
  href: Schema.String,
  children: Schema.String,
});
const EncodedParagraph = Schema.Struct({
  kind: Schema.Literal('paragraph'),
  children: Schema.String,
});
const EncodedHeading = Schema.Struct({
  kind: Schema.Literal('heading'),
  level: Schema.Finite,
  children: Schema.String,
});
const EncodedBlockquote = Schema.Struct({
  kind: Schema.Literal('blockquote'),
  children: Schema.String,
});
const EncodedList = Schema.Struct({
  kind: Schema.Literal('list'),
  ordered: Schema.Boolean,
  children: Schema.String,
});
const EncodedListItem = Schema.Struct({
  kind: Schema.Literal('listItem'),
  children: Schema.String,
});

const Encoded = Schema.Union([
  EncodedText,
  EncodedInline,
  EncodedLink,
  EncodedParagraph,
  EncodedHeading,
  EncodedBlockquote,
  EncodedList,
  EncodedListItem,
]);
type Encoded = typeof Encoded.Type;

/** One codec for both directions, so the string a callback emits and the value
 *  `children` reads back can never drift apart. */
const EncodedJson = Schema.fromJsonString(Encoded);
const decodeNode = Schema.decodeUnknownOption(EncodedJson);
const encodeNode = Schema.encodeSync(EncodedJson);

const encode = (node: Encoded): string => `${OPEN}${encodeNode(node)}${CLOSE}`;

/** Splits a rendered children string into the encoded nodes it holds. Anything
 *  outside a delimited span is literal text the parser emitted without a
 *  callback — kept rather than dropped, so no authored character disappears. */
const children = (rendered: string): readonly Encoded[] => {
  const found: Encoded[] = [];
  let rest = rendered;
  while (rest.length > 0) {
    const start = rest.indexOf(OPEN);
    if (start === -1) break;
    const end = rest.indexOf(CLOSE, start);
    if (end === -1) break;
    const literal = rest.slice(0, start);
    if (literal.length > 0) found.push({ kind: 'text', value: literal });
    const node = decodeNode(rest.slice(start + 1, end));
    if (Option.isSome(node)) found.push(node.value);
    rest = rest.slice(end + 1);
  }
  if (rest.length > 0) found.push({ kind: 'text', value: rest });
  return found;
};

/** Restores the placeholders a text run carries, splitting it into literal text
 *  and the citation or scripture nodes the pre-pass set aside. */
const restore = (text: string, nodes: readonly Inline[], into: Inline[]): void => {
  let rest = text;
  for (;;) {
    const start = rest.indexOf(MARK);
    if (start === -1) break;
    const end = rest.indexOf(MARK, start + 1);
    if (end === -1) break;
    // A mark with anything but digits between the pair is not a placeholder the
    // pre-pass wrote, so it stays literal text.
    const digits = rest.slice(start + 1, end);
    const index = Option.liftPredicate(
      digits,
      (value) =>
        value.length > 0 && [...value].every((character) => character >= '0' && character <= '9'),
    ).pipe(Option.map(Number));
    const node = Option.flatMap(index, (value) => Option.fromNullishOr(nodes[value]));
    if (Option.isNone(node)) {
      // Keep the mark itself out of the output but preserve everything else.
      const literal = rest.slice(0, start) + digits;
      if (literal.length > 0) into.push(TextInline.make({ text: literal }));
      rest = rest.slice(end + 1);
      continue;
    }
    const before = rest.slice(0, start);
    if (before.length > 0) into.push(TextInline.make({ text: before }));
    into.push(node.value);
    rest = rest.slice(end + 1);
  }
  if (rest.length > 0) into.push(TextInline.make({ text: rest }));
};

/** Flattens an encoded run into inline nodes. Emphasis, strong, and link carry
 *  plain text in the §2.2 union, so their children collapse to a text
 *  projection — but a citation or scripture inside them survives as its own
 *  node rather than being flattened away. */
const inlines = (rendered: string, nodes: readonly Inline[]): readonly Inline[] => {
  const found: Inline[] = [];
  for (const node of children(rendered)) {
    switch (node.kind) {
      case 'text':
        restore(node.value, nodes, found);
        break;
      case 'emphasis':
      case 'strong': {
        const inner = inlines(node.children, nodes);
        const text = inner.map((child) => child.text).join('');
        // A wrapper holding only text becomes the styled node; one holding a
        // citation cannot, so its children are emitted in place — losing the
        // emphasis rather than losing the verified citation.
        if (inner.every((child) => child._tag === 'text')) {
          if (text.length > 0) {
            found.push(
              Match.value(node.kind).pipe(
                Match.when('strong', () => StrongInline.make({ text })),
                Match.orElse((): Inline => EmphasisInline.make({ text })),
              ),
            );
          }
          break;
        }
        found.push(...inner);
        break;
      }
      case 'link': {
        const text = inlines(node.children, nodes)
          .map((child) => child.text)
          .join('');
        if (node.href.length > 0) {
          found.push(LinkInline.make({ text, href: node.href }));
          break;
        }
        if (text.length > 0) found.push(TextInline.make({ text }));
        break;
      }
      // A block nested where an inline was expected (a list inside a list item)
      // contributes its text; the §2.2 union has no nested-block node.
      case 'paragraph':
      case 'heading':
      case 'blockquote':
      case 'list':
      case 'listItem':
        found.push(...inlines(node.children, nodes));
        break;
    }
  }
  return merge(found);
};

/** Bun emits punctuation as its own text node (`snake`, `_`, `case`), so
 *  adjacent text is merged back into one run. Without this, ordinary prose
 *  would compile to a different node count than the same prose written without
 *  punctuation, and `blocksToText` would insert phantom gaps. */
const merge = (nodes: readonly Inline[]): readonly Inline[] => {
  const merged: Inline[] = [];
  for (const node of nodes) {
    const previous = merged[merged.length - 1];
    if (node._tag === 'text' && previous?._tag === 'text') {
      merged[merged.length - 1] = TextInline.make({ text: previous.text + node.text });
      continue;
    }
    merged.push(node);
  }
  return merged;
};

/** §2.2 caps heading level at 4; anything deeper renders as the deepest level
 *  the union admits rather than failing the compile over a `#####`. */
const headingLevel = (level: number): 2 | 3 | 4 => {
  if (level <= 2) return 2;
  if (level === 3) return 3;
  return 4;
};

const blocks = (rendered: string, nodes: readonly Inline[]): readonly Block[] => {
  const found: Block[] = [];
  for (const node of children(rendered)) {
    switch (node.kind) {
      case 'paragraph': {
        const content = inlines(node.children, nodes);
        if (content.length > 0) found.push(ParagraphBlock.make({ content }));
        break;
      }
      case 'heading':
        found.push(
          HeadingBlock.make({
            level: headingLevel(node.level),
            content: inlines(node.children, nodes),
          }),
        );
        break;
      case 'blockquote': {
        // §2.2 blockquotes hold inline content, so a multi-paragraph quote
        // flattens into one run rather than nesting blocks.
        const content = inlines(node.children, nodes);
        if (content.length > 0) found.push(BlockquoteBlock.make({ content }));
        break;
      }
      case 'list': {
        const items = children(node.children)
          .filter((item) => item.kind === 'listItem')
          .map((item) => inlines(item.children, nodes));
        if (items.length > 0) found.push(ListBlock.make({ ordered: node.ordered, items }));
        break;
      }
      // A stray inline at block level (text between blocks) is not a block; its
      // content already belongs to a paragraph the parser emitted.
      case 'text':
      case 'emphasis':
      case 'strong':
      case 'link':
      case 'listItem':
        break;
    }
  }
  return found;
};

/** Renders markdown into the delimited encoding `blocks` reads. Only the
 *  constructs §2.2 admits get a callback; everything else falls through to its
 *  children, which is what keeps an unsupported construct as literal text
 *  instead of a dropped node. */
const render = (source: string): string =>
  Bun.markdown.render(source, {
    text: (value: string) => encode({ kind: 'text', value }),
    emphasis: (kids: string) => encode({ kind: 'emphasis', children: kids }),
    strong: (kids: string) => encode({ kind: 'strong', children: kids }),
    link: (kids: string, meta: { readonly href?: string }) =>
      encode({ kind: 'link', href: meta.href ?? '', children: kids }),
    paragraph: (kids: string) => encode({ kind: 'paragraph', children: kids }),
    heading: (kids: string, meta: { readonly level: number }) =>
      encode({ kind: 'heading', level: meta.level, children: kids }),
    blockquote: (kids: string) => encode({ kind: 'blockquote', children: kids }),
    list: (kids: string, meta: { readonly ordered: boolean }) =>
      encode({ kind: 'list', ordered: meta.ordered, children: kids }),
    listItem: (kids: string) => encode({ kind: 'listItem', children: kids }),
    // Inline code and images have no §2.2 node; their text is kept, their
    // markup is not.
    codespan: (kids: string) => kids,
    code: (kids: string) => encode({ kind: 'paragraph', children: kids }),
    image: () => '',
  });

/** The authored body split at its first `##`: everything before is the thesis,
 *  everything from the first heading on is the authored section body (§3.1). */
export interface ParsedBody {
  readonly thesis: readonly Block[];
  readonly body: readonly Block[];
  /** Malformed citations the compiler must reject. Carried on the parse result
   *  rather than thrown: the parser's job is to report what the source says,
   *  and the compiler owns which authoring mistakes fail the build. */
  readonly blankCitations: readonly BlankCitation[];
}

export const parseBody = (body: string): ParsedBody => {
  // Authoring notes live in HTML comments (every current stub carries one) and
  // are not content — strip them before the body is read. The delimiters the
  // encoding relies on are stripped too: they cannot appear in authored prose,
  // and letting one through would let a source forge a node.
  const cleaned = body
    .replace(HTML_COMMENT, '')
    .replaceAll(OPEN, '')
    .replaceAll(CLOSE, '')
    .replaceAll(MARK, '');
  const { text, nodes, blank } = substitute(cleaned);
  const parsed = blocks(render(text), nodes);
  const firstHeading = parsed.findIndex((block) => block._tag === 'heading');
  if (firstHeading === -1) return { thesis: parsed, body: [], blankCitations: blank };
  return {
    thesis: parsed.slice(0, firstHeading),
    body: parsed.slice(firstHeading),
    blankCitations: blank,
  };
};

/** Every citation in a compiled page, in document order. §3.4 step 6 walks
 *  this list and asserts each quote against its refcode's paragraph. */
export const collectCitations = (blocks: readonly Block[]): readonly CitationInline[] => {
  const found: CitationInline[] = [];
  const walk = (content: readonly Inline[]): void => {
    for (const node of content) {
      if (node._tag === 'citation') found.push(node);
    }
  };
  for (const block of blocks) {
    if (block._tag === 'list') {
      for (const item of block.items) walk(item);
      continue;
    }
    walk(block.content);
  }
  return found;
};

/** The plain-text projection of a block list — what the compiler scans when it
 *  derives flagship→flagship backlinks. */
export const blocksToText = (blocks: readonly Block[]): string => {
  const parts: string[] = [];
  const walk = (content: readonly Inline[]): void => {
    for (const node of content) parts.push(node.text);
  };
  for (const block of blocks) {
    if (block._tag === 'list') {
      for (const item of block.items) walk(item);
      continue;
    }
    walk(block.content);
  }
  return parts.join(' ');
};
