import { nodesToText, type Schemas as EGWSchemas } from '@bible/core/egw';
import type { Paragraph, Publication, SearchHit } from '@bible/core/writings';
import { Option } from 'effect';

export const paragraphRefcode = (paragraph: Paragraph): string =>
  Option.getOrElse(paragraph.reference.refcode, () => `[${paragraph.reference.publication}]`);

export const publicationJson = (publication: Publication) => ({
  id: publication.id,
  code: publication.code,
  title: publication.title,
  author: publication.author,
  paragraphCount: Option.getOrNull(publication.paragraphCount),
});

export const paragraphJson = (paragraph: Paragraph) => ({
  reference: {
    publication: paragraph.reference.publication,
    order: paragraph.reference.order,
    page: Option.getOrNull(paragraph.reference.page),
    number: Option.getOrNull(paragraph.reference.number),
    refcode: Option.getOrNull(paragraph.reference.refcode),
  },
  paragraphId: Option.getOrNull(paragraph.paragraphId),
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
  const title = hit.publication.title !== hit.publication.code ? ` (${hit.publication.title})` : '';
  const text = nodesToText(hit.paragraph.nodes);
  const snippet =
    text.length > 0 ? text.slice(0, 200) + (text.length > 200 ? '…' : '') : '(no content)';
  return `  ${index + 1}. ${ref}${title}\n     ${snippet}`;
};

export const formatRemoteHit = (hit: EGWSchemas.SearchHit, index: number): string => {
  const ref = hit.refcode_short ?? `[${hit.pub_code}]`;
  const author = hit.refcode_long?.match(/\(([^)]+)\)\s*$/)?.[1];
  const title = ` (${hit.pub_name}${author !== undefined ? ` — ${author}` : ''})`;
  const snippet =
    hit.snippet !== null && hit.snippet !== undefined
      ? hit.snippet
          .replace(/<[^>]*>/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 240)
      : '';
  const gated = hit.action_required !== undefined ? ` [${hit.action_required}]` : '';
  return `  ${index + 1}. ${ref}${title}${gated}\n     ${snippet}`;
};
