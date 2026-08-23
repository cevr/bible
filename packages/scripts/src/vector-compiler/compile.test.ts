/** §10: "verify the writer with synthetic vectors in a test."
 *
 *  The builder is not run over the corpus here — that is what §10 forbids, and
 *  what `--limit` exists to prevent by accident. What is verified is the thing a
 *  corpus run could not tell you anyway: that the buffer the writer produces is
 *  the buffer the reader expects, vector for vector and range for range.
 *
 *  The vectors are synthetic and the embedder is not involved. A wrong offset,
 *  a manifest that names ranges the buffer does not have, or an id table out of
 *  step with the rows would all survive a real embedding run and all fail here.
 */

import { describe, expect, it } from 'bun:test';
import {
  DIMENSIONS,
  encodeVectorIndex,
  MODEL_FINGERPRINT,
  parseVectorIndex,
  scanVectorIndex,
  VectorBookRange,
  VectorManifest,
} from '@bible/core/search';

import { bookRanges, paragraphIds, type VectorSourceRow } from './emit.js';

/** `paraId` is the corpus's own paragraph identifier, distinct from the display
 *  refcode: §9.2's join key is built from it because two rows can share a
 *  refcode (17,078 pairs do in the shipped corpus) and a refcode-keyed index
 *  silently fuses the wrong paragraph. The fixture spells both. */
const row = (bookCode: string, refcode: string, text: string, paraId: string): VectorSourceRow => ({
  bookCode,
  refcode,
  text,
  paraId,
});

/** Nine paragraphs across three books, deliberately not evenly split: a manifest
 *  builder that assumed equal-sized books would pass on a balanced fixture. */
const ROWS: readonly VectorSourceRow[] = [
  row('GC', 'GC 425.1', 'the sanctuary in heaven', '14879.1'),
  row('GC', 'GC 425.2', 'it concerns every soul', '14879.2'),
  row('GC', 'GC 489.1', 'the investigative judgment', '14879.3'),
  row('GC', 'GC 490.1', 'probation closes', '14879.4'),
  row('DA', 'DA 311.5', 'the law written in the heart', '13020.1'),
  row('DA', 'DA 555.1', 'the close of probation', '13020.2'),
  row('EW', 'EW 279.1', 'the loud cry of the third angel', '12001.1'),
  row('EW', 'EW 280.1', 'the latter rain', '12001.2'),
  row('EW', 'EW 281.1', 'the sealing', '12001.3'),
];

/** A distinct, reproducible vector per row. Distinct matters: identical vectors
 *  would make an offset error invisible, because every row would score alike. */
const syntheticVectors = (rows: readonly VectorSourceRow[]): Int8Array => {
  const vectors = new Int8Array(rows.length * DIMENSIONS);
  rows.forEach((_row, index) => {
    for (let axis = 0; axis < DIMENSIONS; axis += 1) {
      vectors[index * DIMENSIONS + axis] = Math.round(
        127 * Math.sin((index + 1) * 0.7 + axis * 0.13),
      );
    }
  });
  return vectors;
};

const build = (rows: readonly VectorSourceRow[]): ArrayBuffer =>
  encodeVectorIndex({
    fingerprint: MODEL_FINGERPRINT,
    manifest: VectorManifest.make({
      books: bookRanges(rows),
      paragraphIds: paragraphIds(rows),
    }),
    vectors: syntheticVectors(rows),
  });

describe('§9.2 the per-book manifest', () => {
  it('describes contiguous runs that tile the rows', () => {
    const ranges = bookRanges(ROWS);
    expect(ranges.map((range) => range.bookCode)).toEqual(['GC', 'DA', 'EW']);
    expect(ranges.map((range) => range.offset)).toEqual([0, 4, 6]);
    expect(ranges.map((range) => range.count)).toEqual([4, 2, 3]);
    // The property that makes the ranges usable: they partition the buffer.
    expect(ranges.reduce((total, range) => total + range.count, 0)).toBe(ROWS.length);
  });

  it('handles a single book and a single paragraph', () => {
    expect(bookRanges([]).length).toBe(0);
    const one = bookRanges([row('GC', 'GC 1.1', 'text')]);
    expect(one).toEqual([VectorBookRange.make({ bookCode: 'GC', offset: 0, count: 1 })]);
  });

  it('keys paragraphs the way the search service does', () => {
    // The join key is `${bookCode}:${paraId}`, spelled once in
    // `paragraphIdentity` and imported by both sides. If the compiler and the
    // lexical leg disagreed, the index and the lexical leg would never fuse a
    // single row and every result would silently lose the vector half.
    //
    // Keyed on `paraId` rather than the display refcode because the refcode is
    // not unique: the shipped corpus has 17,078 paragraph pairs sharing one,
    // and a refcode-keyed index fuses the vector of one onto the text of
    // another.
    expect(paragraphIds(ROWS)[0]).toBe('GC:14879.1');
    expect(paragraphIds(ROWS)[4]).toBe('DA:13020.1');
  });
});

describe('§10 the writer round-trips through the shipped reader', () => {
  it('produces an index the parser accepts', () => {
    const parsed = parseVectorIndex(build(ROWS));
    expect(parsed._tag).toBe('ok');
    if (parsed._tag !== 'ok') return;
    expect(parsed.index.count).toBe(ROWS.length);
    expect(parsed.index.fingerprint).toBe(MODEL_FINGERPRINT);
    expect(parsed.index.dimensions).toBe(DIMENSIONS);
  });

  it('puts every paragraph’s vector at its own row', () => {
    // The offset check, stated as the property that actually matters: a scan
    // queried with row *i*'s vector must return row *i*'s paragraph id. An
    // off-by-one in the writer returns the neighbor, which is a plausible answer
    // and therefore the failure mode that would otherwise ship.
    const parsed = parseVectorIndex(build(ROWS));
    if (parsed._tag !== 'ok') return;
    const vectors = syntheticVectors(ROWS);
    ROWS.forEach((source, index) => {
      const query = vectors.slice(index * DIMENSIONS, (index + 1) * DIMENSIONS);
      const scan = scanVectorIndex(parsed.index, query, { topK: 1 });
      expect({ index, id: scan.neighbors[0]?.paragraphId }).toEqual({
        index,
        id: `${source.bookCode}:${source.paraId}`,
      });
    });
  });

  it('scopes a scan to one book through the manifest it wrote', () => {
    const parsed = parseVectorIndex(build(ROWS));
    if (parsed._tag !== 'ok') return;
    const vectors = syntheticVectors(ROWS);
    // Query with a GC vector but allow only EW: the scan must answer from EW,
    // which it can only do if the EW range points at EW's rows.
    const scan = scanVectorIndex(parsed.index, vectors.slice(0, DIMENSIONS), {
      topK: 3,
      allow: new Set(['EW']),
    });
    expect(scan.neighbors.length).toBe(3);
    expect(scan.neighbors.every((neighbor) => neighbor.paragraphId.startsWith('EW:'))).toBe(true);
    // §9.6's `scanned` counts the rows the scan actually walked, which the book
    // scope narrows: only EW's rows were compared, not the whole index.
    expect(scan.scanned).toBe(ROWS.filter((source) => source.bookCode === 'EW').length);
  });

  it('is byte-identical across two builds of the same rows', () => {
    // The digest discipline the supply pipeline rests on: a rebuild over
    // unchanged input must produce unchanged bytes, or every rebuild looks like
    // a new content version.
    expect(new Uint8Array(build(ROWS))).toEqual(new Uint8Array(build(ROWS)));
  });
});
