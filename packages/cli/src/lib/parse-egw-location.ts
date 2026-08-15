import { parseEGWRef, type EGWLocation } from '@bible/core/egw';
import { Option } from 'effect';

/** Resolve free-form input to the canonical location the EGW reader can open. */
export function parseEgwLocation(input: string): Option.Option<EGWLocation> {
  const parsed = parseEGWRef(input);

  switch (parsed._tag) {
    case 'book':
    case 'page':
    case 'paragraph':
      return Option.some(parsed);
    case 'page-range':
      return Option.some({ _tag: 'page', bookCode: parsed.bookCode, page: parsed.pageStart });
    case 'paragraph-range':
      return Option.some({
        _tag: 'paragraph',
        bookCode: parsed.bookCode,
        page: parsed.page,
        paragraph: parsed.paragraphStart,
      });
    case 'search':
      return Option.none();
  }
}
