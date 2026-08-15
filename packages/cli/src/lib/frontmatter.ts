import matter from 'gray-matter';

/**
 * The value shape YAML frontmatter can carry once parsed. Nullable YAML values
 * are not part of the contract — absent keys model absence.
 */
export type FrontmatterValue =
  | string
  | number
  | boolean
  | ReadonlyArray<FrontmatterValue>
  | { readonly [key: string]: FrontmatterValue };

export type Frontmatter = Record<string, FrontmatterValue>;

export interface MessageFrontmatter {
  created_at: string;
  topic: string;
  apple_note_id?: string;
}

export interface ParsedMarkdown<T = Frontmatter> {
  frontmatter: T;
  content: string;
}

/**
 * Parse frontmatter from markdown content.
 * Returns the frontmatter data and the content without frontmatter.
 */
export function parseFrontmatter<T = Frontmatter>(markdown: string): ParsedMarkdown<T> {
  const { data, content } = matter(markdown);
  return {
    frontmatter: data as T,
    content: content.trim(),
  };
}

/**
 * Stringify frontmatter and content back to markdown.
 */
export function stringifyFrontmatter(frontmatter: Frontmatter, content: string): string {
  return matter.stringify(content, frontmatter);
}

/**
 * Check if markdown content has frontmatter.
 */
export function hasFrontmatter(markdown: string): boolean {
  return markdown.trimStart().startsWith('---');
}

/**
 * Update specific frontmatter fields while preserving existing ones.
 */
export function updateFrontmatter(markdown: string, updates: Frontmatter): string {
  const { frontmatter, content } = parseFrontmatter(markdown);
  const updatedFrontmatter = { ...frontmatter, ...updates };
  return stringifyFrontmatter(updatedFrontmatter, content);
}

/**
 * Remove specific frontmatter fields.
 */
export function removeFrontmatterFields(markdown: string, fields: string[]): string {
  const { frontmatter, content } = parseFrontmatter(markdown);
  const updated = { ...frontmatter };
  for (const field of fields) {
    delete updated[field];
  }
  return stringifyFrontmatter(updated, content);
}
