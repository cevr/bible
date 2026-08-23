/** One lookup, two seams, byte-identical JSON (§7, M7 acceptance).
 *
 *  The same parity claim `host-parity.test.ts` makes for a composed page and
 *  `study/host-parity.test.ts` makes for a study bundle, for select-to-lookup.
 *  The web worker and Electron main are not two implementations — both register
 *  `BibleProcedureHandlers` over the same `LookupService`, so comparing their
 *  wires would compare a value to itself. The CLI is the genuinely separate
 *  seam: it resolves `LookupService` directly and serializes the result itself.
 *
 *  So the claim asserted here is: **the five groups the RPC handler returns and
 *  the five groups the CLI prints are the same value, encoded by the same
 *  schema, in the same order.** One fixture feeds both — the shared
 *  `WIKI_LOOKUP_FIXTURE_LAYER` — and the comparison is on encoded JSON, because
 *  JSON is what reaches a client and group *order* only exists there.
 */

import { Effect, Layer, Option, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { RpcTest } from 'effect/unstable/rpc';

import { Reference } from '../bible/model.js';
import { BibleProcedureGroup } from '../procedure/group.js';
import { BibleProcedureHandlers } from '../procedure/handlers.js';
import { LookupInput, LookupResultJson } from './lookup-model.js';
import { LookupService } from './lookup-service.js';
import {
  LOOKUP_CONTEXT,
  WIKI_LOOKUP_FIXTURE_LAYER,
  WIKI_PAGE_FIXTURE,
  wikiLookupProcedureDependencies,
} from './page-fixture.js';

const handlers = BibleProcedureHandlers.pipe(Layer.provide(wikiLookupProcedureDependencies));

const SELECTION = WIKI_PAGE_FIXTURE.phrase;

/** The verse address for the `--context` half of the payload: Daniel 8:13, the
 *  one §7's command line names.
 *
 *  The fixture's `verse_words` answer it, and that is load-bearing. With no
 *  matching words the Strong's group was empty on both sides, so the equality
 *  below held just as well for a handler that dropped `context` on the floor —
 *  the field crossed the wire and nothing downstream could tell. */
const CONTEXT = Reference.verse(LOOKUP_CONTEXT.book, LOOKUP_CONTEXT.chapter, LOOKUP_CONTEXT.verse);

const encode = Schema.encodeEffect(Schema.fromJsonString(LookupResultJson));

const overCli = (input: LookupInput) =>
  Effect.flatMap(LookupService, (service) => service.resolve(input)).pipe(
    Effect.provide(WIKI_LOOKUP_FIXTURE_LAYER),
  );

/** The RPC half of every parity claim below: one call through a test client
 *  over the same fixture-backed handlers, with the layer provided at this
 *  function's own boundary rather than inside a test's generator. */
const overRpcCall = (payload: { readonly text: string; readonly context?: typeof CONTEXT }) =>
  Effect.gen(function* () {
    const client = yield* RpcTest.makeClient(BibleProcedureGroup);
    return yield* client['v1.wiki.lookup.resolve'](payload);
  }).pipe(Effect.provide(handlers));

describe('wiki lookup host parity', () => {
  it.scoped('the RPC handler and the CLI serialize the identical result', () =>
    Effect.gen(function* () {
      const overRpc = yield* overRpcCall({ text: SELECTION });

      const direct = yield* overCli(LookupInput.make({ text: SELECTION, context: Option.none() }));

      expect(yield* encode(overRpc)).toBe(yield* encode(direct));

      // Not vacuous: four of the five groups really answered for this phrase,
      // so an equality of two empty results could not produce this.
      expect(direct.topics.map((match) => String(match.slug))).toEqual([WIKI_PAGE_FIXTURE.slug]);
      expect(direct.verses.length).toBeGreaterThan(0);
      expect(direct.writings.length).toBeGreaterThan(0);
      expect(direct.catalog.length).toBeGreaterThan(0);
      expect(direct.lonePeek).toBe(false);
    }),
  );

  it.scoped('the optional context crosses the wire and both seams agree', () =>
    Effect.gen(function* () {
      const overRpc = yield* overRpcCall({ text: SELECTION, context: CONTEXT });

      const direct = yield* overCli(
        LookupInput.make({ text: SELECTION, context: Option.some(CONTEXT) }),
      );

      expect(yield* encode(overRpc)).toBe(yield* encode(direct));

      // Not vacuous: the context really located the selection in Daniel 8:13,
      // so the Strong's group answered. A handler that decoded the payload
      // without passing `context` through would produce two empty groups that
      // agree with each other and with nothing the reader asked for.
      expect(overRpc.strongs.map((hit) => hit.word)).toEqual(['sanctuary']);
      const without = yield* overRpcCall({ text: SELECTION });
      expect(without.strongs).toEqual([]);
    }),
  );

  it.scoped('the five groups arrive in §7 order, every one of them present', () =>
    Effect.gen(function* () {
      // The panel's row order is the encoding's key order (`LookupResult`'s
      // field order), and it is what all three clients draw. A group that
      // resolved to nothing is still a key.
      const overRpc = yield* overRpcCall({ text: 'nothing names this' });

      const wire = yield* Schema.encodeEffect(LookupResultJson)(overRpc);
      expect(Object.keys(wire)).toEqual([
        'text',
        'topics',
        'strongs',
        'verses',
        'writings',
        'catalog',
        'lonePeek',
      ]);
    }),
  );
});
