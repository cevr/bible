import { marked } from 'marked';

/*
 * Centralized markdown -> HTML converter. The extractor stores body content
 * verbatim from the source markdown (bold, italic, links, lists). Each
 * component pipes that string through here at build time.
 */

marked.setOptions({
  gfm: true,
  breaks: false,
});

export function md(text: string | null | undefined): string {
  if (!text) return '';
  return marked.parse(text, { async: false });
}

export function mdInline(text: string | null | undefined): string {
  if (!text) return '';
  return marked.parseInline(text, { async: false });
}
