import type { ChapterReference, VerseReference } from '@bible/core/bible';
import type { PageReference, ParagraphReference, PublicationReference } from '@bible/core/writings';

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
    }
  | { readonly _tag: 'topics'; readonly topicId?: string }
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
