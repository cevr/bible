import { parseParagraphContent, type Node } from '@bible/core/egw';
import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Path, Schema } from 'effect';

interface Paragraph {
  readonly para_id: string;
  readonly content: string;
}

const Paragraphs = Schema.Array(Schema.Struct({ para_id: Schema.String, content: Schema.String }));
const loadFixture = (name: string): Effect.Effect<readonly Paragraph[], unknown> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const fixturesDir = yield* path.fromFileUrl(new URL('fixtures/', import.meta.url));
    const text = yield* fs.readFileString(path.join(fixturesDir, name));
    return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Paragraphs))(text);
  }).pipe(Effect.provide(NodeServices.layer));

// Convenience: find a paragraph by id in a fixture, fail loudly if missing so
// fixture renames don't silently degrade the test.
const find = (
  paragraphs: readonly Paragraph[],
  paraId: string,
): Effect.Effect<Paragraph, string> => {
  const found = paragraphs.find((p) => p.para_id === paraId);
  if (found === undefined) return Effect.fail(`fixture missing para_id ${paraId}`);
  return Effect.succeed(found);
};

const concatText = (nodes: readonly Node[]): string =>
  nodes
    .map((n) => {
      switch (n._tag) {
        case 'Text':
          return n.text;
        case 'LineBreak':
          return '\n';
        case 'PageBreak':
          return '';
        default:
          return concatText(n.children);
      }
    })
    .join('');

describe('parseParagraphContent — PP Ch 3 fixture', () => {
  it.effect('parses plain h3 chapter title as a single Text node', () =>
    Effect.gen(function* () {
      const pp = yield* loadFixture('pp-chapter-3.json');
      const ast = parseParagraphContent((yield* find(pp, '84.155')).content);
      expect(ast).toEqual([{ _tag: 'Text', text: 'Chapter 3—The Temptation and Fall' }]);
    }),
  );

  it.effect('parses nested non-egw-comment wrapping an egwlink_bible scripture ref', () =>
    Effect.gen(function* () {
      const pp = yield* loadFixture('pp-chapter-3.json');
      const ast = parseParagraphContent((yield* find(pp, '84.3636')).content);
      expect(ast).toEqual([
        {
          _tag: 'Comment',
          children: [
            { _tag: 'Text', text: 'This chapter is based on ' },
            {
              _tag: 'ScriptureRef',
              title: 'Genesis 3:1',
              dataLink: '1965.119',
              children: [{ _tag: 'Text', text: 'Genesis 3' }],
            },
          ],
        },
        { _tag: 'Text', text: '.' },
      ]);
    }),
  );

  it.effect('emits PageBreak with parsed page number, no children, surrounded by text', () =>
    Effect.gen(function* () {
      const pp = yield* loadFixture('pp-chapter-3.json');
      const ast = parseParagraphContent((yield* find(pp, '84.164')).content);
      const pageBreak = ast.find((n) => n._tag === 'PageBreak');
      expect(pageBreak).toEqual({ _tag: 'PageBreak', page: 54 });
      // Verify the prose continues on either side: text just before and just after.
      const pbIndex = ast.findIndex((n) => n._tag === 'PageBreak');
      expect(ast[pbIndex - 1]?._tag).toBe('Text');
      expect(ast[pbIndex + 1]?._tag).toBe('Text');
    }),
  );
});

describe('parseParagraphContent — GC Ch 3 fixture', () => {
  it.effect('parses <em> with multi-word italic content as Emphasis', () =>
    Effect.gen(function* () {
      const gc = yield* loadFixture('gc-chapter-3.json');
      const ast = parseParagraphContent((yield* find(gc, '132.249')).content);
      const emphasis = ast.find((n) => n._tag === 'Emphasis');
      expect(emphasis).toBeDefined();
      expect(emphasis?._tag).toBe('Emphasis');
      if (emphasis?._tag !== 'Emphasis') return yield* Effect.die('unreachable');
      expect(emphasis.children).toEqual([
        {
          _tag: 'Text',
          text: 'The Real Presence of the Body and Blood of Our Lord Jesus Christ in the Blessed Eucharist, Proved From Scripture,',
        },
      ]);
    }),
  );

  it.effect('parses egwlink_book span as BookRef carrying title + dataLink', () =>
    Effect.gen(function* () {
      const gc = yield* loadFixture('gc-chapter-3.json');
      const ast = parseParagraphContent((yield* find(gc, '132.207')).content);
      const bookRef = ast.find((n) => n._tag === 'BookRef');
      expect(bookRef).toEqual({
        _tag: 'BookRef',
        title: 'GC 679',
        dataLink: '132.3067',
        children: [{ _tag: 'Text', text: 'Appendix' }],
      });
    }),
  );
});

describe('parseParagraphContent — invariants across all fixture paragraphs', () => {
  it.effect('never produces a node outside the closed AST union', () =>
    Effect.gen(function* () {
      const pp = yield* loadFixture('pp-chapter-3.json');
      const gc = yield* loadFixture('gc-chapter-3.json');
      const knownTags = new Set([
        'Text',
        'LineBreak',
        'PageBreak',
        'Emphasis',
        'Comment',
        'ScriptureRef',
        'BookRef',
        'Unknown',
      ]);
      const walk = (nodes: readonly Node[]): void => {
        for (const n of nodes) {
          expect(knownTags.has(n._tag)).toBe(true);
          if ('children' in n) walk(n.children);
        }
      };
      for (const p of [...pp, ...gc]) walk(parseParagraphContent(p.content));
    }),
  );

  it.effect(
    'never produces Unknown for current fixtures — if this fails the AST is missing a case',
    () =>
      Effect.gen(function* () {
        const pp = yield* loadFixture('pp-chapter-3.json');
        const gc = yield* loadFixture('gc-chapter-3.json');
        const unknownTags: string[] = [];
        const walk = (nodes: readonly Node[]): void => {
          for (const n of nodes) {
            if (n._tag === 'Unknown') unknownTags.push(`${n.tag}.${n.className}`);
            if ('children' in n) walk(n.children);
          }
        };
        for (const p of [...pp, ...gc]) walk(parseParagraphContent(p.content));
        expect(unknownTags).toEqual([]);
      }),
  );

  it.effect('never drops text — every fixture paragraph round-trips its visible text', () =>
    Effect.gen(function* () {
      const pp = yield* loadFixture('pp-chapter-3.json');
      // Strip HTML tags from source to get the "visible text" baseline, then
      // compare to AST concatenation. Catches dropped chunks from a buggy parser.
      const stripHtml = (s: string): string =>
        s
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          // The fixture HTML is already entity-decoded for character punctuation
          // (the source JSON contains curly quotes literally), so only & needs
          // care if it ever appears — none of the current paragraphs contain it.
          .trim();
      for (const p of pp) {
        const fromAst = concatText(parseParagraphContent(p.content)).trim();
        const fromSource = stripHtml(p.content);
        expect(fromAst, `para ${p.para_id} text mismatch`).toBe(fromSource);
      }
    }),
  );
});
