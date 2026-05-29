import { Schemas } from '@bible/core/egw';
import { Effect, type Exit, Option, Schema } from 'effect';
import { createRoot, createSignal } from 'solid-js';
import { describe, expect, it } from 'vitest';
import { defineProcedures, mutation, query } from '../../src/ipc-cache/procedure.js';
import { buildIpc, IpcCacheError } from '../../src/ipc-cache/proxy.js';
import { clearAll } from '../../src/ipc-cache/registry.js';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const fakeRuntime = {
  runPromiseExit: <A, E>(effect: Effect.Effect<A, E>): Promise<Exit.Exit<A, E>> =>
    Effect.runPromiseExit(effect),
};

/**
 * Build a procedure tree with call counters so we can assert dedup,
 * refetch, and bypass behavior without touching real IPC. Each procedure
 * declares Schema for input + output and an Effect handler — same shape
 * the production tree will use.
 */
const makeFakeProcedures = () => {
  const calls = { fetchBooks: 0, fetchToc: 0, putBooks: 0 };
  const procedures = defineProcedures({
    egw: {
      fetchBooks: query({
        input: Schema.Struct({ lang: Schema.String }),
        output: Schema.String,
        handle: ({ lang }) =>
          Effect.sync(() => {
            calls.fetchBooks += 1;
            return `books:${lang}`;
          }),
      }),
      fetchToc: query({
        input: Schema.Struct({ bookId: Schema.Number }),
        output: Schema.String,
        handle: ({ bookId }) =>
          Effect.sync(() => {
            calls.fetchToc += 1;
            return `toc:${String(bookId)}`;
          }),
      }),
    },
    cache: {
      putBooks: mutation({
        input: Schema.Struct({ lang: Schema.String, json: Schema.String }),
        output: Schema.Void,
        handle: ({ lang, json }) =>
          Effect.sync(() => {
            calls.putBooks += 1;
            // void-typed handlers still need to yield an output for Schema.Void
            // to decode — return undefined explicitly.
            const _ = `${lang}:${json}`;
            return undefined;
          }),
      }),
    },
  });
  return { procedures, calls };
};

describe('buildIpc', () => {
  it('builds a proxy that mirrors the procedure namespace shape', () => {
    const { procedures } = makeFakeProcedures();
    const ipc = buildIpc(procedures, fakeRuntime);
    expect(ipc.egw.fetchBooks.query).toBeTypeOf('function');
    expect(ipc.egw.fetchBooks.invalidate).toBeTypeOf('function');
    expect(ipc.cache.putBooks.mutate).toBeTypeOf('function');
  });

  it('exposes invalidate on queries but not on mutations', () => {
    const { procedures } = makeFakeProcedures();
    const ipc = buildIpc(procedures, fakeRuntime);
    expect('invalidate' in ipc.egw.fetchBooks).toBe(true);
    expect('mutate' in ipc.egw.fetchBooks).toBe(false);
    expect('query' in ipc.cache.putBooks).toBe(false);
    expect('mutate' in ipc.cache.putBooks).toBe(true);
  });

  it('dedupes query subscribers across components with equal input', async () => {
    clearAll();
    const { procedures, calls } = makeFakeProcedures();
    const ipc = buildIpc(procedures, fakeRuntime);

    createRoot(() => {
      ipc.egw.fetchBooks.query({ lang: 'en' });
      ipc.egw.fetchBooks.query({ lang: 'en' });
      ipc.egw.fetchBooks.query({ lang: 'en' });
    });
    await tick();
    expect(calls.fetchBooks).toBe(1);
  });

  it('builds separate entries for different input values', async () => {
    clearAll();
    const { procedures, calls } = makeFakeProcedures();
    const ipc = buildIpc(procedures, fakeRuntime);

    createRoot(() => {
      ipc.egw.fetchBooks.query({ lang: 'en' });
      ipc.egw.fetchBooks.query({ lang: 'de' });
    });
    await tick();
    expect(calls.fetchBooks).toBe(2);
  });

  it('treats accessor input as a reactive source', async () => {
    clearAll();
    const { procedures, calls } = makeFakeProcedures();
    const ipc = buildIpc(procedures, fakeRuntime);

    let dispose!: () => void;
    const [lang, setLang] = createSignal('en');
    createRoot((d) => {
      dispose = d;
      ipc.egw.fetchBooks.query(() => ({ lang: lang() }));
    });
    await tick();
    expect(calls.fetchBooks).toBe(1);

    setLang('de');
    await tick();
    expect(calls.fetchBooks).toBe(2);

    setLang('en');
    await tick();
    // 'en' entry still cached from the first read — no refetch, just a
    // re-subscribe to the existing entry.
    expect(calls.fetchBooks).toBe(2);
    dispose();
  });

  it('mutate bypasses cache and always invokes the handler', async () => {
    clearAll();
    const { procedures, calls } = makeFakeProcedures();
    const ipc = buildIpc(procedures, fakeRuntime);

    await ipc.cache.putBooks.mutate({ lang: 'en', json: '[]' });
    await ipc.cache.putBooks.mutate({ lang: 'en', json: '[]' });
    expect(calls.putBooks).toBe(2);
  });

  it('invalidate drops an unsubscribed entry so the next query refetches', async () => {
    clearAll();
    const { procedures, calls } = makeFakeProcedures();
    const ipc = buildIpc(procedures, fakeRuntime);

    const dispose = createRoot((dispose) => {
      ipc.egw.fetchBooks.query({ lang: 'en' });
      return dispose;
    });
    await tick();
    dispose();

    ipc.egw.fetchBooks.invalidate({ lang: 'en' });

    createRoot(() => {
      ipc.egw.fetchBooks.query({ lang: 'en' });
    });
    await tick();
    expect(calls.fetchBooks).toBe(2);
  });

  it('passes options.ttlMs through without keying on it', async () => {
    clearAll();
    const { procedures, calls } = makeFakeProcedures();
    const ipc = buildIpc(procedures, fakeRuntime);

    createRoot(() => {
      ipc.egw.fetchBooks.query({ lang: 'en' });
      ipc.egw.fetchBooks.query({ lang: 'en' }, { ttlMs: 5000 });
    });
    await tick();
    // Both calls resolve to the same entry — TTL is an option, not a key.
    expect(calls.fetchBooks).toBe(1);
  });

  it('rejects mutations whose input fails Schema decode', async () => {
    clearAll();
    const procedures = defineProcedures({
      cache: {
        putAge: mutation({
          input: Schema.Struct({
            age: Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 150 })),
          }),
          output: Schema.Void,
          handle: () => Effect.void,
        }),
      },
    });
    const ipc = buildIpc(procedures, fakeRuntime);

    await expect(ipc.cache.putAge.mutate({ age: 999 } as { age: number })).rejects.toBeInstanceOf(
      IpcCacheError,
    );
  });

  it('propagates handler failures as IpcCacheError on mutate', async () => {
    clearAll();
    const procedures = defineProcedures({
      flaky: {
        boom: mutation({
          input: Schema.Void,
          output: Schema.Void,
          handle: () => Effect.die('IPC died'),
        }),
      },
    });
    const ipc = buildIpc(procedures, fakeRuntime);
    await expect(ipc.flaky.boom.mutate(undefined)).rejects.toBeInstanceOf(IpcCacheError);
  });

  it('captures the dotted procedure path in mutation errors', async () => {
    clearAll();
    const procedures = defineProcedures({
      foo: {
        bar: mutation({
          input: Schema.Void,
          output: Schema.Void,
          handle: () => Effect.die('nope'),
        }),
      },
    });
    const ipc = buildIpc(procedures, fakeRuntime);
    try {
      await ipc.foo.bar.mutate(undefined);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(IpcCacheError);
      expect((err as IpcCacheError).path).toBe('foo.bar');
    }
  });

  it('rejects when output fails Schema decode', async () => {
    clearAll();
    const procedures = defineProcedures({
      bad: {
        shape: mutation({
          input: Schema.Void,
          output: Schema.Struct({ count: Schema.Number }),
          handle: () => Effect.succeed({ count: 'not-a-number' } as unknown as { count: number }),
        }),
      },
    });
    const ipc = buildIpc(procedures, fakeRuntime);
    try {
      await ipc.bad.shape.mutate(undefined);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(IpcCacheError);
      expect((err as IpcCacheError).message).toMatch(/output decode failed/);
    }
  });
});

// Regression guard for the IPC boundary's encode/decode contract. The proxy
// decodes a handler's output via `Schema.decodeUnknownEffect(output)`, so a
// handler MUST return the schema's *Encoded* (wire) shape; the consumer
// receives the decoded Type. This broke `getToc`/`getChapterByParaId` etc.:
// their outputs use the real `Schemas.TocItem`/`Schemas.Paragraph`, whose
// `para_id`/`refcode_short` carry the non-idempotent
// `OptionFromOptionalNullishOrEmpty` transform (Type `Option<string>` ↔
// Encoded `string | null | undefined`). Handlers returned the already-decoded
// Option, and decoding an Option threw
// "output decode failed: Expected string | null | undefined, got some(...)".
//
// These tests use the production `Schemas.TocItem` (not a hand-rolled stand-in)
// so the guard also catches a future schema change that reintroduces a
// non-round-trippable transform. `mutate` returns the decoded output directly,
// which is the value a renderer consumer would read.
describe('IPC Option-transform output round-trip', () => {
  // Wire (Encoded) fixtures: present para_id, and an absent one. These are the
  // shapes the main process actually serializes across the preload bridge.
  const TOC_WIRE_PRESENT = {
    para_id: '978.2',
    level: 1,
    title: 'The Word of God',
    refcode_short: 'BHB 3',
    puborder: 3,
  } as const;
  const TOC_WIRE_ABSENT = {
    para_id: null,
    level: 0,
    title: 'Bible Handbook',
    refcode_short: null,
    puborder: 1,
  } as const;

  it('decodes para_id/refcode_short wire values back into Options for the consumer', async () => {
    clearAll();
    // Drive the proxy through a one-shot `mutate` (returns the decoded output
    // as a Promise — the value a renderer consumer would read). The output
    // schema and the `encodeEffect` handler mirror production `getToc` exactly.
    const ipc = buildIpc(
      defineProcedures({
        egw: {
          getTocOnce: mutation({
            input: Schema.Struct({ bookId: Schema.Number }),
            output: Schema.Array(Schemas.TocItem),
            // A correct handler hands back the WIRE shape via `encodeEffect`,
            // applied to the decoded domain (Type-side, Option) values.
            handle: () =>
              Schema.encodeEffect(Schema.Array(Schemas.TocItem))([
                {
                  ...TOC_WIRE_PRESENT,
                  para_id: Option.some('978.2'),
                  refcode_short: Option.some('BHB 3'),
                },
                { ...TOC_WIRE_ABSENT, para_id: Option.none(), refcode_short: Option.none() },
              ]),
          }),
        },
      }),
      fakeRuntime,
    );

    const decoded = await ipc.egw.getTocOnce.mutate({ bookId: 978 });

    expect(decoded).toHaveLength(2);
    // Present field → Option.some
    expect(Option.getOrNull(decoded[0]!.para_id)).toBe('978.2');
    expect(Option.getOrNull(decoded[0]!.refcode_short)).toBe('BHB 3');
    // Absent (null) field → Option.none
    expect(Option.isNone(decoded[1]!.para_id)).toBe(true);
    expect(Option.isNone(decoded[1]!.refcode_short)).toBe(true);
  });

  it('rejects a handler that returns the already-decoded Option (Type) shape', async () => {
    clearAll();
    // The original bug: handler returns the Type-side value (para_id already an
    // Option) instead of the wire shape. The proxy's decode then sees an Option
    // where it expects `string | null | undefined` and throws the exact error.
    const procedures = defineProcedures({
      egw: {
        getTocBad: mutation({
          input: Schema.Void,
          output: Schema.Array(Schemas.TocItem),
          handle: () =>
            // Cast: deliberately violate the (now-correct) Encoded handler
            // contract to reproduce the pre-fix shape.
            Effect.succeed([
              {
                para_id: Option.some('978.2'),
                level: 1,
                title: 'The Word of God',
                refcode_short: Option.some('BHB 3'),
                puborder: 3,
              },
            ] as unknown as ReadonlyArray<{
              readonly para_id: string | null | undefined;
              readonly level: number;
              readonly refcode_short: string | null | undefined;
              readonly puborder: number;
            }>),
        }),
      },
    });
    const ipc = buildIpc(procedures, fakeRuntime);
    try {
      await ipc.egw.getTocBad.mutate(undefined);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(IpcCacheError);
      expect((err as IpcCacheError).message).toMatch(/output decode failed/);
      // The decode error pinpoints the transform field + the offending Option.
      expect((err as IpcCacheError).message).toMatch(/para_id/);
    }
  });
});
