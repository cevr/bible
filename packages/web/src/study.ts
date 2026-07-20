export * as Study from './study.js';

import { DateTime, Option, Schema } from 'effect';

/**
 * Studies are served at the site root (/<slug>/), so a slug must never shadow
 * the static namespaces the build emits there — or the redirect namespace the
 * server still honors for old QR codes and links.
 */
const RESERVED = new Set(['studies', 'comparisons', 'index', '404', 'styles']);

export const Slug = Schema.String.check(
  Schema.isNonEmpty(),
  Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { expected: 'a lowercase kebab-case slug' }),
  Schema.makeFilter<string>((slug) => {
    if (RESERVED.has(slug)) return `"${slug}" collides with a root-level site path`;
    return undefined;
  }),
).pipe(Schema.brand('Study.Slug'));
export type Slug = typeof Slug.Type;

/** A plain YYYY-MM-DD string that is also a real calendar date. */
const DateISO = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/, { expected: 'a YYYY-MM-DD date string' }),
  Schema.makeFilter<string>((s) => {
    const date = DateTime.make(s);
    if (Option.isNone(date) || DateTime.formatIsoDateUtc(date.value) !== s)
      return `"${s}" is not a valid calendar date`;
    return undefined;
  }),
);

export interface Meta extends Schema.Schema.Type<typeof Meta> {}
export const Meta = Schema.Struct({
  /** URL slug: the study is served at /<slug>/. */
  slug: Slug,
  /** Display title (may contain <em> for the oxblood italic accent). */
  title: Schema.NonEmptyString,
  /** One-line subtitle shown under the title and on the index card. */
  subtitle: Schema.NonEmptyString,
  /** 1-2 sentence description for the index card and <meta description>. */
  description: Schema.NonEmptyString,
  /** Small uppercase label over the card/masthead, e.g. "Bible Handbook Study". */
  eyebrow: Schema.NonEmptyString,
  /** ISO date shown on the card and masthead. */
  date: DateISO,
}).annotate({ identifier: 'Study.Meta' });

/**
 * A study markdown's YAML frontmatter as the builder sees it: a `site:` block
 * holding the card copy marks the file as published — its absence means the
 * file stays unpublished. Other frontmatter keys (created_at, topic,
 * apple_note_id, …) are ignored; a present-but-malformed `site:` block fails
 * the decode, and the build with it.
 */
export interface Frontmatter extends Schema.Schema.Type<typeof Frontmatter> {}
export const Frontmatter = Schema.Struct({
  site: Schema.optionalKey(Meta),
}).annotate({ identifier: 'Study.Frontmatter' });
