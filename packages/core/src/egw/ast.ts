import { Schema } from 'effect';
import { Parser } from 'htmlparser2';

// EGW paragraph content is small HTML. The AST below is a closed model of the
// tag/class universe we've observed in real chapters (with an `Unknown` escape
// hatch for forward compat) so renderers can switch exhaustively on `_tag`
// instead of branching on stringly-typed tag names.

export const Text = Schema.Struct({
  _tag: Schema.tag('Text'),
  text: Schema.String,
});
export type Text = typeof Text.Type;

export const LineBreak = Schema.Struct({
  _tag: Schema.tag('LineBreak'),
});
export type LineBreak = typeof LineBreak.Type;

// Empty marker — page-break carries the printed page number but no inline
// content. Renderer typically shows it as a small chip in the margin so reading
// flow isn't interrupted.
export const PageBreak = Schema.Struct({
  _tag: Schema.tag('PageBreak'),
  page: Schema.Number,
});
export type PageBreak = typeof PageBreak.Type;

// Mutually-recursive types: <em> and the wrapper spans contain inline children.
// Effect Schema needs explicit `suspend` for recursion.
export interface Emphasis {
  readonly _tag: 'Emphasis';
  readonly children: readonly Node[];
}
export const Emphasis: Schema.Codec<Emphasis> = Schema.Struct({
  _tag: Schema.tag('Emphasis'),
  children: Schema.Array(Schema.suspend((): Schema.Codec<Node> => Node)),
});

// <span class="non-egw-comment"> — editor/publisher metadata wrapped around the
// EGW text. Real example: "This chapter is based on <ScriptureRef/>".
export interface Comment {
  readonly _tag: 'Comment';
  readonly children: readonly Node[];
}
export const Comment: Schema.Codec<Comment> = Schema.Struct({
  _tag: Schema.tag('Comment'),
  children: Schema.Array(Schema.suspend((): Schema.Codec<Node> => Node)),
});

// <span class="egwlink egwlink_bible" title="Genesis 3:1" data-link="1965.119">
// Linkable reference into a scripture passage; `dataLink` is EGW's internal
// "bookId.paraId" addressing.
export interface ScriptureRef {
  readonly _tag: 'ScriptureRef';
  readonly title: string;
  readonly dataLink: string;
  readonly children: readonly Node[];
}
export const ScriptureRef: Schema.Codec<ScriptureRef> = Schema.Struct({
  _tag: Schema.tag('ScriptureRef'),
  title: Schema.String,
  dataLink: Schema.String,
  children: Schema.Array(Schema.suspend((): Schema.Codec<Node> => Node)),
});

// <span class="egwlink egwlink_book" title="..." data-link="..."> — same shape
// as ScriptureRef but resolves to another EGW book, not scripture.
export interface BookRef {
  readonly _tag: 'BookRef';
  readonly title: string;
  readonly dataLink: string;
  readonly children: readonly Node[];
}
export const BookRef: Schema.Codec<BookRef> = Schema.Struct({
  _tag: Schema.tag('BookRef'),
  title: Schema.String,
  dataLink: Schema.String,
  children: Schema.Array(Schema.suspend((): Schema.Codec<Node> => Node)),
});

// Forward-compat escape hatch. Real content uses a tiny tag universe, but the
// catalog of `<span class>` values isn't formally documented anywhere — when
// the parser sees something it doesn't know, it preserves enough to render a
// best-effort fallback and to surface in debug builds.
export interface Unknown {
  readonly _tag: 'Unknown';
  readonly tag: string;
  readonly className: string;
  readonly children: readonly Node[];
}
export const Unknown: Schema.Codec<Unknown> = Schema.Struct({
  _tag: Schema.tag('Unknown'),
  tag: Schema.String,
  className: Schema.String,
  children: Schema.Array(Schema.suspend((): Schema.Codec<Node> => Node)),
});

export type Node =
  | Text
  | LineBreak
  | PageBreak
  | Emphasis
  | Comment
  | ScriptureRef
  | BookRef
  | Unknown;
export const Node: Schema.Codec<Node> = Schema.Union([
  Text,
  LineBreak,
  PageBreak,
  Emphasis,
  Comment,
  ScriptureRef,
  BookRef,
  Unknown,
]);

// Internal builder frame. A stack of these tracks the currently-open element
// while the streaming parser fires open/close events; on close we pop the frame
// and the constructor produces the finalized Node from the accumulated children.
interface Frame {
  readonly children: Node[];
  /** Called on element close. Pushes the produced node into the parent frame. */
  readonly close: (children: readonly Node[]) => Node;
}

// Decide which AST constructor an opening <span ...> maps to, from its class
// list. Order matters — `egwlink_bible`/`egwlink_book` co-occur with the
// generic `egwlink` class, so we check the specific variants first.
const spanClose = (attribs: Record<string, string>): ((children: readonly Node[]) => Node) => {
  const className = attribs['class'] ?? '';
  const classes = className.split(/\s+/);

  if (classes.includes('page-break')) {
    // page-break is always empty; data-page is a string in the source, parse it.
    const raw = attribs['data-page'] ?? '';
    const page = Number.parseInt(raw, 10);
    return () => ({ _tag: 'PageBreak', page: Number.isFinite(page) ? page : 0 });
  }

  if (classes.includes('egwlink_bible')) {
    return (children) => ({
      _tag: 'ScriptureRef',
      title: attribs['title'] ?? '',
      dataLink: attribs['data-link'] ?? '',
      children,
    });
  }

  if (classes.includes('egwlink_book')) {
    return (children) => ({
      _tag: 'BookRef',
      title: attribs['title'] ?? '',
      dataLink: attribs['data-link'] ?? '',
      children,
    });
  }

  if (classes.includes('non-egw-comment')) {
    return (children) => ({ _tag: 'Comment', children });
  }

  return (children) => ({ _tag: 'Unknown', tag: 'span', className, children });
};

const tagClose = (name: string, attribs: Record<string, string>): Frame['close'] => {
  if (name === 'em') return (children) => ({ _tag: 'Emphasis', children });
  if (name === 'span') return spanClose(attribs);
  // br is handled at opentag time (void element); any other unknown tag falls
  // through here as a children-preserving Unknown.
  return (children) => ({
    _tag: 'Unknown',
    tag: name,
    className: attribs['class'] ?? '',
    children,
  });
};

/**
 * Parse the inline HTML inside a single EGW paragraph's `content` field into
 * the AST. Pure, sync, deterministic — safe to call from renderer or main.
 *
 * Streaming parser + frame stack: each opentag pushes a frame; ontext appends
 * to the current frame's children; onclosetag pops and constructs the node.
 */
export const parseParagraphContent = (html: string): readonly Node[] => {
  const root: Frame = { children: [], close: () => ({ _tag: 'Text', text: '' }) };
  const stack: Frame[] = [root];
  const top = (): Frame => {
    const t = stack[stack.length - 1];
    // Stack always has root, so this can't happen — but TS can't see that.
    if (t === undefined) throw new Error('parser stack underflow');
    return t;
  };

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        // br is a void element — emit as a leaf and don't push a frame, because
        // htmlparser2 in HTML mode will still fire onclosetag for it.
        if (name === 'br') {
          top().children.push({ _tag: 'LineBreak' });
          return;
        }
        stack.push({ children: [], close: tagClose(name, attribs) });
      },
      ontext(text) {
        if (text.length === 0) return;
        // Merge adjacent text nodes — htmlparser2 emits chunks across entity
        // boundaries, and the AST is cleaner with one Text per contiguous run.
        const frame = top();
        const last = frame.children[frame.children.length - 1];
        if (last !== undefined && last._tag === 'Text') {
          frame.children[frame.children.length - 1] = { _tag: 'Text', text: last.text + text };
        } else {
          frame.children.push({ _tag: 'Text', text });
        }
      },
      onclosetag(name) {
        // br closes were already handled at open time (no frame pushed).
        if (name === 'br') return;
        const finished = stack.pop();
        if (finished === undefined || stack.length === 0) {
          // Malformed HTML closing more than opened; ignore rather than crash.
          return;
        }
        top().children.push(finished.close(finished.children));
      },
    },
    { decodeEntities: true },
  );

  parser.write(html);
  parser.end();

  return root.children;
};

/**
 * Flatten the AST into a plain-text string. Used by pretext height estimation
 * (which works off text + font, not DOM). Line breaks become spaces — we just
 * want the wrappable token stream, not the visual layout.
 */
export const nodesToText = (nodes: readonly Node[]): string => {
  let out = '';
  for (const node of nodes) {
    switch (node._tag) {
      case 'Text':
        out += node.text;
        break;
      case 'LineBreak':
        out += ' ';
        break;
      case 'PageBreak':
        out += String(node.page);
        break;
      case 'Emphasis':
      case 'Comment':
      case 'ScriptureRef':
      case 'BookRef':
      case 'Unknown':
        out += nodesToText(node.children);
        break;
    }
  }
  return out;
};
