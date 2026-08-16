/** The one portable phrase matcher (§4.2).
 *
 *  Matching happens at **render time, in the client, over the text the client
 *  is about to draw** (§4.1). It is not an RPC: the automaton builds in ~1 ms
 *  from a dictionary the client already holds (`v1.wiki.dictionary.get`) and
 *  matches a 30-paragraph screenful in 0.38 ms, so a round trip per screenful
 *  would cost more than the work it delegates — and precomputed spans were
 *  rejected outright because their offsets still need re-projection onto the
 *  rendered AST. So the seam this module has to be portable across is *import*,
 *  not transport: the web worker, Electron main, and the Bun CLI all construct
 *  the same automaton from the same dictionary and get byte-identical offsets.
 *  Nothing here imports a host runtime, an Effect service, or a database.
 *
 *  The three rules the matcher owes §4:
 *
 *  - §4.3 normalization is `normalize.ts`, the module the topics compiler keys
 *    `topic_aliases` on. One function, so a dictionary entry and the running
 *    text cannot normalize differently.
 *  - §4.4 longest-match-at-equal-start, with a span that starts inside an
 *    emitted span suppressed *for that occurrence only*.
 *  - §4.5 first clean occurrence **per phrase**, per section — not one link per
 *    section. The Daniel 8 regression is the fixture: `the daily` and
 *    `sanctuary` share verse 8:11, and a per-section slot starves the second.
 *    (`pleasant land` is the separate bracket case — see `phrase-fixture.ts`.)
 *
 *  §4.6's boundary rules are structural rather than a check inside the loop.
 *  The matcher never sees a whole chapter as one string: the caller hands it the
 *  individual **runs** it is allowed to match inside — one `TextSegment`'s text,
 *  one EGW `Text` node's text — and a span therefore cannot cross a boundary
 *  that was never in the input. `matchSegments` and `matchNodes` below are the
 *  two projections that turn a rendered structure into that run list, and they
 *  are what stops a span from entering a `ScriptureRef` or a `BookRef`.
 */

import { Schema } from 'effect';

import type { Node as EgwNode, Text as EgwText } from '../egw/ast.js';
import type { TextSegment } from '../bible-rendering/segments.js';
import { TopicSlug, type PhraseDictionary, type PhraseDictionaryEntry } from './model.js';
import { isBoundaryAt, normalizeScan, type NormalizedText } from './normalize.js';

/** One matched phrase, as §4.2 declares it: offsets into the supplied text run,
 *  the topic it links to, and the normalized alias that matched.
 *
 *  A schema class rather than a bare interface because the CLI's `--json` and
 *  (in Milestone 6) the renderer both serialize it, and the acceptance contract
 *  is that the three hosts emit byte-identical spans. Encoding through one
 *  schema is what makes "identical" a property of the model rather than of
 *  three serializers agreeing today. */
export class PhraseSpan extends Schema.Class<PhraseSpan>('Wiki/PhraseSpan')({
  /** Offset into the supplied run, in UTF-16 code units — the unit
   *  `String.prototype.slice` takes, so a renderer splits on these directly. */
  start: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  end: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  slug: TopicSlug,
  /** The normalized alias, not the surface text the run happened to carry:
   *  "The Sanctuary," and "the sanctuary" are one dictionary entry, and the
   *  entry is what the span identifies. The surface text is recoverable from
   *  the run and the offsets. */
  alias: Schema.NonEmptyString,
}) {}

/** The spans of one section, one entry per run in the order the runs were
 *  supplied. Parallel to the input rather than flattened, because each span's
 *  offsets are local to its own run and a flat list would lose which run they
 *  index into. */
export type SectionSpans = readonly (readonly PhraseSpan[])[];

// ---------------------------------------------------------------------------
// Normalized projection of a run
//
// §4.3 folds case, collapses whitespace, and makes commas and semicolons
// transparent — so the string the automaton walks is not the string the span
// has to point into. `normalizeScan` (`normalize.ts`) is the *only* definition
// of that projection: the trie is built from its output and the text is matched
// over its output, so a dictionary key and a run cannot fold differently. It
// also hands back the offset table every normalized unit needs to name the
// source characters that produced it, which is what a span maps back through.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Aho-Corasick
//
// Hand-rolled because no platform primitive does this: regex alternation is the
// only built-in alternative and §4.1 measured it degrading superlinearly in
// dictionary size (13 µs at 100 phrases, 603 µs at 2,000) where the automaton
// stays flat (11.9 µs → 16.3 µs). The build cost is paid once per dictionary
// and the match cost is linear in the text, which is the whole reason the
// matcher can run inside a frame budget.
//
// Nodes are addressed by index into one flat array rather than by object
// references, so the trie is a compact contiguous structure and a failure link
// is a number rather than a pointer chase. The inner loop is one `Map.get` per
// character plus, on the rare position that ends a pattern, one array read.
// ---------------------------------------------------------------------------

const ROOT = 0;

/** A dictionary entry with its normalized alias length resolved at build time.
 *
 *  The match loop needs the length to turn an end position into a start
 *  position, and computing it per hit would put a normalization pass inside the
 *  inner loop — the exact cost the automaton exists to avoid. Held beside the
 *  entry rather than replacing it so the span still carries the dictionary's own
 *  alias and slug. */
interface Pattern {
  readonly entry: PhraseDictionaryEntry;
  /** Length of the normalized alias, in normalized positions. */
  readonly length: number;
}

/** "No such node", as a value in the node-index domain rather than as
 *  `undefined`. A `Map.get` miss is a real state of the automaton — the trie has
 *  no edge for this character — and naming it keeps every access below total. */
const NO_NODE = -1;

/** One node of the trie, built once and then read-only.
 *
 *  Objects in an array rather than parallel arrays with `?.` on every access:
 *  the arrays force an optional at each read the type system cannot discharge
 *  (an index is a `number`, and TypeScript will not prove it in range), and the
 *  resulting `?? ROOT` fallbacks are exactly the defensive noise the
 *  construction already makes impossible. One indexed read plus a total
 *  accessor gets the same layout with none of that. */
interface AutomatonNode {
  /** UTF-16 unit → next node. A `Map` rather than a 256-slot array: the
   *  alphabet is Unicode, and a dictionary of 400 phrases has a few thousand
   *  nodes whose fan-out is one or two units.
   *
   *  The *unit*, not the code point, is the alphabet, because the unit is what
   *  `PhraseSpan`'s offsets and the scan's offset table both index. A surrogate
   *  pair is two edges and costs a pattern two length, which keeps
   *  "end position minus pattern length" a correct start position for every
   *  script. */
  readonly next: Map<string, number>;
  /** The patterns ending at this node, longest first — so §4.4's tie-break at
   *  one end position is a scan of an already-ordered list rather than a sort
   *  per position. Failure-link outputs are merged in at build time, so a hit
   *  costs one array read rather than a chain walk. */
  readonly outputs: Pattern[];
  failure: number;
}

const emptyNode = (): AutomatonNode => ({ next: new Map(), outputs: [], failure: ROOT });

/** A built automaton over one dictionary. Construct once per dictionary load
 *  (§4.2) and match many; nothing in `candidates` mutates it. */
export class PhraseAutomaton {
  private readonly nodes: readonly AutomatonNode[];

  private constructor(nodes: readonly AutomatonNode[]) {
    this.nodes = nodes;
  }

  /** Total node access. The index always comes from a transition this builder
   *  created or from `ROOT`, so the fallback is unreachable — but it is here
   *  rather than as a non-null assertion because an assertion is a claim the
   *  compiler cannot check and this is a value it can. */
  private at(index: number): AutomatonNode {
    return this.nodes[index] ?? this.nodes[ROOT] ?? emptyNode();
  }

  /** Builds the automaton from a compiled dictionary.
   *
   *  Entries whose alias normalizes to nothing are dropped rather than rejected:
   *  the compiler already refuses an empty alias, so a blank one here can only
   *  come from an artifact written by an older compiler, and an unreachable
   *  dictionary row is not a reason to fail a page render.
   *
   *  §4.8's noise-flagged aliases need no code. The flag is an *authoring*
   *  decision recorded in the affected stub, and the compiler simply never emits
   *  a row for a flagged alias — so "bare `judgment` is excluded" is a
   *  dictionary that does not contain it, and a matcher that special-cased the
   *  word would be a second, divergent copy of the exclusion list. */
  static make = (dictionary: PhraseDictionary): PhraseAutomaton => {
    const nodes: AutomatonNode[] = [emptyNode()];
    const at = (index: number): AutomatonNode => nodes[index] ?? nodes[ROOT] ?? emptyNode();

    for (const entry of dictionary.entries) {
      // The alias is already normalized in the artifact; normalizing again is
      // idempotent and makes the automaton correct for any dictionary, not only
      // one this repo's compiler produced. It is the *same* scan the match loop
      // runs over the text, so the two consume one unit stream.
      const alias = normalizeScan(entry.alias).text;
      if (alias.length === 0) continue;
      let node = ROOT;
      // By UTF-16 unit, not by code point. `for…of` over a string yields code
      // points, and an astral character would then be one trie edge while the
      // match loop below — which walks units, because that is what an offset
      // table indexes — would look for two. The alphabet is the unit, on both
      // sides, and a surrogate pair is simply two edges. `length` at the
      // terminal node counts the same units, so an end position minus a length
      // is a real start position.
      for (let unit = 0; unit < alias.length; unit += 1) {
        const character = alias.charAt(unit);
        const next = at(node).next.get(character) ?? NO_NODE;
        if (next === NO_NODE) {
          nodes.push(emptyNode());
          const created = nodes.length - 1;
          at(node).next.set(character, created);
          node = created;
          continue;
        }
        node = next;
      }
      at(node).outputs.push({ entry, length: alias.length });
    }

    // BFS over the trie: a node's failure link is resolved before any of its
    // children need it, which is what makes the construction linear.
    const queue: number[] = [];
    for (const child of at(ROOT).next.values()) queue.push(child);

    for (let head = 0; head < queue.length; head += 1) {
      const index = queue[head] ?? ROOT;
      const node = at(index);
      for (const [character, child] of node.next) {
        let fallback = node.failure;
        for (;;) {
          const candidate = at(fallback).next.get(character) ?? NO_NODE;
          if (candidate !== NO_NODE) {
            at(child).failure = candidate;
            break;
          }
          if (fallback === ROOT) break;
          fallback = at(fallback).failure;
        }
        queue.push(child);
      }
      // Output links, flattened into the node itself: a node's outputs are its
      // own patterns plus everything reachable through failure links, merged
      // here so the per-position chain walk becomes one array read.
      node.outputs.push(...at(node.failure).outputs);
      // Longest first, so §4.4's tie-break at one end position needs no sort in
      // the match loop. Length is the comparison because it is what the span
      // covers; ties between equal-length aliases cannot happen — the compiler
      // rejects one alias claimed by two topics (§4.3).
      node.outputs.sort((left, right) => right.length - left.length);
    }

    return new PhraseAutomaton(nodes);
  };

  /** Every dictionary hit in one normalized run, in end-position order, before
   *  §4.4 and §4.5 have had their say. Boundary-invalid hits are dropped here
   *  because a phrase inside a longer word is not a hit at all (§4.3 "matches
   *  only on word boundaries"), not a hit that loses a tie-break. */
  candidates(run: NormalizedText): readonly Candidate[] {
    const found: Candidate[] = [];
    let node = ROOT;
    for (let index = 0; index < run.text.length; index += 1) {
      const character = run.text.charAt(index);
      for (;;) {
        const next = this.at(node).next.get(character) ?? NO_NODE;
        if (next !== NO_NODE) {
          node = next;
          break;
        }
        if (node === ROOT) break;
        node = this.at(node).failure;
      }
      const outputs = this.at(node).outputs;
      if (outputs.length === 0) continue;
      // One end position is a boundary or it is not, so the test that does not
      // depend on the pattern is hoisted out of the pattern loop.
      if (!isBoundaryAt(run.text, index + 1)) continue;
      for (const pattern of outputs) {
        const startNormalized = index + 1 - pattern.length;
        if (startNormalized < 0) continue;
        if (!isBoundaryAt(run.text, startNormalized - 1)) continue;
        found.push({
          normalizedStart: startNormalized,
          normalizedEnd: index + 1,
          entry: pattern.entry,
        });
      }
    }
    return found;
  }
}

interface Candidate {
  readonly normalizedStart: number;
  readonly normalizedEnd: number;
  readonly entry: PhraseDictionaryEntry;
}

/** The per-phrase state §4.5 keeps across the runs of one section.
 *
 *  A section is a chapter, a reading unit, or one layered section of a topic
 *  page (§4.5's table) — and it is made of many runs: every `TextSegment` of
 *  every verse, every `Text` node of every paragraph. First-occurrence is a
 *  property of the *section*, so the state that remembers which phrases are
 *  already hot has to outlive a single run. It is an explicit value rather than
 *  a field on the automaton because the automaton is shared by every section on
 *  screen and must stay stateless. */
export class SectionMatchState {
  private readonly hot = new Set<string>();

  /** Whether this phrase still has its section slot. Read-only; claiming is a
   *  separate step so a candidate that loses §4.4's overlap sweep does not burn
   *  the slot it never got to use. */
  eligible(alias: string): boolean {
    return !this.hot.has(alias);
  }

  claim(alias: string): void {
    this.hot.add(alias);
  }
}

/** Resolves §4.4 and §4.5 over one run's candidates.
 *
 *  Order is the whole content of the rule set:
 *
 *  1. Candidates whose phrase is already hot in this section drop out *before*
 *     the overlap sweep. They neither emit nor occupy space — a second
 *     "sanctuary" must not shadow the first "heavenly sanctuary" that overlaps
 *     it, because §4.4's suppression is about *emitted* spans.
 *  2. Sort by start ascending, then by length descending. "Longest match wins at
 *     the same start" is then the first candidate at each start.
 *  3. Sweep once, tracking how far the emitted spans reach. A candidate
 *     starting inside that reach is suppressed **for this occurrence only** —
 *     it never claims its slot, so its next clean occurrence is still eligible,
 *     which is exactly §4.4's closing sentence. */
const resolve = (
  candidates: readonly Candidate[],
  run: NormalizedText,
  state: SectionMatchState,
): readonly PhraseSpan[] => {
  const eligible = candidates.filter((candidate) => state.eligible(candidate.entry.alias));
  const ordered = [...eligible].sort((left, right) => {
    if (left.normalizedStart !== right.normalizedStart) {
      return left.normalizedStart - right.normalizedStart;
    }
    return (
      right.normalizedEnd - right.normalizedStart - (left.normalizedEnd - left.normalizedStart)
    );
  });

  const spans: PhraseSpan[] = [];
  let reach = 0;
  for (const candidate of ordered) {
    if (candidate.normalizedStart < reach) continue;
    // Re-checked, and not redundantly: step 1 filtered against the state as it
    // stood *before* this run, and a run can carry the same phrase twice. The
    // first occurrence claims the slot inside this loop, and the second has to
    // see that. Claiming here rather than at filter time is also what makes
    // suppression occurrence-local — only a candidate that actually became a
    // span burns the phrase's section slot.
    if (!state.eligible(candidate.entry.alias)) continue;
    state.claim(candidate.entry.alias);
    reach = candidate.normalizedEnd;
    // Both indices are in range by construction: a candidate's normalized
    // bounds came from walking this same run, and every normalized position has
    // a recorded source extent. The `??` discharges an index signature the type
    // system cannot narrow, not a case that can occur.
    spans.push(
      PhraseSpan.make({
        start: run.starts[candidate.normalizedStart] ?? 0,
        end: run.ends[candidate.normalizedEnd - 1] ?? 0,
        slug: candidate.entry.slug,
        alias: candidate.entry.alias,
      }),
    );
  }
  return spans;
};

/** Matches one text run in isolation: a fresh section, one run.
 *
 *  The offsets index into `text` exactly as supplied — no pilcrow stripping, no
 *  trimming — because the caller is about to slice this same string to render
 *  the spans and any silent rewrite here would desynchronize the two. */
export const matchRun = (automaton: PhraseAutomaton, text: string): readonly PhraseSpan[] => {
  const run = normalizeScan(text);
  return resolve(automaton.candidates(run), run, new SectionMatchState());
};

/** Matches the runs of one section, sharing §4.5's per-phrase state across them.
 *
 *  Returns one span list per run, in input order, with offsets local to that
 *  run. Parallel rather than flat: a chapter's runs are separate strings, and a
 *  global offset would be a fiction no renderer could slice with. */
export const matchSection = (
  automaton: PhraseAutomaton,
  texts: readonly string[],
  state: SectionMatchState = new SectionMatchState(),
): SectionSpans => {
  const result: (readonly PhraseSpan[])[] = [];
  for (const text of texts) {
    const run = normalizeScan(text);
    result.push(resolve(automaton.candidates(run), run, state));
  }
  return result;
};

// ---------------------------------------------------------------------------
// §4.6 projections
//
// The two structures the app renders phrase links into, each reduced to the
// runs the matcher is allowed to see. Both live here rather than at the call
// site so the boundary rule is one decision instead of one per host.
// ---------------------------------------------------------------------------

/** Spans per `TextSegment` of one verse, sharing the section's phrase state.
 *
 *  Only `text` segments are entered, on the same discipline
 *  `applySearchHighlights` (`bible-rendering/segments.ts`) already uses: italic,
 *  red letter, and margin anchors carry semantics a second overlay would fight,
 *  and a `margin` segment has no text at all. A phrase cannot cross into a
 *  neighbouring segment because the neighbour is simply not part of any run.
 *
 *  One entry per input segment, aligned by index, so a renderer walks segments
 *  and spans together. A non-`text` segment gets an empty list rather than being
 *  dropped — dropping would shift every later index and hand the renderer the
 *  wrong spans for the wrong segment. */
export const matchSegments = (
  automaton: PhraseAutomaton,
  segments: readonly TextSegment[],
  state: SectionMatchState = new SectionMatchState(),
): SectionSpans => {
  const result: (readonly PhraseSpan[])[] = [];
  for (const segment of segments) {
    if (segment.type !== 'text') {
      result.push([]);
      continue;
    }
    const run = normalizeScan(segment.text);
    result.push(resolve(automaton.candidates(run), run, state));
  }
  return result;
};

/** One EGW `Text` node and the spans matched inside it.
 *
 *  Identified by its node value rather than by an index into a flattened list:
 *  the AST is a tree, and a renderer walking it needs to look a node up, not
 *  count its position in a traversal it would have to reproduce exactly.
 *
 *  `Text`, not `Node`: `matchNodes` emits an entry for exactly one variant, and
 *  the wider type would make every consumer re-discover that by switching on a
 *  `_tag` the producer already decided, or by casting. Milestone 6's renderer
 *  reads `entry.node.text` to slice the spans out of, and the type says it can. */
export interface NodeSpans {
  readonly node: EgwText;
  readonly spans: readonly PhraseSpan[];
}

/** Spans per matchable `Text` node of an EGW paragraph, in document order.
 *
 *  §4.6's second half: a span never enters a `ScriptureRef` or a `BookRef`,
 *  because those nodes already carry link semantics. The rule is enforced by
 *  *not descending* into them — their text never becomes a run, so there is no
 *  span to reject later. `Emphasis`, `Comment`, and `Unknown` are descended:
 *  they are styling and forward-compat wrappers, not links, and a phrase inside
 *  an `<em>` is still a phrase. Each `Text` node is its own run, so a phrase
 *  cannot span a `<br>` or a page break either. */
export const matchNodes = (
  automaton: PhraseAutomaton,
  nodes: readonly EgwNode[],
  state: SectionMatchState = new SectionMatchState(),
): readonly NodeSpans[] => {
  const result: NodeSpans[] = [];
  const walk = (current: readonly EgwNode[]): void => {
    for (const node of current) {
      switch (node._tag) {
        case 'Text': {
          const run = normalizeScan(node.text);
          result.push({ node, spans: resolve(automaton.candidates(run), run, state) });
          break;
        }
        case 'ScriptureRef':
        case 'BookRef':
          break;
        case 'Emphasis':
        case 'Comment':
        case 'Unknown':
          walk(node.children);
          break;
        case 'LineBreak':
        case 'PageBreak':
          break;
      }
    }
  };
  walk(nodes);
  return result;
};

/** The wire encoding of a run's spans, so the CLI's `--json` and any future RPC
 *  serialize through one codec rather than two projections. */
export const PhraseSpansJson = Schema.Array(PhraseSpan);
export type PhraseSpansJson = typeof PhraseSpansJson.Encoded;
