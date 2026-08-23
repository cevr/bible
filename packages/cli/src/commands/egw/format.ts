import { nodesToText, type Schemas as EGWSchemas } from '@bible/core/egw';
import type { SearchParagraphHit, SearchResult, VectorAbsenceReason } from '@bible/core/search';
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

export const formatLocalSearchResult = (hit: SearchHit, index: number): string => {
  const ref = paragraphRefcode(hit.paragraph);
  let title = '';
  if (hit.publication.title !== hit.publication.code) {
    title = ` (${hit.publication.title})`;
  }
  const text = nodesToText(hit.paragraph.nodes);
  let snippet = '(no content)';
  if (text.length > 0) {
    snippet = text.slice(0, 200);
    if (text.length > 200) {
      snippet += '…';
    }
  }
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
  return 'lexical only — this query routes straight to the text index';
};

const formatSearchHit = (hit: SearchParagraphHit, index: number): string => {
  const legs: string[] = [];
  if (Option.isSome(hit.lexicalRank)) legs.push(`text #${String(hit.lexicalRank.value)}`);
  if (Option.isSome(hit.vectorRank)) legs.push(`vector #${String(hit.vectorRank.value)}`);
  let provenance = '';
  if (legs.length > 0) {
    provenance = `  [${legs.join(', ')}]`;
  }
  let snippet = '(no content)';
  if (hit.snippet.length > 0) {
    snippet = hit.snippet.slice(0, 200);
    if (hit.snippet.length > 200) snippet += '…';
  }
  return `  ${String(index + 1)}. ${hit.refcode} (${hit.bookTitle} — ${hit.author})${provenance}\n     ${snippet}`;
};

/** The whole §9 result as lines, pinned topics first.
 *
 *  §9.4 ranks topic hits as a *pinned group above* the paragraph results rather
 *  than interleaving them, because a topic page and a paragraph answer different
 *  questions and a fused ordering would bury the page that summarizes what the
 *  paragraphs each say once. The printer keeps that structure visible. */
export const formatSearchResult = (result: SearchResult): readonly string[] => {
  const lines: string[] = [];

  if (Option.isSome(result.locate)) {
    const target = result.locate.value;
    lines.push(`Reference: ${target.refcode} — ${target.bookTitle} (${target.bookCode})`);
    lines.push('');
  }

  if (result.topics.length > 0) {
    lines.push(`Topics (${String(result.topics.length)}):`);
    for (const topic of result.topics) {
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
      lines.push(formatSearchHit(hit, index));
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
