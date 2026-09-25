/** Back matter: the apparatus at the end of a book rather than its text.
 *
 *  An appendix, a table of contents, a bibliography or an index names the
 *  subject a query asks about without discussing it. `1EGWLM 962.55` is the
 *  line "Latter rain, 178, 300, 306, 320, 324, 326, 333, 660" — a subject-index
 *  entry that BM25 scores near-perfectly for `latter rain`, because it is short
 *  and holds both words. A reader wants the pages it points to, not the entry.
 *
 *  The corpus marks no paragraph as back matter, but it does keep each book's
 *  outline: every heading, in publication order. A paragraph is back matter
 *  when a heading it sits under is titled as back matter — see
 *  `backMatterClassifier` for how the outline is read. That is an outline walk,
 *  so it is decided here, over the `h1`–`h3` outline of the books a search
 *  returned and each hit's nearest heading, rather than per row in SQL.
 */
import { Option } from 'effect';

import type { NearestHeading, SectionHeading } from '../egw-db/book-database.js';

/** Section titles that are always back matter, whole-title matches only.
 *
 *  Whole-title, because the short words recur inside real titles: "Words Are
 *  an Index, September 27" is a devotional reading, and "Notes of Travel" is a
 *  chapter. Measured over the corpus's `h1`–`h3` headings. */
const WHOLE_TITLES: ReadonlySet<string> = new Set([
  'contents',
  'table of contents',
  'index',
  'general index',
  'glossary',
  'notes',
  'endnotes',
  'bibliography',
  'selected bibliography',
  'selective bibliography',
  'appendixes',
  'appendices',
]);

/** Section titles that are back matter by how they start or end.
 *
 *  - `Appendix`, `Appendix A`, `Appendix II`, `Appendix—Solemn Warnings…`
 *  - `Index of Texts`, `Index of Scriptures Quoted`, `Index of Authors`
 *  - `Bibliography of Works Cited`
 *  - `List of Illustrations`, `List of Maps`, `List of Correspondents`
 *  - `EGW Scripture Index Vol. 1-4`, `Nave's Topical Index` */
const TITLE_PATTERNS: readonly RegExp[] = [
  /^appendix(?:$|[\s—–:-])/u,
  /^index of\s/u,
  /^bibliography of\s/u,
  /^list of (?:illustrations|maps|correspondents|abbreviations)\b/u,
  /\b(?:scripture|scriptural|topical|subject) index\b/u,
];

/** Whether a section title names back matter. */
export const isBackMatterTitle = (title: string): boolean => {
  const normalized = title.trim().toLowerCase().replace(/\.$/u, '');
  if (WHOLE_TITLES.has(normalized)) return true;
  return TITLE_PATTERNS.some((pattern) => pattern.test(normalized));
};

/** Where one book's outline changes: from this heading on, a paragraph sits
 *  under it until the next mark. */
interface Mark {
  readonly puborder: number;
  /** Whether the paragraph sits under a back-matter heading at all. */
  readonly underBackMatter: boolean;
  /** Whether that back matter is the book's tail. */
  readonly inTail: boolean;
}

/** A heading's level when it opens prose, and no level when it is back matter. */
const proseLevel = (heading: SectionHeading): number => {
  if (isBackMatterTitle(heading.title)) return Number.POSITIVE_INFINITY;
  return heading.level;
};

/** One book's outline as marks, in publication order.
 *
 *  A stack of the open headings: a heading closes every open heading at its
 *  level or deeper. A back-matter heading is in the book's *tail* when no
 *  other heading at its level or shallower follows it: `Appendix A`,
 *  `Bibliography`, `List of Correspondents` at the end of `1EGWLM` are the
 *  tail, and the `List of Illustrations` before the letters is not. */
const marksOf = (headings: readonly SectionHeading[]): readonly Mark[] => {
  const ordered = headings.toSorted((a, b) => a.puborder - b.puborder);
  // From the end, carrying the shallowest level of any heading that is not
  // back matter: a back-matter heading is tail when nothing that shallow follows.
  const inTail = ordered.reduceRight<{ readonly shallowest: number; readonly tail: boolean[] }>(
    (state, heading) => {
      const backMatter = isBackMatterTitle(heading.title);
      return {
        shallowest: Math.min(state.shallowest, proseLevel(heading)),
        tail: [backMatter && state.shallowest > heading.level, ...state.tail],
      };
    },
    { shallowest: Number.POSITIVE_INFINITY, tail: [] },
  ).tail;
  const open: { readonly level: number; readonly backMatter: boolean; readonly inTail: boolean }[] =
    [];
  return ordered.map((heading, index) => {
    while (open.length > 0 && (open.at(-1)?.level ?? 0) >= heading.level) open.pop();
    open.push({
      level: heading.level,
      backMatter: isBackMatterTitle(heading.title),
      inTail: inTail[index] ?? false,
    });
    return {
      puborder: heading.puborder,
      underBackMatter: open.some((entry) => entry.backMatter),
      inTail: open.some((entry) => entry.inTail),
    };
  });
};

/** The last mark at or before `puborder`. A book's outline is at most ~1,300
 *  headings, so a scan from the end is enough. */
const markAt = (marks: readonly Mark[], puborder: number): Option.Option<Mark> =>
  Option.fromNullishOr(marks.findLast((mark) => mark.puborder <= puborder));

/** Decides back matter for the paragraphs of the books whose outline it was
 *  given, from each paragraph's nearest heading of any level.
 *
 *  - Under tail back matter: back matter, whatever deeper headings intervene —
 *    an index's `A`, `B`, `C` dividers, a scripture index's `Genesis`, an
 *    appendix's `Note 3`.
 *  - Under back matter that is not the tail: back matter only while no deeper
 *    heading intervenes. The corpus's outline is lossy — `1EGWLM`'s letters are
 *    `h4` headings straight after the `h3` `List of Illustrations`, with no part
 *    heading between — so a front list covers its own lines and no more.
 *  - Anywhere else, or before a book's first heading: not back matter. */
export const backMatterClassifier = (
  outline: readonly SectionHeading[],
  nearest: readonly NearestHeading[],
): ((publicationId: number, puborder: number) => boolean) => {
  const byBook = Map.groupBy(outline, (heading) => heading.publicationId);
  const marks = new Map([...byBook].map(([book, rows]) => [book, marksOf(rows)]));
  const closest = new Map(
    nearest.map((entry) => [
      `${String(entry.publicationId)}:${String(entry.puborder)}`,
      entry.heading,
    ]),
  );
  return (publicationId, puborder) =>
    Option.match(markAt(marks.get(publicationId) ?? [], puborder), {
      onNone: () => false,
      onSome: (mark) => {
        if (!mark.underBackMatter) return false;
        if (mark.inTail) return true;
        return Option.match(
          Option.fromNullishOr(closest.get(`${String(publicationId)}:${String(puborder)}`)),
          {
            onNone: () => false,
            onSome: (heading) => heading.level <= 3 || isBackMatterTitle(heading.title),
          },
        );
      },
    });
};
