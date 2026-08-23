/** The pure half of the vector builder: rows in, §9.2's manifest out.
 *
 *  Separate from `main.ts` for the reason `topics-compiler/emit.ts` is separate
 *  from its own main: §10 asks the writer to be verified with synthetic vectors,
 *  and a manifest builder that only exists inside a `Command.make` handler can
 *  only be tested by running the command — which means opening a corpus and an
 *  ONNX runtime to check some array arithmetic.
 *
 *  Nothing here embeds, reads a file, or fails.
 */

import { paragraphIdentity } from '@bible/core/egw-db';
import { VectorBookRange } from '@bible/core/search';
import { Array as Arr, Option } from 'effect';

/** One paragraph to embed, as the source reader yields it. */
export interface VectorSourceRow {
  readonly bookCode: string;
  /** The corpus's `para_id` — §9.2's join key, and the only column unique
   *  across the whole `paragraphs` table. */
  readonly paraId: string;
  readonly refcode: string;
  readonly text: string;
}

/** §9.2's per-book manifest, derived from the row order.
 *
 *  Derived rather than grouped, because the buffer's layout *is* the row order:
 *  a range that did not describe a contiguous run of the buffer would send the
 *  scan to the wrong vectors, and building it from the same sequence that gets
 *  written is what makes that impossible rather than merely unlikely.
 *
 *  The rows must already be ordered by book — the source query orders by
 *  `(book_code, puborder)` — and a book appearing in two separate runs would
 *  produce two ranges, which the format permits and the scan handles.
 */
export const bookRanges = (rows: readonly VectorSourceRow[]): readonly VectorBookRange[] => {
  const ranges: VectorBookRange[] = [];
  let start = 0;
  for (let row = 1; row <= rows.length; row += 1) {
    const current = Option.map(Arr.get(rows, row - 1), (source) => source.bookCode);
    const next = Option.map(Arr.get(rows, row), (source) => source.bookCode);
    if (Option.isSome(current) && !Option.contains(next, current.value)) {
      ranges.push(
        VectorBookRange.make({ bookCode: current.value, offset: start, count: row - start }),
      );
      start = row;
    }
  }
  return ranges;
};

/** The join key §9.2 gives each vector, in buffer order.
 *
 *  `paragraphIdentity` from `@bible/core/egw-db` — the *same function* the
 *  lexical leg's rows carry and the batch lookup composes in SQL, called rather
 *  than restated. The three must agree exactly: if they disagree the fusion
 *  never matches a single row, and every result silently loses the vector half
 *  of hybrid search without any error appearing anywhere.
 *
 *  It is keyed on `para_id`, not on the refcode. `(book_code, refcode_short)` is
 *  not unique in this corpus — 961,750 non-empty EGW rows share 944,672 distinct
 *  pairs — so a refcode key would write 17,078 paragraphs under an id that
 *  already belongs to another paragraph's vector.
 */
export const paragraphIds = (rows: readonly VectorSourceRow[]): readonly string[] =>
  rows.map((row) => paragraphIdentity(row.bookCode, Option.some(row.paraId), row.refcode));
