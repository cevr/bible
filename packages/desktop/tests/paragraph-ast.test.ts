import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseParagraphContent, type Node } from '../src/services/paragraph-ast.js';

interface Paragraph {
  readonly para_id: string;
  readonly content: string;
}

const fixturesDir = path.join(__dirname, 'fixtures');
const loadFixture = async (name: string): Promise<readonly Paragraph[]> => {
  const text = await fs.readFile(path.join(fixturesDir, name), 'utf-8');
  // Fixtures are arrays of EGW Paragraph objects (the schema is wider, but the
  // parser only cares about `content` — keep the test types narrow).
  return JSON.parse(text) as readonly Paragraph[];
};

// Convenience: find a paragraph by id in a fixture, fail loudly if missing so
// fixture renames don't silently degrade the test.
const find = (paragraphs: readonly Paragraph[], paraId: string): Paragraph => {
  const found = paragraphs.find((p) => p.para_id === paraId);
  if (found === undefined) throw new Error(`fixture missing para_id ${paraId}`);
  return found;
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
  it('parses plain h3 chapter title as a single Text node', async () => {
    const pp = await loadFixture('pp-chapter-3.json');
    const ast = parseParagraphContent(find(pp, '84.155').content);
    expect(ast).toEqual([{ _tag: 'Text', text: 'Chapter 3—The Temptation and Fall' }]);
  });

  it('parses nested non-egw-comment wrapping an egwlink_bible scripture ref', async () => {
    const pp = await loadFixture('pp-chapter-3.json');
    const ast = parseParagraphContent(find(pp, '84.3636').content);
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
  });

  it('emits PageBreak with parsed page number, no children, surrounded by text', async () => {
    const pp = await loadFixture('pp-chapter-3.json');
    const ast = parseParagraphContent(find(pp, '84.164').content);
    const pageBreak = ast.find((n) => n._tag === 'PageBreak');
    expect(pageBreak).toEqual({ _tag: 'PageBreak', page: 54 });
    // Verify the prose continues on either side: text just before and just after.
    const pbIndex = ast.findIndex((n) => n._tag === 'PageBreak');
    expect(ast[pbIndex - 1]?._tag).toBe('Text');
    expect(ast[pbIndex + 1]?._tag).toBe('Text');
  });
});

describe('parseParagraphContent — GC Ch 3 fixture', () => {
  it('parses <em> with multi-word italic content as Emphasis', async () => {
    const gc = await loadFixture('gc-chapter-3.json');
    const ast = parseParagraphContent(find(gc, '132.249').content);
    const emphasis = ast.find((n) => n._tag === 'Emphasis');
    expect(emphasis).toBeDefined();
    expect(emphasis?._tag).toBe('Emphasis');
    if (emphasis?._tag !== 'Emphasis') throw new Error('unreachable');
    expect(emphasis.children).toEqual([
      {
        _tag: 'Text',
        text: 'The Real Presence of the Body and Blood of Our Lord Jesus Christ in the Blessed Eucharist, Proved From Scripture,',
      },
    ]);
  });

  it('parses egwlink_book span as BookRef carrying title + dataLink', async () => {
    const gc = await loadFixture('gc-chapter-3.json');
    const ast = parseParagraphContent(find(gc, '132.207').content);
    const bookRef = ast.find((n) => n._tag === 'BookRef');
    expect(bookRef).toEqual({
      _tag: 'BookRef',
      title: 'GC 679',
      dataLink: '132.3067',
      children: [{ _tag: 'Text', text: 'Appendix' }],
    });
  });
});

describe('parseParagraphContent — invariants across all fixture paragraphs', () => {
  it('never produces a node outside the closed AST union', async () => {
    const pp = await loadFixture('pp-chapter-3.json');
    const gc = await loadFixture('gc-chapter-3.json');
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
  });

  it('never produces Unknown for current fixtures — if this fails the AST is missing a case', async () => {
    const pp = await loadFixture('pp-chapter-3.json');
    const gc = await loadFixture('gc-chapter-3.json');
    const unknownTags: string[] = [];
    const walk = (nodes: readonly Node[]): void => {
      for (const n of nodes) {
        if (n._tag === 'Unknown') unknownTags.push(`${n.tag}.${n.className}`);
        if ('children' in n) walk(n.children);
      }
    };
    for (const p of [...pp, ...gc]) walk(parseParagraphContent(p.content));
    expect(unknownTags).toEqual([]);
  });

  it('never drops text — every fixture paragraph round-trips its visible text', async () => {
    const pp = await loadFixture('pp-chapter-3.json');
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
  });
});
