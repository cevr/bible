/** What one topic-page section renders, item by item (§6.1).
 *
 *  `wiki-section-text.ts` already answers "which text does the overlay get".
 *  This module answers the larger question the section's markup is: **which
 *  items are drawn, in which order, and what does the reader see of each one**.
 *
 *  It exists because the parity claim §10 Milestone 6 makes — "`bible wiki topic
 *  2300-days --json` matches, section for section and identity for identity,
 *  what the UI renders" — was, until this module, only assertable about section
 *  *headings* and *postures*. The items were unreachable: this package's suites
 *  run under plain Bun with no DOM and Solid 2 compiles JSX through a Babel
 *  transform, so a mounted `WikiTopicPage` cannot be inspected from a unit test,
 *  and the per-section `Match` branches inside it were six pieces of markup a
 *  test could only take on trust. Deleting one left every suite green.
 *
 *  So the branches map over *this*. `wiki-topic-page.tsx` renders
 *  `sectionItems(section)` and nothing else — the projection is the JSX's own
 *  input, not a description of it kept alongside — which is what makes
 *  `wiki-page-identity.test.ts`'s walk over all six sections a statement about
 *  what the page draws.
 *
 *  **What an identity is.** The one line of the item the reader can point at and
 *  that the wire decides: a verse's label, a hit's refcode, a related topic's
 *  slug. Not the prose — that is the overlay's business, and
 *  `sectionTextUnits` is already the projection for it. The two together are the
 *  whole of what a section's markup draws from the model.
 */

import type {
  WikiCommentaryEntry,
  WikiCrossReference,
  WikiPassageRef,
  WikiRelatedTopic,
  WikiSection,
  WikiWritingsHit,
} from '@bible/core/wiki';

/** One rendered item, tagged by the component that draws it.
 *
 *  Tagged rather than a bare union of the model's own item types, because the
 *  section's `_tag` is not recoverable from an item once it is out of its
 *  section — `egw-statements` and `pioneer-witnesses` carry the same
 *  `WikiWritingsHit` — and the renderer picks its component per section, not per
 *  item shape. The tag is what a test reads to say *which* component the page
 *  drew, and what the JSX switches on so the two cannot drift.
 *
 *  `index` is the item's position in its section, which is the address
 *  `sectionTextUnits` mints its containers from. Carried on the item rather than
 *  recovered from `For`'s index accessor, so the markup and the overlay read one
 *  number. */
export type WikiRenderedItem =
  | { readonly kind: 'verse'; readonly index: number; readonly passage: WikiPassageRef }
  | { readonly kind: 'hit'; readonly index: number; readonly hit: WikiWritingsHit }
  | { readonly kind: 'commentary'; readonly index: number; readonly entry: WikiCommentaryEntry }
  | { readonly kind: 'reference'; readonly index: number; readonly reference: WikiCrossReference }
  | { readonly kind: 'related'; readonly index: number; readonly topic: WikiRelatedTopic };

/** The items one section draws, in the order the composer fixed and no client
 *  re-sorts. Total over `WikiSectionKind`: a seventh section added to the model
 *  is a compile error here rather than a silently blank disclosure. */
export const sectionItems = (section: WikiSection): readonly WikiRenderedItem[] => {
  switch (section._tag) {
    case 'key-verses':
      return section.items.map((passage, index) => ({ kind: 'verse', index, passage }));
    case 'egw-statements':
    case 'pioneer-witnesses':
      return section.items.map((hit, index) => ({ kind: 'hit', index, hit }));
    case 'commentary':
      return section.items.map((entry, index) => ({ kind: 'commentary', index, entry }));
    case 'cross-references':
      return section.items.map((reference, index) => ({ kind: 'reference', index, reference }));
    case 'related-topics':
      return section.items.map((topic, index) => ({ kind: 'related', index, topic }));
  }
};

/** The one line of an item the reader can point at, and that the wire decides.
 *
 *  A verse renders its label as the link text; a hit renders its refcode; a
 *  commentary entry renders both its verse label and its refcode, of which the
 *  refcode is the citation that names the row; a cross-reference renders its
 *  destination label; a related topic renders its title. */
export const renderedIdentity = (item: WikiRenderedItem): string => {
  switch (item.kind) {
    case 'verse':
      return item.passage.label;
    case 'hit':
      return item.hit.refcode;
    case 'commentary':
      return item.entry.refcode;
    case 'reference':
      return item.reference.to.label;
    case 'related':
      return item.topic.title;
  }
};
