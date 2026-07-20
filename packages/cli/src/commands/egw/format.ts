import { nodesToText, type Schemas as EGWSchemas } from '@bible/core/egw';
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

export const searchHitJson = (hit: SearchHit) => ({
  publication: publicationJson(hit.publication),
  paragraph: paragraphJson(hit.paragraph),
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
  const author = hit.refcode_long?.match(/\(([^)]+)\)\s*$/)?.[1];
  let authorSuffix = '';
  if (author !== undefined) {
    authorSuffix = ` — ${author}`;
  }
  const title = ` (${hit.pub_name}${authorSuffix})`;
  let snippet = '';
  if (hit.snippet !== null && hit.snippet !== undefined) {
    snippet = hit.snippet
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 240);
  }
  let gated = '';
  if (hit.action_required !== undefined) {
    gated = ` [${hit.action_required}]`;
  }
  return `  ${index + 1}. ${ref}${title}${gated}\n     ${snippet}`;
};
