import { describe, expect, it } from 'vitest';
import type { Node } from './ast.js';
import { extractScriptureRefs } from './extract.js';
import type { Paragraph } from './schemas.js';

const scriptureRef = (title: string): Node => ({
  _tag: 'ScriptureRef',
  title,
  dataLink: '',
  children: [],
});

const text = (s: string): Node => ({ _tag: 'Text', text: s });

const paragraph = (overrides: Partial<Paragraph>): Paragraph => ({
  para_id: 'p1',
  refcode_short: 'GC 1.1',
  refcode_long: null,
  element_type: null,
  element_subtype: null,
  nodes: [],
  puborder: 1,
  ...overrides,
});

describe('extractScriptureRefs', () => {
  it('emits one row per single-verse reference', () => {
    const refs = extractScriptureRefs(
      [paragraph({ nodes: [text('See '), scriptureRef('Genesis 3:1')] })],
      99,
    );
    expect(refs).toEqual([
      {
        bookId: 99,
        refCode: 'GC 1.1',
        bibleBook: 1,
        bibleChapter: 3,
        bibleVerse: 1,
      },
    ]);
  });

  it('expands a verse range into one row per verse', () => {
    const refs = extractScriptureRefs([paragraph({ nodes: [scriptureRef('Genesis 3:1-3')] })], 99);
    expect(refs.map((r) => r.bibleVerse)).toEqual([1, 2, 3]);
    expect(refs.every((r) => r.bibleBook === 1 && r.bibleChapter === 3)).toBe(true);
  });

  it('represents a whole-chapter reference with null verse', () => {
    const refs = extractScriptureRefs([paragraph({ nodes: [scriptureRef('Genesis 3')] })], 99);
    expect(refs).toEqual([
      {
        bookId: 99,
        refCode: 'GC 1.1',
        bibleBook: 1,
        bibleChapter: 3,
        bibleVerse: null,
      },
    ]);
  });

  it('skips chapter ranges, full-book, and unparseable titles', () => {
    const refs = extractScriptureRefs(
      [
        paragraph({
          nodes: [
            scriptureRef('Genesis 3-5'),
            scriptureRef('Ruth'),
            scriptureRef('not-a-reference'),
          ],
        }),
      ],
      99,
    );
    expect(refs).toEqual([]);
  });

  it('walks into Emphasis/Comment/Unknown wrappers', () => {
    const refs = extractScriptureRefs(
      [
        paragraph({
          nodes: [
            { _tag: 'Emphasis', children: [scriptureRef('John 3:16')] },
            { _tag: 'Comment', children: [scriptureRef('Romans 8:1')] },
            { _tag: 'Unknown', tag: 'div', className: '', children: [scriptureRef('Acts 2:1')] },
          ],
        }),
      ],
      99,
    );
    expect(
      refs.map((r) => `${String(r.bibleBook)}:${String(r.bibleChapter)}:${String(r.bibleVerse)}`),
    ).toEqual(['43:3:16', '45:8:1', '44:2:1']);
  });

  it('dedupes duplicate refs within the same paragraph', () => {
    const refs = extractScriptureRefs(
      [paragraph({ nodes: [scriptureRef('Genesis 3:1'), scriptureRef('Genesis 3:1')] })],
      99,
    );
    expect(refs).toHaveLength(1);
  });

  it('uses the canonical refCode fallback chain', () => {
    const refs = extractScriptureRefs(
      [
        paragraph({
          refcode_short: null,
          refcode_long: 'Genesis 1:1',
          nodes: [scriptureRef('John 1:1')],
        }),
        paragraph({
          refcode_short: null,
          refcode_long: null,
          para_id: 'pid-7',
          puborder: 2,
          nodes: [scriptureRef('John 1:2')],
        }),
        paragraph({
          refcode_short: null,
          refcode_long: null,
          para_id: null,
          puborder: 3,
          nodes: [scriptureRef('John 1:3')],
        }),
      ],
      77,
    );
    expect(refs.map((r) => r.refCode)).toEqual(['Genesis 1:1', 'pid-7', 'book-77-para-3']);
  });
});
