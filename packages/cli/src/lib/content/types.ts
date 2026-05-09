import type { Schema } from 'effect';

// Sort strategies as discriminated union
export type SortStrategy =
  | { readonly _tag: 'date-desc' }
  | { readonly _tag: 'chapter-asc' }
  | { readonly _tag: 'year-quarter-week' };

export interface ContentTypeConfig<F extends Schema.Top> {
  readonly name: string;
  readonly displayName: string;
  readonly outputDir: string;
  readonly notesFolder: string;
  readonly frontmatterSchema: F;
  readonly sortStrategy: SortStrategy;
}
