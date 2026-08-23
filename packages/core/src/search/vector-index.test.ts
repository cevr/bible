/** §9.2's format, and §10's "verify the writer with synthetic vectors".
 *
 *  The writer and the reader are tested against each other because they are the
 *  only two things that have to agree about the layout — and because §10 asks
 *  the builder to be verified without running it over the real 961,761-paragraph
 *  corpus. */

import { describe, expect, it } from 'bun:test';
import { Effect, Schema } from 'effect';

import {
  DIMENSIONS,
  encodeVectorIndex,
  MODEL_FINGERPRINT,
  parseVectorIndex,
  QUANTIZATION_SCALE,
  quantize,
  scanVectorIndex,
  VectorBookRange,
  VectorManifest,
  type VectorIndex,
} from './vector-index.js';

const vectorFor = (seed: number): Int8Array => {
  const values = new Float32Array(DIMENSIONS);
  for (let axis = 0; axis < DIMENSIONS; axis += 1) {
    values[axis] = Math.sin(seed * 0.37 + axis * 0.11);
  }
  return quantize(values);
};

const synthetic = (input?: {
  readonly fingerprint?: string;
  readonly ids?: readonly string[];
  /** Overrides the derived book ranges, so a test can write a manifest that
   *  overlaps, gaps, or reaches past the buffer — the states §9.6 refuses. */
  readonly books?: readonly VectorBookRange[];
}): ArrayBuffer => {
  const ids = input?.ids ?? ['GC:GC 425.1', 'GC:GC 425.2', 'DA:DA 311.5'];
  const vectors = new Int8Array(ids.length * DIMENSIONS);
  ids.forEach((_id, row) => {
    vectors.set(vectorFor(row + 1), row * DIMENSIONS);
  });
  const gc = ids.filter((id) => id.startsWith('GC:')).length;
  return encodeVectorIndex({
    fingerprint: input?.fingerprint ?? MODEL_FINGERPRINT,
    manifest: VectorManifest.make({
      books: input?.books ?? [
        VectorBookRange.make({ bookCode: 'GC', offset: 0, count: gc }),
        VectorBookRange.make({ bookCode: 'DA', offset: gc, count: ids.length - gc }),
      ],
      paragraphIds: ids,
    }),
    vectors,
  });
};

/** A fixture that would not parse is a broken fixture, not a test failure the
 *  suite can report anything useful about — so it is a defect. */
class FixtureDidNotParse extends Schema.TaggedError<FixtureDidNotParse>()(
  'Search/FixtureDidNotParse',
  { fault: Schema.String },
) {}

const parsed = (buffer: ArrayBuffer): VectorIndex => {
  const result = parseVectorIndex(buffer);
  if (result._tag === 'ok') return result.index;
  return Effect.runSync(Effect.die(FixtureDidNotParse.make({ fault: result._tag })));
};

describe('§9.2 the flat index format', () => {
  it('round-trips what the writer wrote', () => {
    const index = parsed(synthetic());
    expect(index.fingerprint).toBe(MODEL_FINGERPRINT);
    expect(index.dimensions).toBe(DIMENSIONS);
    expect(index.count).toBe(3);
    expect(index.manifest.paragraphIds).toEqual(['GC:GC 425.1', 'GC:GC 425.2', 'DA:DA 311.5']);
    expect(index.vectors.length).toBe(3 * DIMENSIONS);
  });

  it('preserves each vector byte for byte', () => {
    // The property the whole format exists for: a vector written at row *i*
    // comes back at row *i*, unchanged. An off-by-one in the offset arithmetic
    // would still parse and would silently return every paragraph's neighbor.
    const index = parsed(synthetic());
    expect([...index.vectors.slice(0, DIMENSIONS)]).toEqual([...vectorFor(1)]);
    expect([...index.vectors.slice(2 * DIMENSIONS, 3 * DIMENSIONS)]).toEqual([...vectorFor(3)]);
  });

  it('carries the per-book manifest §9.2 needs for incremental scope', () => {
    const index = parsed(synthetic());
    expect(index.manifest.books.map((book) => book.bookCode)).toEqual(['GC', 'DA']);
    expect(index.manifest.books[0]).toMatchObject({ offset: 0, count: 2 });
    expect(index.manifest.books[1]).toMatchObject({ offset: 2, count: 1 });
  });
});

describe('§9.6 what the parser refuses', () => {
  it('refuses a foreign fingerprint as its own fault kind', () => {
    // §10: "a model-fingerprint mismatch invalidates the vector leg rather than
    // returning wrong neighbors." Its own tag, because the caller maps it onto
    // a different `VectorAbsenceReason` than a malformed file.
    const result = parseVectorIndex(synthetic({ fingerprint: 'some-other-model/512d' }));
    expect(result._tag).toBe('fingerprint');
    if (result._tag !== 'fingerprint') return;
    expect(result.found).toBe('some-other-model/512d');
  });

  it('refuses bytes that are not an index at all', () => {
    expect(parseVectorIndex(new ArrayBuffer(4))._tag).toBe('malformed');
    expect(parseVectorIndex(new TextEncoder().encode('not an index at all').buffer)._tag).toBe(
      'malformed',
    );
  });

  it('refuses a truncated file rather than reading past the end', () => {
    // The failure mode that would otherwise be silent: a half-downloaded
    // artifact whose header promises more vectors than the file holds.
    const whole = synthetic();
    const cut = whole.slice(0, whole.byteLength - DIMENSIONS);
    expect(parseVectorIndex(cut)._tag).toBe('malformed');
  });

  it('refuses when the manifest names a different number of ids than the header', () => {
    const whole = synthetic();
    const view = new DataView(whole);
    // Claim one more vector than the manifest lists ids for.
    view.setUint32(8, 4, true);
    expect(parseVectorIndex(whole)._tag).toBe('malformed');
  });

  it('never throws on arbitrary bytes', () => {
    // An optional artifact is exactly the thing that arrives corrupt, and §9.6
    // makes every such state a typed degradation rather than a defect.
    const random = new Uint8Array(512);
    for (let byte = 0; byte < random.length; byte += 1) random[byte] = (byte * 37) % 256;
    expect(parseVectorIndex(random.buffer)._tag).toBe('malformed');
  });

  it('refuses trailing bytes the layout does not account for', () => {
    // Not "at least the promised length" but exactly it. A file that grew — a
    // resumed download that restarted mid-stream, two artifacts concatenated —
    // would otherwise parse as its own valid prefix.
    const whole = synthetic();
    const longer = new Uint8Array(whole.byteLength + 16);
    longer.set(new Uint8Array(whole));
    expect(parseVectorIndex(longer.buffer)._tag).toBe('malformed');
  });

  it('refuses duplicate paragraph ids', () => {
    // Two rows sharing an id make the fusion score one paragraph twice and the
    // batch lookup ambiguous. It cannot be repaired at read time.
    const result = parseVectorIndex(synthetic({ ids: ['GC:a', 'GC:a', 'DA:b'] }));
    expect(result._tag).toBe('malformed');
    if (result._tag !== 'malformed') return;
    expect(result.detail).toContain('duplicates');
  });

  it('refuses a book range that reaches past the vectors', () => {
    const result = parseVectorIndex(
      synthetic({
        books: [
          VectorBookRange.make({ bookCode: 'GC', offset: 0, count: 2 }),
          // One vector past the three the header declares.
          VectorBookRange.make({ bookCode: 'DA', offset: 2, count: 2 }),
        ],
      }),
    );
    expect(result._tag).toBe('malformed');
    if (result._tag !== 'malformed') return;
    expect(result.detail).toContain('past the 3 vectors');
  });

  it('refuses overlapping book ranges', () => {
    // An overlap scores one vector twice, under two book codes.
    const result = parseVectorIndex(
      synthetic({
        books: [
          VectorBookRange.make({ bookCode: 'GC', offset: 0, count: 2 }),
          VectorBookRange.make({ bookCode: 'DA', offset: 1, count: 2 }),
        ],
      }),
    );
    expect(result._tag).toBe('malformed');
    if (result._tag !== 'malformed') return;
    expect(result.detail).toContain('overlap');
  });

  it('refuses a gap between book ranges', () => {
    // A gap makes a paragraph unreachable through a book-scoped query while it
    // stays reachable unscoped — a scope filter that changes the answer.
    const result = parseVectorIndex(
      synthetic({
        books: [
          VectorBookRange.make({ bookCode: 'GC', offset: 0, count: 1 }),
          VectorBookRange.make({ bookCode: 'DA', offset: 2, count: 1 }),
        ],
      }),
    );
    expect(result._tag).toBe('malformed');
    if (result._tag !== 'malformed') return;
    expect(result.detail).toContain('gap');
  });

  it('refuses books that do not cover every vector', () => {
    const result = parseVectorIndex(
      synthetic({ books: [VectorBookRange.make({ bookCode: 'GC', offset: 0, count: 2 })] }),
    );
    expect(result._tag).toBe('malformed');
    if (result._tag !== 'malformed') return;
    expect(result.detail).toContain('cover 2 of 3');
  });
});

describe('§9.2 the scan', () => {
  const index = parsed(synthetic());
  /** The neighbors half of a scan, for the assertions that are about ranking
   *  rather than about how much of the index was read. */
  const neighborsOf = (query: Int8Array, options: Parameters<typeof scanVectorIndex>[2]) =>
    scanVectorIndex(index, query, options).neighbors;

  it('ranks a paragraph’s own vector first when queried with it', () => {
    // The sanity property: a vector is its own nearest neighbor. Without it a
    // sign error or a transposed offset would still return plausible ids.
    const neighbors = neighborsOf(vectorFor(2), { topK: 3 });
    expect(neighbors[0]?.paragraphId).toBe('GC:GC 425.2');
  });

  it('returns neighbors in descending similarity', () => {
    const neighbors = neighborsOf(vectorFor(1), { topK: 3 });
    const scores = neighbors.map((neighbor) => neighbor.similarity);
    expect([...scores].sort((left, right) => right - left)).toEqual(scores);
  });

  it('honors topK', () => {
    expect(neighborsOf(vectorFor(1), { topK: 1 }).length).toBe(1);
    expect(neighborsOf(vectorFor(1), { topK: 2 }).length).toBe(2);
  });

  it('refuses a query of the wrong dimension rather than zero-padding it', () => {
    // The silent failure this replaces: reading `query[axis] ?? 0` produced a
    // complete, plausible ranking over a truncated query, and nothing
    // downstream could tell it apart from a real one.
    expect(neighborsOf(new Int8Array(DIMENSIONS - 1), { topK: 3 })).toEqual([]);
    expect(neighborsOf(new Int8Array(DIMENSIONS + 1), { topK: 3 })).toEqual([]);
    expect(neighborsOf(new Int8Array(0), { topK: 3 })).toEqual([]);
    // The right dimension still scans.
    expect(neighborsOf(vectorFor(1), { topK: 3 }).length).toBe(3);
  });

  it('scans only the books the manifest allows', () => {
    // §9.2's per-book manifest earning its place: a book-scoped query scores
    // only the ranges it can return rather than the whole corpus.
    const neighbors = neighborsOf(vectorFor(1), {
      topK: 5,
      allow: new Set(['DA']),
    });
    expect(neighbors.map((neighbor) => neighbor.paragraphId)).toEqual(['DA:DA 311.5']);
  });

  /** Round-2 B6: `scanned` is the count of rows the scan computed a dot product
   *  for, not the size of the index it was given. The fixture's three vectors
   *  are two GC rows and one DA row, so the two numbers differ for every
   *  narrowed scan and an implementation reporting `index.count` fails here. */
  it('reports how many rows it actually scanned', () => {
    expect(index.count).toBe(3);
    expect(scanVectorIndex(index, vectorFor(1), { topK: 5 }).scanned).toBe(3);
    expect(scanVectorIndex(index, vectorFor(1), { topK: 5, allow: new Set(['DA']) }).scanned).toBe(
      1,
    );
    expect(scanVectorIndex(index, vectorFor(1), { topK: 5, allow: new Set(['GC']) }).scanned).toBe(
      2,
    );
    // A book the manifest does not carry contributes no range and no rows.
    expect(scanVectorIndex(index, vectorFor(1), { topK: 5, allow: new Set(['EW']) }).scanned).toBe(
      0,
    );
    // A refused query scans nothing at all, rather than reporting the index it
    // declined to read.
    expect(scanVectorIndex(index, new Int8Array(DIMENSIONS - 1), { topK: 5 }).scanned).toBe(0);
  });
});

describe('§9.5 quantization', () => {
  it('scales every vector by the one fixed constant', () => {
    expect(QUANTIZATION_SCALE).toBe(127);
    // A unit component maps to ±127; everything else is that same scale.
    expect([...quantize([1, -1, 0.5, 0.25, 0])]).toEqual([127, -127, 64, 32, 0]);
  });

  it('maps an all-zero vector to zeros', () => {
    expect([...quantize([0, 0, 0])]).toEqual([0, 0, 0]);
  });

  it('clamps rather than wrapping when a component exceeds the unit range', () => {
    // `Int8Array` assignment is modular, so an unnormalized 2.0 would land on
    // 254 → -2 and invert that axis. Saturation is the honest failure.
    expect([...quantize([2, -2])]).toEqual([127, -127]);
  });

  it('does NOT rescale each vector by its own maximum', () => {
    // The property the per-vector scheme had, and the one that broke ranking:
    // it made two vectors that differ only by a positive factor identical.
    // Under one fixed scale they stay different, because their *lengths* carry
    // information the dot product reads.
    expect([...quantize([0.1, 0.2, 0.4])]).not.toEqual([...quantize([0.2, 0.4, 0.8])]);
  });

  it('preserves cosine order across documents with different component maxima', () => {
    // §9.4's regression test for the per-vector scale. Two unit-normalized
    // documents and one unit-normalized query, chosen so the float cosines rank
    // `near` above `far`, and so `far`'s largest component is much smaller than
    // `near`'s — which is exactly what a per-row scale amplifies.
    const unit = (values: readonly number[]): Float32Array => {
      const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
      return new Float32Array(values.map((value) => value / norm));
    };
    const query = unit([1, 0, 0, 0]);
    // Closer to the query (cos ≈ 0.5178), but its own largest component is on
    // another axis — so a per-row scale divides it by 0.8164.
    const near = unit([0.5178, 0.1923, 0.8164, 0.1684]);
    // Further from the query (cos ≈ 0.5092), and near-isotropic — its largest
    // component is only 0.5104, so a per-row scale inflates it the most.
    const far = unit([0.5092, 0.4986, 0.5104, 0.4813]);

    const cosine = (left: Float32Array, right: Float32Array): number => {
      let dot = 0;
      for (let axis = 0; axis < left.length; axis += 1) {
        dot += (left[axis] ?? 0) * (right[axis] ?? 0);
      }
      return dot;
    };
    // The float truth this quantization must not reorder.
    expect(cosine(query, near)).toBeGreaterThan(cosine(query, far));

    const dot = (left: Int8Array, right: Int8Array): number => {
      let sum = 0;
      for (let axis = 0; axis < left.length; axis += 1) {
        sum += (left[axis] ?? 0) * (right[axis] ?? 0);
      }
      return sum;
    };
    const q = quantize(query);
    expect(dot(q, quantize(near))).toBeGreaterThan(dot(q, quantize(far)));

    // And the reversal the old scheme produced, written out so the regression
    // is legible: dividing each document by its own maximum multiplies `far` by
    // 1/0.5 and `near` by only 1/0.928, which flips the comparison.
    const perRow = (values: Float32Array): Int8Array => {
      let max = 0;
      for (const value of values) max = Math.max(max, Math.abs(value));
      const out = new Int8Array(values.length);
      for (let axis = 0; axis < values.length; axis += 1) {
        out[axis] = Math.round(((values[axis] ?? 0) * 127) / max);
      }
      return out;
    };
    expect(dot(q, perRow(near))).toBeLessThan(dot(q, perRow(far)));
  });
});
