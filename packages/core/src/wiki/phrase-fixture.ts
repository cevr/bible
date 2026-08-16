/** The one Daniel 8 phrase-matching fixture, shared by every seam that has to
 *  prove it agrees with the others (§10, Milestone 4 adapter checks).
 *
 *  "Identical `PhraseSpan` output for the same input text in the web worker,
 *  Electron main, and the Bun CLI — **one shared fixture**, byte-identical
 *  offsets." A fixture copied into three test files is three fixtures, and the
 *  first time one of them gains a comma the parity claim quietly becomes a
 *  claim about two different inputs. This module is the single copy: the core
 *  suite matches against it, the RPC/CLI parity test round-trips it, and the
 *  CLI acceptance workflow feeds the same verse text in on the command line.
 *
 *  It ships in `src/` rather than in a test file for exactly that reason — a
 *  `*.test.ts` is not importable from another package, and the CLI's test suite
 *  lives in `packages/cli`. It is reached from another package through
 *  `@bible/core/wiki/testing` (`testing.ts`), not through `@bible/core/wiki`:
 *  importable across packages is not the same as part of the product, and a
 *  production import must not be able to find a test dictionary.
 */

import { Option } from 'effect';

import { PhraseDictionary, PhraseDictionaryEntry, topicSlug } from './model.js';
import { normalizeAlias } from './normalize.js';

/** Daniel 8:9, KJV, byte for byte as `bible verse "Dan 8:9"` prints it —
 *  including the `[land]` brackets the KJV source carries around a
 *  translator-supplied word.
 *
 *  The chapter's opening phrase, `little horn`, is the one that took Daniel 8's
 *  single slot under the disproved one-link-per-section reading. The brackets
 *  are equally load-bearing and are documented below — see
 *  `PHRASE_FIXTURE_NOTE`. */
export const DANIEL_8_9 =
  'And out of one of them came forth a little horn, which waxed exceeding great, ' +
  'toward the south, and toward the east, and toward the pleasant [land].';

/** Daniel 8:11, KJV — **the named §4.5 regression pair**.
 *
 *  `the daily` and `sanctuary` share this one verse, and the disproved
 *  one-link-per-section reading let the first starve the second. Both must be
 *  hot. (§10's Milestone 4 footnote records why this pair replaced the
 *  `little horn` / `pleasant land` pair the spec named first: the KJV writes
 *  `pleasant [land]`, which §4.3 and §4.6 both refuse to bridge.) */
export const DANIEL_8_11 =
  'Yea, he magnified [himself] even to the prince of the host, and by him the daily ' +
  '[sacrifice] was taken away, and the place of his sanctuary was cast down.';

/** Daniel 8:14, KJV — where `sanctuary` recurs. Its second occurrence must be
 *  cold: §4.5 gives the phrase one slot per section, and the section here is
 *  the chapter. */
export const DANIEL_8_14 =
  'And he said unto me, Unto two thousand and three hundred days; ' +
  'then shall the sanctuary be cleansed.';

/** Why `pleasant land` is not hot in the *rendered* verse, recorded next to the
 *  fixture rather than discovered again by the next reader.
 *
 *  The KJV marks translator-supplied words with square brackets, and
 *  `segmentVerseText` turns `[land]` into its own `italic` segment. §4.6 lets a
 *  span touch only `text` segments, so the rendered verse offers "…toward the
 *  pleasant " and "land" as two separate runs and the phrase spans neither. The
 *  raw source string has the same outcome by a different route: `[` is not soft
 *  punctuation (§4.3's set is commas and semicolons), so it survives
 *  normalization and stands between the two words.
 *
 *  Both paths therefore agree, which is the property that matters — the CLI
 *  matching the raw verse and the reader matching the rendered verse see the
 *  same phrase set. Making `pleasant land` hot would mean either widening §4.3
 *  to swallow brackets (which would also fold "the daily [sacrifice]" into "the
 *  daily sacrifice" and change what the dictionary can claim) or letting spans
 *  cross segment boundaries (§4.6's explicit prohibition). Neither is this
 *  milestone's call to make. */
export const PHRASE_FIXTURE_NOTE =
  'KJV translator brackets split "pleasant [land]" into two runs; §4.3 does not ' +
  'fold brackets and §4.6 does not cross segments, so the phrase is not hot.';

/** The fixture dictionary: four Daniel 8 phrases plus the nested pair §4.4's
 *  longest-match rule is about.
 *
 *  Built through `normalizeAlias` rather than written pre-normalized, so the
 *  fixture is a statement about authored aliases and the compiler's own rule
 *  turns them into keys — the same path a real artifact takes. */
const entry = (display: string, slug: string): PhraseDictionaryEntry =>
  PhraseDictionaryEntry.make({
    alias: normalizeAlias(display),
    display,
    slug: topicSlug(slug),
    canonical: true,
  });

export const PHRASE_FIXTURE_DICTIONARY = PhraseDictionary.make({
  entries: [
    entry('little horn', 'little-horn'),
    entry('pleasant land', 'pleasant-land'),
    entry('the daily', 'the-daily'),
    entry('sanctuary', 'sanctuary'),
    entry('heavenly sanctuary', 'heavenly-sanctuary'),
  ],
  unavailable: Option.none(),
});

/** The chapter as a section: the three verses above, in order. §4.5's table
 *  makes the chapter the section for Bible text, so a matcher run over this
 *  list shares one first-occurrence state across all three. */
export const DANIEL_8_SECTION: readonly string[] = [DANIEL_8_9, DANIEL_8_11, DANIEL_8_14];
