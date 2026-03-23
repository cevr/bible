import type { Schema } from 'effect';

// Sort strategies as discriminated union
export type SortStrategy =
  | { readonly _tag: 'date-desc' }
  | { readonly _tag: 'chapter-asc' }
  | { readonly _tag: 'year-quarter-week' };

// Prompt resolver - handles multi-prompt content types
export type PromptResolver =
  | { readonly _tag: 'single'; readonly file: string }
  | { readonly _tag: 'from-filename'; readonly patterns: Record<string, string> };

export interface ContentTypeConfig<F extends Schema.Top> {
  readonly name: string;
  readonly displayName: string;
  readonly outputDir: string;
  readonly notesFolder: string;
  readonly promptResolver: PromptResolver;
  readonly frontmatterSchema: F;
  readonly sortStrategy: SortStrategy;
}
