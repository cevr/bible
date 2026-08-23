import type { ChapterReference, VerseReference } from '@bible/core/bible';
import type { TopicSlug } from '@bible/core/wiki';
import type {
  CorpusScope,
  PageReference,
  ParagraphReference,
  PublicationReference,
  WritingsBookCode,
} from '@bible/core/writings';
import type { Option } from 'effect';

export type BibleReadingReference = ChapterReference | VerseReference;
export type WritingsReadingReference = PublicationReference | PageReference | ParagraphReference;

export type SearchScope = 'all' | 'bible' | 'writings';
export type SettingsSection = 'reader' | 'sync' | 'data' | 'shortcuts' | 'about';

export type AppRoute =
  | { readonly _tag: 'bible'; readonly reference: BibleReadingReference }
  | { readonly _tag: 'writings-catalog' }
  | { readonly _tag: 'writings'; readonly reference: WritingsReadingReference }
  | {
      readonly _tag: 'search';
      readonly query: string;
      readonly scope: SearchScope;
      readonly books: readonly number[];
      /** §9.1's corpus scope, which narrows the *writings* partition rather
       *  than choosing between corpora — a different axis from `scope`, which
       *  picks Bible or writings in the first place. Absent means core's
       *  `SEARCH_DEFAULT_SCOPE`; the default is not restated here, so the two
       *  cannot drift.
       *
       *  §10 asks the query, scope and book narrowings to be *shared URL
       *  state*, so that a hybrid search on web and on desktop is the same
       *  link. That is what these two fields are for. */
      readonly corpus: Option.Option<CorpusScope>;
      /** §9's writings book code (`GC`, `DA`), not a Bible book number — the
       *  `books` field above is the Bible-side narrowing and they name
       *  different corpora's identifiers. */
      readonly bookCode: Option.Option<WritingsBookCode>;
    }
  | { readonly _tag: 'topics'; readonly topicId?: string }
  /** One wiki topic page (§5, §6.1). Distinct from `topics`, which is the older
   *  Nave's-style catalog browser: `/wiki/<slug>` is the composed layered page,
   *  and §11's "fate of the existing /topics route" is a decision this milestone
   *  does not make.
   *
   *  The **branded** `TopicSlug`, not a plain string, and that is what makes the
   *  route round-trippable by construction. A plain string admits the empty
   *  slug, which encodes to `/wiki/` — a path the decoder rejects, so the route
   *  could be *built* and then not decode back to itself. The brand's own schema
   *  forbids the empty slug, so constructing that route is a type error rather
   *  than a runtime asymmetry. The slug is required for the same reason it is
   *  branded: `/wiki` with no slug has nothing to compose. */
  | { readonly _tag: 'wiki'; readonly slug: TopicSlug }
  | { readonly _tag: 'plans'; readonly planId?: string }
  | { readonly _tag: 'practice'; readonly memoryVerseId?: string }
  | { readonly _tag: 'settings'; readonly section: SettingsSection }
  | { readonly _tag: 'not-found'; readonly requestedPath: string };

export type ReadingRoute = Extract<AppRoute, { readonly _tag: 'bible' | 'writings' }>;

export type NavigationIntent = 'intentional' | 'refinement';

export interface RouteHistory {
  readonly read: () => string;
  readonly push: (canonicalPath: string) => void;
  readonly replace: (canonicalPath: string) => void;
  readonly subscribe: (listener: (canonicalPath: string) => void) => () => void;
}
