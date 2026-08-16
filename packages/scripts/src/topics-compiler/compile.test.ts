// `normalizeAlias` is imported from core, where it is defined, rather than
// through a re-export the compiler kept only for this file. The claim these
// assertions make is that the compiler's keys and the matcher's keys come from
// one function, and importing the one function is how the test says so.
import { normalizeAlias, type Block, type Inline } from '@bible/core/wiki';
import { Cause, Effect, Exit, Option, Schema, SchemaGetter } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { compileTopics, type CatalogLookup, type ParagraphLookup } from './compile.js';
import { parseTopicSource, type TopicSource } from './source.js';

/** A writings database holding exactly the paragraphs a test declares. The
 *  compiler's citation pass is the whole point of these fixtures, so the
 *  approved pages here carry synthetic refcodes rather than depending on a
 *  developer having any particular EGW book installed. */
const paragraphs = (entries: Readonly<Record<string, readonly string[]>>): ParagraphLookup => ({
  paragraphsFor: (refcode) =>
    Effect.succeed(
      Option.getOrElse(Option.fromNullishOr(entries[refcode]), (): readonly string[] => []),
    ),
});

const catalog = (entries: Readonly<Record<string, readonly string[]>>): CatalogLookup => ({
  revision: 'test-revision',
  idsForName: (name) =>
    Effect.succeed(
      Option.getOrElse(
        Option.fromNullishOr(entries[name.toLowerCase()]),
        (): readonly string[] => [],
      ),
    ),
});

/** Renders a failed exit's tagged error — tag and fields both — so a test can
 *  assert which error the compiler raised and on which value, without
 *  pattern-matching every error shape by hand. `Cause.pretty` shows only the
 *  tag, and the field is exactly what these assertions are about. A successful
 *  exit renders empty, which fails the assertion the same way a wrong error
 *  would. */
const FailureText = Schema.encodeUnknownSync(
  Schema.Unknown.pipe(
    Schema.encodeTo(Schema.String, {
      decode: SchemaGetter.parseJson(),
      encode: SchemaGetter.stringifyJson(),
    }),
  ),
);

const renderFailure = (exit: Exit.Exit<unknown, unknown>): string =>
  Exit.match(exit, {
    onFailure: (cause) => `${Cause.pretty(cause)} ${FailureText(Cause.squash(cause))}`,
    onSuccess: () => '',
  });

const emptyCatalog = catalog({});
const noParagraphs = paragraphs({});

const source = (file: string, contents: string): Effect.Effect<TopicSource, unknown> =>
  parseTopicSource(file, contents);

const compile = (input: {
  readonly files: readonly (readonly [string, string])[];
  readonly paragraphs?: ParagraphLookup;
  readonly catalog?: CatalogLookup;
}) =>
  Effect.gen(function* () {
    const sources = yield* Effect.forEach(input.files, ([file, contents]) =>
      source(file, contents),
    );
    return yield* compileTopics({
      sources,
      paragraphs: Option.getOrElse(Option.fromNullishOr(input.paragraphs), () => noParagraphs),
      catalog: Option.getOrElse(Option.fromNullishOr(input.catalog), () => emptyCatalog),
    });
  });

const page = (input: {
  readonly slug: string;
  readonly title: string;
  readonly status?: string;
  readonly aliases?: readonly string[];
  readonly related?: readonly string[];
  readonly catalog?: string;
  readonly body?: string;
}) => {
  const lines = ['---', `slug: ${input.slug}`, `title: ${input.title}`];
  lines.push(`status: ${Option.getOrElse(Option.fromNullishOr(input.status), () => 'approved')}`);
  // An empty list is written as `[]`, not as a key with no entries: the latter
  // is YAML null, which the frontmatter schema rightly rejects. A test asserting
  // that an *emptied* list still moves the digest needs to be able to say so.
  const aliases = Option.fromNullishOr(input.aliases);
  if (Option.isSome(aliases)) {
    if (aliases.value.length === 0) lines.push('aliases: []');
    else {
      lines.push('aliases:');
      for (const alias of aliases.value) lines.push(`  - '${alias}'`);
    }
  }
  const related = Option.fromNullishOr(input.related);
  if (Option.isSome(related)) {
    if (related.value.length === 0) lines.push('related: []');
    else {
      lines.push('related:');
      for (const slug of related.value) lines.push(`  - ${slug}`);
    }
  }
  const catalogName = Option.fromNullishOr(input.catalog);
  if (Option.isSome(catalogName)) lines.push(`catalog: ${catalogName.value}`);
  lines.push(
    '---',
    '',
    Option.getOrElse(Option.fromNullishOr(input.body), () => 'A thesis paragraph.'),
  );
  return lines.join('\n');
};

describe('topics compiler', () => {
  it.effect('skips draft pages entirely', () =>
    Effect.gen(function* () {
      const compiled = yield* compile({
        files: [
          ['a.md', page({ slug: 'approved-one', title: 'Approved One' })],
          ['b.md', page({ slug: 'draft-one', title: 'Draft One', status: 'draft' })],
        ],
      });
      expect(compiled.topics.map((topic) => topic.slug)).toEqual(['approved-one']);
    }),
  );

  it.effect('lets a draft carry an alias an approved page also claims', () =>
    Effect.gen(function* () {
      // Proves the draft is dropped *before* the duplicate-alias rule runs, which
      // is what makes drafts genuinely inert rather than merely unpublished.
      const compiled = yield* compile({
        files: [
          ['a.md', page({ slug: 'sanctuary', title: 'Sanctuary', aliases: ['holy place'] })],
          [
            'b.md',
            page({
              slug: 'draft',
              title: 'Draft',
              status: 'draft',
              aliases: ['holy place'],
            }),
          ],
        ],
      });
      expect(compiled.topics).toHaveLength(1);
    }),
  );

  it.effect('rejects a duplicate alias across two approved topics', () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        compile({
          files: [
            ['a.md', page({ slug: 'one', title: 'One', aliases: ['cleansing of the sanctuary'] })],
            ['b.md', page({ slug: 'two', title: 'Two', aliases: ['Cleansing of the Sanctuary'] })],
          ],
        }),
      );
      expect(Exit.isFailure(exit)).toBe(true);
      const failure = renderFailure(exit);
      expect(failure).toContain('DuplicateAliasError');
      // Normalization is what makes the two spellings collide.
      expect(failure).toContain('cleansing of the sanctuary');
    }),
  );

  it.effect('rejects a citation whose quoted text is absent from the cited refcode', () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        compile({
          files: [
            [
              'a.md',
              page({
                slug: 'one',
                title: 'One',
                body: 'As it says, {{GC 425.1|a sentence never written}}.',
              }),
            ],
          ],
          paragraphs: paragraphs({ 'GC 425.1': ['An entirely different sentence.'] }),
        }),
      );
      expect(Exit.isFailure(exit)).toBe(true);
      const failure = renderFailure(exit);
      expect(failure).toContain('CitationUnverifiedError');
      expect(failure).toContain('quoted text does not appear');
    }),
  );

  it.effect('rejects a citation whose refcode resolves to nothing', () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        compile({
          files: [
            ['a.md', page({ slug: 'one', title: 'One', body: '{{NOPE 1.1|anything at all}}' })],
          ],
        }),
      );
      expect(Exit.isFailure(exit)).toBe(true);
      expect(renderFailure(exit)).toContain('resolves to no paragraph');
    }),
  );

  it.effect('accepts a citation whose quote appears with different punctuation', () =>
    Effect.gen(function* () {
      // Authors retype quotes; EGW source text uses typographic punctuation. The
      // pass must catch fabrication without failing honest transcription.
      const compiled = yield* compile({
        files: [
          [
            'a.md',
            page({
              slug: 'one',
              title: 'One',
              body: "{{GC 425.1|the Lord's people were waiting}}",
            }),
          ],
        ],
        paragraphs: paragraphs({
          'GC 425.1': ['Then the Lord’s   people were waiting for the promise.'],
        }),
      });
      expect(compiled.topics).toHaveLength(1);
    }),
  );

  it.effect('treats overlay ambiguity as a compile error', () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        compile({
          files: [['a.md', page({ slug: 'judgment', title: 'Judgment' })]],
          catalog: catalog({
            judgment: ['naves-topical-bible.judgment', 'naves-topical-bible.judgments'],
          }),
        }),
      );
      expect(Exit.isFailure(exit)).toBe(true);
      expect(renderFailure(exit)).toContain('OverlayAmbiguityError');
    }),
  );

  it.effect('records an override overlay key as override and a name match as name', () =>
    Effect.gen(function* () {
      const compiled = yield* compile({
        files: [
          ['a.md', page({ slug: 'ij', title: 'Investigative Judgment', catalog: 'JUDGMENT' })],
          ['b.md', page({ slug: 'sanctuary', title: 'Sanctuary' })],
        ],
        catalog: catalog({
          judgment: ['naves-topical-bible.judgment'],
          sanctuary: ['naves-topical-bible.sanctuary'],
        }),
      });
      expect(compiled.catalogKeys).toEqual([
        { slug: 'ij', catalogId: 'naves-topical-bible.judgment', matchedBy: 'override' },
        { slug: 'sanctuary', catalogId: 'naves-topical-bible.sanctuary', matchedBy: 'name' },
      ]);
    }),
  );

  it.effect('leaves a topic with no catalog match unkeyed rather than failing', () =>
    Effect.gen(function* () {
      const compiled = yield* compile({
        files: [['a.md', page({ slug: 'one', title: 'Nowhere In Naves' })]],
      });
      expect(compiled.catalogKeys).toEqual([]);
      expect(compiled.topics).toHaveLength(1);
    }),
  );

  it.effect('rejects a related slug that names no approved page', () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        compile({
          files: [['a.md', page({ slug: 'one', title: 'One', related: ['does-not-exist'] })]],
        }),
      );
      expect(Exit.isFailure(exit)).toBe(true);
      expect(renderFailure(exit)).toContain('UnknownRelatedSlugError');
    }),
  );

  it.effect('derives a flagship backlink from a phrase in another page body', () =>
    Effect.gen(function* () {
      const compiled = yield* compile({
        files: [
          [
            'a.md',
            page({ slug: 'sanctuary', title: 'Sanctuary', aliases: ['heavenly sanctuary'] }),
          ],
          [
            'b.md',
            page({
              slug: 'atonement',
              title: 'Atonement',
              body: 'The work proceeds in the heavenly sanctuary above.',
            }),
          ],
        ],
      });
      expect(compiled.edges).toContainEqual({
        from: 'atonement',
        to: 'sanctuary',
        kind: 'backlink',
        position: 0,
      });
    }),
  );

  it.effect('does not duplicate an authored edge as a backlink', () =>
    Effect.gen(function* () {
      const compiled = yield* compile({
        files: [
          ['a.md', page({ slug: 'sanctuary', title: 'Sanctuary' })],
          [
            'b.md',
            page({
              slug: 'atonement',
              title: 'Atonement',
              related: ['sanctuary'],
              body: 'A study of the sanctuary.',
            }),
          ],
        ],
      });
      const toSanctuary = compiled.edges.filter((edge) => edge.to === 'sanctuary');
      expect(toSanctuary).toEqual([
        { from: 'atonement', to: 'sanctuary', kind: 'authored', position: 0 },
      ]);
    }),
  );

  it.effect('does not create a backlink from a phrase inside a longer word', () =>
    Effect.gen(function* () {
      const compiled = yield* compile({
        files: [
          ['a.md', page({ slug: 'law', title: 'Law' })],
          ['b.md', page({ slug: 'other', title: 'Other', body: 'They were lawless and unruly.' })],
        ],
      });
      expect(compiled.edges).toEqual([]);
    }),
  );

  it.effect('rejects two files claiming one slug', () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        compile({
          files: [
            ['a.md', page({ slug: 'same', title: 'First' })],
            ['b.md', page({ slug: 'same', title: 'Second' })],
          ],
        }),
      );
      expect(Exit.isFailure(exit)).toBe(true);
      expect(renderFailure(exit)).toContain('DuplicateSlugError');
    }),
  );

  it.effect('produces a valid empty result for a draft-only content set', () =>
    Effect.gen(function* () {
      // This is exactly the shipped v1 state: forty drafts, nothing approved. The
      // compile must succeed and the artifact must be honestly empty.
      const compiled = yield* compile({
        files: [
          ['a.md', page({ slug: 'one', title: 'One', status: 'draft' })],
          ['b.md', page({ slug: 'two', title: 'Two', status: 'draft' })],
        ],
      });
      expect(compiled.topics).toEqual([]);
      expect(compiled.aliases).toEqual([]);
      expect(compiled.edges).toEqual([]);
      expect(compiled.schemaMajor).toBe(1);
    }),
  );

  it.effect('gives every page a canonical alias derived from its title', () =>
    Effect.gen(function* () {
      const compiled = yield* compile({
        files: [['a.md', page({ slug: 'the-daily', title: 'The Daily' })]],
      });
      expect(compiled.aliases).toEqual([
        { alias: 'the daily', display: 'The Daily', slug: 'the-daily', canonical: true },
      ]);
    }),
  );

  it.effect('tolerates a page repeating its own title in aliases', () =>
    Effect.gen(function* () {
      const compiled = yield* compile({
        files: [['a.md', page({ slug: 'sabbath', title: 'Sabbath', aliases: ['sabbath'] })]],
      });
      expect(compiled.aliases).toHaveLength(1);
      expect(compiled.aliases[0]?.canonical).toBe(true);
    }),
  );

  it.effect('orders topics stably regardless of file order', () =>
    Effect.gen(function* () {
      const forward = yield* compile({
        files: [
          ['a.md', page({ slug: 'beta', title: 'Beta' })],
          ['b.md', page({ slug: 'alpha', title: 'Alpha' })],
        ],
      });
      const reversed = yield* compile({
        files: [
          ['b.md', page({ slug: 'alpha', title: 'Alpha' })],
          ['a.md', page({ slug: 'beta', title: 'Beta' })],
        ],
      });
      expect(forward.topics.map((topic) => topic.slug)).toEqual(['alpha', 'beta']);
      expect(forward.sourceDigest).toBe(reversed.sourceDigest);
    }),
  );
});

describe('alias normalization', () => {
  it.effect('collapses case, whitespace, and soft punctuation', () =>
    Effect.sync(() => {
      expect(normalizeAlias('  The   Daily,  ')).toBe('the daily');
      expect(normalizeAlias('Cleansing of the Sanctuary')).toBe('cleansing of the sanctuary');
    }),
  );

  it.effect('normalizes exactly the §4.3 set and nothing more', () =>
    Effect.sync(() => {
      // §4.3 allows case, whitespace, and soft punctuation (commas and
      // semicolons) only. Stripping an apostrophe would fold two genuinely
      // different phrases onto one dictionary key.
      expect(normalizeAlias("the Lord's Day")).toBe("the lord's day");
      expect(normalizeAlias('The 2300 Days: A Study')).toBe('the 2300 days: a study');
      expect(normalizeAlias('Faith, Hope; Love')).toBe('faith hope love');
      // A soft mark between words must not weld them together.
      expect(normalizeAlias('sanctuary,cleansing')).toBe('sanctuary cleansing');
    }),
  );
});

describe('content revision digest', () => {
  /** Every authored frontmatter field, and the body, must move the digest:
   *  `content_revision` is derived from it, and an unchanged revision tells the
   *  supply pipeline the installed artifact is already current — so a field the
   *  digest ignores is a field an edit to which never reaches a host. */
  interface Page {
    readonly slug: string;
    readonly title: string;
    readonly status?: string;
    readonly aliases?: readonly string[];
    readonly related?: readonly string[];
    readonly catalog?: string;
    readonly body?: string;
  }

  const base: Page = {
    slug: 'sanctuary',
    title: 'Sanctuary',
    aliases: ['holy place'],
    related: ['other'],
    catalog: 'Sanctuary',
    body: 'A thesis paragraph.',
  };

  const digestOf = (overrides: Partial<Page>) =>
    compile({
      files: [
        ['a.md', page({ ...base, ...overrides })],
        // Companion pages so every `related` entry names a real approved slug.
        ['b.md', page({ slug: 'other', title: 'Other' })],
        ['c.md', page({ slug: 'third', title: 'Third' })],
      ],
      catalog: catalog({ sanctuary: ['naves-topical-bible.sanctuary'] }),
    }).pipe(Effect.map((compiled) => compiled.sourceDigest));

  const changes: readonly (readonly [string, Partial<Page>])[] = [
    ['title', { title: 'The Sanctuary' }],
    ['aliases', { aliases: ['holy place', 'most holy'] }],
    ['related', { related: ['other', 'third'] }],
    ['catalog', { catalog: 'Tabernacle' }],
    ['body', { body: 'A different thesis.' }],
  ];

  for (const [field, override] of changes) {
    it.effect(`changes when ${field} changes`, () =>
      Effect.gen(function* () {
        const before = yield* digestOf({});
        const after = yield* digestOf(override);
        expect(after).not.toBe(before);
      }),
    );
  }

  it.effect('changes when status changes', () =>
    Effect.gen(function* () {
      // Dropping the page to draft removes it from the artifact entirely, which
      // must be a different content set than one carrying it.
      const before = yield* digestOf({});
      const after = yield* digestOf({ status: 'draft' });
      expect(after).not.toBe(before);
    }),
  );

  it.effect('is stable when nothing changes', () =>
    Effect.gen(function* () {
      expect(yield* digestOf({})).toBe(yield* digestOf({}));
    }),
  );

  it.effect('distinguishes one joined alias from two split aliases', () =>
    Effect.gen(function* () {
      // Length-prefixing is what keeps ['ab'] and ['a','b'] apart; plain
      // concatenation would hash both to the same bytes.
      const joined = yield* digestOf({ aliases: ['ab'] });
      const split = yield* digestOf({ aliases: ['a', 'b'] });
      expect(joined).not.toBe(split);
    }),
  );

  it.effect('distinguishes a value in `aliases` from the same value in `related`', () =>
    Effect.gen(function* () {
      // Flattening the two lists into one run of values let a value migrate
      // between fields for free: the digest saw the values `x` then `target`
      // either way. That is a real edit — it moves a phrase out of the
      // dictionary and turns it into an edge — reaching no host, because the
      // unchanged revision reads as "already current".
      //
      // Compiled without the shared companions: `target` must be a real slug for
      // the `related` half and must not also be some other page's canonical
      // alias, or the compile fails on a duplicate alias before the digest.
      const digest = (source: {
        readonly aliases: readonly string[];
        readonly related: readonly string[];
      }) =>
        compile({
          files: [
            ['a.md', page({ slug: 'sanctuary', title: 'Sanctuary', ...source })],
            ['b.md', page({ slug: 'target', title: 'Some Other Title' })],
          ],
        }).pipe(Effect.map((compiled) => compiled.sourceDigest));

      const asRelated = yield* digest({ aliases: ['x'], related: ['target'] });
      const asAlias = yield* digest({ aliases: ['x', 'target'], related: [] });
      expect(asAlias).not.toBe(asRelated);
    }),
  );

  it.effect('distinguishes an empty list from an absent one across fields', () =>
    Effect.gen(function* () {
      // The counts are hashed per field, so moving every entry out of `related`
      // is visible even though the surviving values are unchanged.
      const both = yield* digestOf({ aliases: ['a'], related: ['other'] });
      const onlyAliases = yield* digestOf({ aliases: ['a'], related: [] });
      expect(onlyAliases).not.toBe(both);
    }),
  );

  it.effect('distinguishes a title from an alias of the same text', () =>
    Effect.gen(function* () {
      const asTitle = yield* digestOf({ title: 'Holy Place', aliases: [] });
      const asAlias = yield* digestOf({ title: 'Sanctuary', aliases: ['Holy Place'] });
      expect(asTitle).not.toBe(asAlias);
    }),
  );
});

describe('citation text', () => {
  it.effect('rejects a citation with a blank quote', () =>
    Effect.gen(function* () {
      // An empty quote is a substring of every paragraph, so it would verify
      // against any refcode at all — the exact guarantee §3.4 step 6 makes.
      const exit = yield* Effect.exit(
        compile({
          files: [['a.md', page({ slug: 'one', title: 'One', body: 'Bad {{GC 425.1|}} here.' })]],
          paragraphs: paragraphs({ 'GC 425.1': ['Any paragraph at all.'] }),
        }),
      );
      expect(Exit.isFailure(exit)).toBe(true);
      const failure = renderFailure(exit);
      expect(failure).toContain('CitationUnverifiedError');
      expect(failure).toContain('citation quotes no text');
    }),
  );

  it.effect('rejects a citation whose quote is only punctuation', () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        compile({
          files: [
            ['a.md', page({ slug: 'one', title: 'One', body: 'Bad {{GC 425.1|  ...  }} here.' })],
          ],
          // The paragraph *does* contain the ellipsis, so a naive substring
          // check finds it and the citation "verifies". That is the whole
          // defect: the rule must reject the quote for carrying no text, not
          // pass by the accident of the paragraph lacking the punctuation.
          paragraphs: paragraphs({ 'GC 425.1': ['Any paragraph ... at all.'] }),
        }),
      );
      expect(Exit.isFailure(exit)).toBe(true);
      const failure = renderFailure(exit);
      expect(failure).toContain('CitationUnverifiedError');
      expect(failure).toContain('citation quotes no text');
      expect(failure).toContain('"slug":"one"');
    }),
  );

  it.effect('rejects a punctuation-only quote against a paragraph of pure punctuation', () =>
    Effect.gen(function* () {
      // The extreme case of the same defect: every character of the quote is in
      // the paragraph, so substring verification is a tautology.
      const exit = yield* Effect.exit(
        compile({
          files: [['a.md', page({ slug: 'two', title: 'Two', body: 'Bad {{GC 1.1|—}} here.' })]],
          paragraphs: paragraphs({ 'GC 1.1': ['— — —'] }),
        }),
      );
      expect(Exit.isFailure(exit)).toBe(true);
      const failure = renderFailure(exit);
      expect(failure).toContain('citation quotes no text');
      expect(failure).toContain('"slug":"two"');
    }),
  );

  it.effect('accepts a quote that carries a digit but no letter', () =>
    Effect.gen(function* () {
      // The rule is "asserts something", not "contains prose": a year or a verse
      // count is a real claim about what the paragraph says.
      const compiled = yield* compile({
        files: [['a.md', page({ slug: 'one', title: 'One', body: '{{GC 425.1|1844}}' })]],
        paragraphs: paragraphs({ 'GC 425.1': ['The year 1844 closed the prophecy.'] }),
      });
      expect(compiled.topics.length).toBe(1);
    }),
  );
});

/** The pre-pass runs before CommonMark, so it has to honour the two places
 *  CommonMark keeps text literal — code, and backslash escapes. Without that it
 *  rewrites the very text an author marked as "show this, do not use it". */
describe('protected markdown', () => {
  /** Counts the inline nodes of one tag across a compiled page's thesis. Reads
   *  the typed tree rather than a rendered string, so a test says exactly which
   *  node kind it means. */
  const tagCount = (blocks: readonly Block[], tag: Inline['_tag']): number => {
    let found = 0;
    const walk = (content: readonly Inline[]): void => {
      for (const node of content) if (node._tag === tag) found += 1;
    };
    for (const block of blocks) {
      if (block._tag === 'list') {
        for (const item of block.items) walk(item);
        continue;
      }
      walk(block.content);
    }
    return found;
  };

  const countIn = (body: string, tag: Inline['_tag']) =>
    compile({ files: [['a.md', page({ slug: 'one', title: 'One', body })]] }).pipe(
      Effect.map((compiled) => tagCount(compiled.topics[0]?.thesis ?? [], tag)),
    );

  const scriptureCount = (body: string) => countIn(body, 'scripture');

  it.effect('leaves a reference inside inline code literal', () =>
    Effect.gen(function* () {
      expect(yield* scriptureCount('Write `[[Dan 8:14]]` to link a verse.')).toBe(0);
    }),
  );

  it.effect('leaves a backslash-escaped reference literal', () =>
    Effect.gen(function* () {
      expect(yield* scriptureCount('Write \\[[Dan 8:14]] to link a verse.')).toBe(0);
    }),
  );

  it.effect('leaves a reference inside a fenced code block literal', () =>
    Effect.gen(function* () {
      expect(yield* scriptureCount('Example:\n\n```\n[[Dan 8:14]]\n```\n')).toBe(0);
    }),
  );

  it.effect('leaves a citation inside inline code literal', () =>
    Effect.gen(function* () {
      // Unprotected, this became a real citation and the compile then failed on
      // a refcode with no paragraph — a build broken by prose about syntax.
      expect(yield* countIn('Write `{{GC 425.1|quote}}`.', 'citation')).toBe(0);
    }),
  );

  it.effect('still converts a reference in ordinary prose', () =>
    Effect.gen(function* () {
      expect(yield* scriptureCount('The 2300 days of [[Dan 8:14]] end in 1844.')).toBe(1);
    }),
  );

  it.effect('converts a reference after an unclosed backtick', () =>
    Effect.gen(function* () {
      // An unclosed backtick opens no code span in CommonMark, so it protects
      // nothing and the reference is live.
      expect(yield* scriptureCount('A ` stray tick and [[Dan 8:14]] after it.')).toBe(1);
    }),
  );

  it.effect('converts a reference after a fenced block closes', () =>
    Effect.gen(function* () {
      expect(yield* scriptureCount('```\n[[Dan 8:14]]\n```\n\nThen [[Rev 14:7]] follows.')).toBe(1);
    }),
  );
});
