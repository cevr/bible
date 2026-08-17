/** Which text a topic page's layered section offers the phrase overlay, and
 *  under which address (§4.5, §6.1).
 *
 *  §4.5's table names "each layered section of the page" as a section for the
 *  overlay, and the text it means is the **auto-mined** corpus text §6 composes:
 *  a key verse's KJV text, an EGW or pioneer snippet, a commentary paragraph, a
 *  cross-reference preview. Not the labels, and not the authored core — a
 *  refcode is a citation and a topic's own prose is about the topic it is on
 *  (see `wiki-blocks.tsx`).
 *
 *  Extracted from the JSX rather than inlined in it for two reasons that point
 *  the same way. The overlay needs one matcher pass per section *before* the
 *  section renders, so the projection has to be a value the page can compute
 *  ahead of the markup; and the §10 M6 acceptance claim — "`bible wiki topic
 *  2300-days --json` matches, section for section and identity for identity,
 *  what the UI renders" — is only testable if what the UI renders is a function
 *  a test can call on a decoded page. `wiki-page-identity.test.ts` calls this
 *  one.
 *
 *  The container is the unit's address inside its section, stable across
 *  renders: the item's position, which is the order the composer already fixed
 *  and no client re-sorts.
 */

import type { WikiSection } from '@bible/core/wiki';
import { Option } from 'effect';

import type { TextUnit } from './match-plan.js';

/** One item's address inside its section. Prefixed by the item's index so two
 *  items with identical text stay distinguishable, and suffixed by which of an
 *  item's fields it is, because a cross-reference has one and a commentary entry
 *  has one but a future item shape could have two. */
const unitId = (index: number, field: string): string => `${String(index)}:${field}`;

/** The overlay-eligible text of one section, in the order the section renders
 *  it. Empty for a section whose items carry no prose — related topics are
 *  titles and kinds, and a title is already a link. */
export const sectionTextUnits = (section: WikiSection): readonly TextUnit[] => {
  switch (section._tag) {
    case 'key-verses':
      return section.items.flatMap((passage, index) =>
        Option.match(passage.text, {
          onNone: (): readonly TextUnit[] => [],
          onSome: (text) => [{ container: unitId(index, 'text'), text }],
        }),
      );
    case 'egw-statements':
    case 'pioneer-witnesses':
      return section.items.flatMap((hit, index) =>
        Option.match(hit.snippet, {
          onNone: (): readonly TextUnit[] => [],
          onSome: (text) => [{ container: unitId(index, 'snippet'), text }],
        }),
      );
    case 'commentary':
      return section.items.map((entry, index) => ({
        container: unitId(index, 'content'),
        text: entry.content,
      }));
    case 'cross-references':
      return section.items.flatMap((reference, index) =>
        Option.match(reference.preview, {
          onNone: (): readonly TextUnit[] => [],
          onSome: (text) => [{ container: unitId(index, 'preview'), text }],
        }),
      );
    case 'related-topics':
      // A related topic already *is* a link to a topic page. A phrase overlay
      // over its title would be a second link to the same destination, which is
      // the "soup" §4.7's restraint exists to prevent.
      return [];
  }
};

/** The address the renderer looks a unit's spans up under. One function so the
 *  planner and the markup cannot spell the same unit two ways. */
export const textUnitId = unitId;
