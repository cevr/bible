import { parseEGWRef, type EGWLocation } from '@bible/core/egw';

/** Resolve free-form input to the canonical location the EGW reader can open. */
export function parseEgwLocation(input: string): EGWLocation | undefined {
  const parsed = parseEGWRef(input);

  switch (parsed._tag) {
    case 'book':
    case 'page':
    case 'paragraph':
      return parsed;
    case 'page-range':
      return { _tag: 'page', bookCode: parsed.bookCode, page: parsed.pageStart };
    case 'paragraph-range':
      return {
        _tag: 'paragraph',
        bookCode: parsed.bookCode,
        page: parsed.page,
        paragraph: parsed.paragraphStart,
      };
    case 'search':
      return undefined;
  }
}
