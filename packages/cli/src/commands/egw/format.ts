import { nodesToText, type Schemas as EGWSchemas } from '@bible/core/egw';
import type {
  SearchParagraphHit,
  SearchResult,
  SearchTopicHit,
  VectorAbsenceReason,
} from '@bible/core/search';
import type { Paragraph, Publication, SearchHit } from '@bible/core/writings';
import { Option, Schema, SchemaGetter } from 'effect';

const JsonString = Schema.Unknown.pipe(
  Schema.encodeTo(Schema.String, {
    decode: SchemaGetter.parseJson(),
    encode: SchemaGetter.stringifyJson({ space: 2 }),
  }),
);

export const encodeJson = Schema.encodeUnknownEffect(JsonString);

export const paragraphRefcode = (paragraph: Paragraph): string =>
  Option.getOrElse(paragraph.refcode, () => `[${paragraph.publicationCode}]`);

export const publicationJson = (publication: Publication) => ({
  id: publication.id,
  code: publication.code,
  title: publication.title,
  author: publication.author,
  paragraphCount: Option.getOrNull(publication.paragraphCount),
});

export const paragraphJson = (paragraph: Paragraph) => ({
  reference: {
    publication: paragraph.publicationCode,
    order: paragraph.order,
    page: Option.getOrNull(paragraph.page),
    number: Option.getOrNull(paragraph.number),
    refcode: Option.getOrNull(paragraph.refcode),
  },
  paragraphId: paragraph.reference.paragraphId,
  nodes: paragraph.nodes,
  elementType: Option.getOrNull(paragraph.elementType),
  elementSubtype: Option.getOrNull(paragraph.elementSubtype),
});

/** How much of a hit's paragraph the printer shows.
 *
 *  The corpus already carries the whole paragraph on every hit — `snippet` is
 *  `nodesToText(nodes)`, not a windowed extract — so the 200-character cut is
 *  presentation, and the full text costs nothing extra to print. A reader
 *  checking a quotation needs the sentence the ellipsis was hiding, and the
 *  only way to get it was a second `lookup` call per hit. `--full` is that
 *  second call, removed. */
export const SNIPPET_LIMIT = 200;

/** One hit's text, cut to {@link SNIPPET_LIMIT} unless the reader asked for all
 *  of it. Shared by both printers so the flag cannot mean one thing in a local
 *  search and another in a hybrid one. */
const snippetOf = (text: string, full: boolean): string => {
  if (text.length === 0) return '(no content)';
  if (full || text.length <= SNIPPET_LIMIT) return text;
  return `${text.slice(0, SNIPPET_LIMIT)}…`;
};

export const formatLocalSearchResult = (hit: SearchHit, index: number, full = false): string => {
  const ref = paragraphRefcode(hit.paragraph);
  let title = '';
  if (hit.publication.title !== hit.publication.code) {
    title = ` (${hit.publication.title})`;
  }
  const snippet = snippetOf(nodesToText(hit.paragraph.nodes), full);
  return `  ${index + 1}. ${ref}${title}\n     ${snippet}`;
};

export const formatRemoteHit = (hit: EGWSchemas.SearchHit, index: number): string => {
  const ref = hit.refcode_short ?? `[${hit.pub_code}]`;
  const author = Option.fromNullishOr(hit.refcode_long?.match(/\(([^)]+)\)\s*$/)?.[1]);
  let authorSuffix = '';
  if (Option.isSome(author)) {
    authorSuffix = ` — ${author.value}`;
  }
  const title = ` (${hit.pub_name}${authorSuffix})`;
  const rawSnippet = Option.fromNullishOr(hit.snippet);
  let snippet = '';
  if (Option.isSome(rawSnippet)) {
    snippet = rawSnippet.value
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 240);
  }
  const actionRequired = Option.fromNullishOr(hit.action_required);
  let gated = '';
  if (Option.isSome(actionRequired)) {
    gated = ` [${actionRequired.value}]`;
  }
  return `  ${index + 1}. ${ref}${title}${gated}\n     ${snippet}`;
};

// ---------------------------------------------------------------------------
// §9 hybrid search
// ---------------------------------------------------------------------------

/** Why the vector leg did not run, in the terms a reader can act on.
 *
 *  §9.6 makes vector absence a *typed value on every result* rather than a
 *  silent degradation, and the point of that decision is lost if the CLI prints
 *  the same output whether or not half the search ran. Each reason maps to a
 *  different remedy, so each gets its own sentence. */
export const formatVectorAbsence = (reason: VectorAbsenceReason): string => {
  if (reason === 'absent') {
    return 'lexical only — no vector index installed (build one with `bun run build:vectors`)';
  }
  if (reason === 'fingerprint') {
    return 'lexical only — the installed vector index was built by a different model';
  }
  if (reason === 'embedder') {
    return 'lexical only — the embedding model is not available on this machine';
  }
  if (reason === 'short-circuit') {
    return 'lexical only — the top lexical hit was decisive, so the vector leg was skipped';
  }
  if (reason === 'loading') {
    return 'lexical only — the vector index is still loading';
  }
  return 'lexical only — this query routes straight to the text index';
};

const formatSearchHit = (hit: SearchParagraphHit, index: number, full: boolean): string => {
  const legs: string[] = [];
  if (Option.isSome(hit.lexicalRank)) legs.push(`text #${String(hit.lexicalRank.value)}`);
  if (Option.isSome(hit.vectorRank)) legs.push(`vector #${String(hit.vectorRank.value)}`);
  let provenance = '';
  if (legs.length > 0) {
    provenance = `  [${legs.join(', ')}]`;
  }
  const snippet = snippetOf(hit.snippet, full);
  // The book code stands in for a paragraph the corpus stores without a
  // citation, exactly as `paragraphRefcode` above falls back to the publication
  // code: the line still has to name where the text came from.
  const refcode = Option.getOrElse(hit.refcode, () => hit.bookCode);
  // Says what the row is when it is not prose. A chapter title and a sentence
  // print identically otherwise — a refcode and a line of text — and BM25
  // normalizes by length, so a short title containing the whole query outranks
  // the paragraphs that discuss it. Headings are 17.7% of the corpus and can be
  // most of a result page: 32 of the top 40 for `latter rain`.
  let kind = '';
  if (hit.isHeading) {
    kind = ' [chapter]';
  }
  return `  ${String(index + 1)}. ${refcode}${kind} (${hit.bookTitle} — ${hit.author})${provenance}\n     ${snippet}`;
};

/** The whole §9 result as lines, topics first.
 *
 *  §9.4 ranks topic hits as a group *above* the paragraph results rather than
 *  interleaving them, because a topic page and a paragraph answer different
 *  questions and a fused ordering would bury the page that summarizes what the
 *  paragraphs each say once. The printer keeps that structure visible.
 *
 *  **The topics come from the caller, not from the result.** Searching the
 *  writings does not read a topics artifact — a host with no wiki would
 *  otherwise pay a lookup inside the hot path on every query — so the command
 *  fetches the group beside its search and hands it here. Defaulted to empty
 *  because the group is genuinely optional on this surface: a caller with no
 *  wiki prints the ranking and nothing above it. */
export const formatSearchResult = (
  result: SearchResult,
  full = false,
  topics: readonly SearchTopicHit[] = [],
): readonly string[] => {
  const lines: string[] = [];

  if (Option.isSome(result.locate)) {
    const target = result.locate.value;
    lines.push(`Reference: ${target.refcode} — ${target.bookTitle} (${target.bookCode})`);
    lines.push('');
  }

  if (topics.length > 0) {
    lines.push(`Topics (${String(topics.length)}):`);
    for (const topic of topics) {
      // `/wiki/<slug>`, which is the route `route/codec.ts` decodes. A bare
      // `/<slug>` is not a route this app has, so the printed link 404s.
      lines.push(`  • ${topic.title} [${topic.status}] — /wiki/${topic.slug}`);
    }
    lines.push('');
  }

  if (result.paragraphs.length === 0) {
    lines.push(`No results for "${result.query}".`);
  } else {
    lines.push(`Results for "${result.query}" (${String(result.paragraphs.length)}):`);
    lines.push('');
    for (const [index, hit] of result.paragraphs.entries()) {
      lines.push(formatSearchHit(hit, index, full));
    }
  }

  lines.push('');
  if (result.vector._tag === 'ran') {
    lines.push(
      `hybrid — ${String(result.vector.scanned)} vectors scanned (${result.vector.fingerprint})`,
    );
  } else {
    lines.push(formatVectorAbsence(result.vector.reason));
  }
  return lines;
};
