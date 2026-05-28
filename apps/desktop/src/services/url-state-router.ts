import type { Stream } from 'effect';
import { Context, Effect, Layer, Option, SubscriptionRef } from 'effect';

// Canonical URL representation of "where the user is reading right now".
//
// Two top-level modes share the URL hash, so the encoding must unambiguously
// disambiguate which mode + selection the hash names. Bible has (book, chapter,
// optional verse); EGW has (bookId, optional chapterParaId, optional
// highlightParaId).
//
// Grammar:
//   #/bible/<book>/<chapter>
//   #/bible/<book>/<chapter>/<verse>
//   #/egw/book/<bookId>
//   #/egw/<bookId>/<chapterParaId>
//   #/egw/<bookId>/<chapterParaId>/<highlightParaId>
//
// Empty hash, malformed hash, or any path that doesn't match → `Option.none`.
// Validation of the *values* (e.g. "is bookId 200 actually a real book?") is
// NOT this service's job — consumers reject unknown ids when they replay the
// selection into their state machines.
export type UrlSelection =
  | { readonly _tag: 'bible-chapter'; readonly book: number; readonly chapter: number }
  | {
      readonly _tag: 'bible-verse';
      readonly book: number;
      readonly chapter: number;
      readonly verse: number;
    }
  | { readonly _tag: 'egw-book'; readonly bookId: number }
  | {
      readonly _tag: 'egw-chapter';
      readonly bookId: number;
      readonly chapterParaId: string;
    }
  | {
      readonly _tag: 'egw-highlight';
      readonly bookId: number;
      readonly chapterParaId: string;
      readonly highlightParaId: string;
    };

// Encode a selection into a hash fragment (including the leading `#`). `None`
// encodes to the empty string, which `history.replaceState(null, '', '')`
// interprets as "no hash" — clearing the URL back to its origin path.
export const encode = (sel: Option.Option<UrlSelection>): string => {
  if (Option.isNone(sel)) return '';
  const v = sel.value;
  switch (v._tag) {
    case 'bible-chapter':
      return `#/bible/${String(v.book)}/${String(v.chapter)}`;
    case 'bible-verse':
      return `#/bible/${String(v.book)}/${String(v.chapter)}/${String(v.verse)}`;
    case 'egw-book':
      return `#/egw/book/${String(v.bookId)}`;
    case 'egw-chapter':
      return `#/egw/${String(v.bookId)}/${encodeURIComponent(v.chapterParaId)}`;
    case 'egw-highlight':
      return `#/egw/${String(v.bookId)}/${encodeURIComponent(v.chapterParaId)}/${encodeURIComponent(v.highlightParaId)}`;
  }
};

const parsePositiveInt = (raw: string | undefined): number | undefined => {
  if (raw === undefined || raw === '') return undefined;
  // Reject anything that isn't a base-10 non-negative integer: stops "1.5",
  // "0x10", "1e3", and trailing garbage like "43abc" from sneaking through.
  if (!/^[0-9]+$/.test(raw)) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
};

// Parse a hash fragment back into a selection. Returns `None` on:
//   - empty string
//   - missing leading `#`
//   - unrecognized leading segment (anything other than `bible`/`egw`)
//   - missing required numeric ids
//   - too few or too many path segments for the matched variant
//
// Decoding leaves *value* validation to the consumer (e.g. "is book 200 a
// real Bible book?" / "does this paraId exist?"). That keeps the router
// schema-free and free to be shared between modes that have different id
// spaces.
export const decode = (hash: string): Option.Option<UrlSelection> => {
  if (hash === '' || hash === '#') return Option.none();
  if (!hash.startsWith('#/')) return Option.none();
  const segments = hash.slice(2).split('/');
  const [mode, ...rest] = segments;
  if (mode === 'bible') {
    if (rest.length < 2 || rest.length > 3) return Option.none();
    const book = parsePositiveInt(rest[0]);
    const chapter = parsePositiveInt(rest[1]);
    if (book === undefined || chapter === undefined) return Option.none();
    if (rest.length === 2) {
      return Option.some({ _tag: 'bible-chapter', book, chapter });
    }
    const verse = parsePositiveInt(rest[2]);
    if (verse === undefined) return Option.none();
    return Option.some({ _tag: 'bible-verse', book, chapter, verse });
  }
  if (mode === 'egw') {
    // Two shapes: `book/<id>` (whole-book selection) and `<id>/<paraId>...`
    // (chapter / highlight). Distinguish by whether the second segment is
    // the literal `book`.
    if (rest.length === 0) return Option.none();
    if (rest[0] === 'book') {
      if (rest.length !== 2) return Option.none();
      const bookId = parsePositiveInt(rest[1]);
      if (bookId === undefined) return Option.none();
      return Option.some({ _tag: 'egw-book', bookId });
    }
    if (rest.length < 2 || rest.length > 3) return Option.none();
    const bookId = parsePositiveInt(rest[0]);
    if (bookId === undefined) return Option.none();
    const chapterParaIdRaw = rest[1];
    if (chapterParaIdRaw === undefined || chapterParaIdRaw === '') return Option.none();
    let chapterParaId: string;
    try {
      chapterParaId = decodeURIComponent(chapterParaIdRaw);
    } catch {
      return Option.none();
    }
    if (rest.length === 2) {
      return Option.some({ _tag: 'egw-chapter', bookId, chapterParaId });
    }
    const highlightRaw = rest[2];
    if (highlightRaw === undefined || highlightRaw === '') return Option.none();
    let highlightParaId: string;
    try {
      highlightParaId = decodeURIComponent(highlightRaw);
    } catch {
      return Option.none();
    }
    return Option.some({ _tag: 'egw-highlight', bookId, chapterParaId, highlightParaId });
  }
  return Option.none();
};

export interface UrlStateRouterShape {
  /** Read the current hash. Returns `None` on empty or unrecognized hash. */
  readonly read: Effect.Effect<Option.Option<UrlSelection>>;
  /** Replace the hash via `history.replaceState`. No history entries are
   *  piled up — back/forward only step through user-initiated navigations,
   *  not every selection mirror. No-op when the encoded value matches the
   *  current hash (avoids a spurious `popstate` re-emit). */
  readonly write: (sel: Option.Option<UrlSelection>) => Effect.Effect<void>;
  /** Stream of selections from `popstate` events (back/forward). Each event
   *  emits the freshly-decoded hash. */
  readonly popstate: Stream.Stream<Option.Option<UrlSelection>>;
}

// Live layer — wraps the DOM History API + `popstate` event. The popstate
// channel is backed by a SubscriptionRef so multiple subscribers (a boot-time
// replay fiber and any future "log every URL change" debug consumer) share
// the same emit stream rather than each re-attaching their own
// `addEventListener`.
const makeLive = Effect.gen(function* () {
  const popstateRef = yield* SubscriptionRef.make<Option.Option<UrlSelection>>(Option.none());

  // The DOM event handler must be sync; we capture the runtime that
  // constructs this layer and use it to push the decoded selection into
  // the SubscriptionRef. `SubscriptionRef.set` on a non-async Ref is
  // effectively synchronous so this never blocks the event-loop turn.
  const handler = (): void => {
    const next = decode(window.location.hash);
    Effect.runSync(SubscriptionRef.set(popstateRef, next));
  };

  yield* Effect.acquireRelease(
    Effect.sync(() => {
      window.addEventListener('popstate', handler);
    }),
    () =>
      Effect.sync(() => {
        window.removeEventListener('popstate', handler);
      }),
  );

  return {
    read: Effect.sync(() => decode(window.location.hash)),
    write: (sel) =>
      Effect.sync(() => {
        const next = encode(sel);
        // Avoid rewriting when the value hasn't changed — keeps the
        // back/forward stack quiet and prevents observable noise on
        // the `popstate` channel for redundant mirrors.
        if (next === window.location.hash) return;
        // `replaceState` requires SOMETHING for the URL when we want to
        // clear the hash. Passing the current pathname + search keeps the
        // rest of the URL untouched while the fragment is wiped.
        const url =
          next === ''
            ? `${window.location.pathname}${window.location.search}`
            : `${window.location.pathname}${window.location.search}${next}`;
        window.history.replaceState(null, '', url);
      }),
    popstate: SubscriptionRef.changes(popstateRef),
  } satisfies UrlStateRouterShape;
});

// Test layer — backed by an in-memory hash string + a simulated popstate
// channel. Lets tests exercise the read/write/popstate triad without touching
// `window.location` (which jsdom *does* expose but is awkward to reset between
// cases) and lets headless test runners use it.
const makeTest = (initialHash: string) =>
  Effect.gen(function* () {
    const hashRef = yield* SubscriptionRef.make(initialHash);
    const popstateRef = yield* SubscriptionRef.make<Option.Option<UrlSelection>>(Option.none());
    const shape: UrlStateRouterTestShape = {
      read: SubscriptionRef.get(hashRef).pipe(Effect.map(decode)),
      write: (sel) =>
        Effect.gen(function* () {
          const next = encode(sel);
          const curr = yield* SubscriptionRef.get(hashRef);
          if (curr === next) return;
          yield* SubscriptionRef.set(hashRef, next);
        }),
      popstate: SubscriptionRef.changes(popstateRef),
      // Test-only escape hatch: simulate a back/forward event. Not part of
      // the public service shape — call sites cast to `UrlStateRouterTestShape`
      // to opt in.
      _simulatePopstate: (next: string) =>
        Effect.gen(function* () {
          yield* SubscriptionRef.set(hashRef, next);
          yield* SubscriptionRef.set(popstateRef, decode(next));
        }),
    };
    return shape;
  });

// Public test layer shape — exposes the same surface plus the simulator hook.
export interface UrlStateRouterTestShape extends UrlStateRouterShape {
  readonly _simulatePopstate: (next: string) => Effect.Effect<void>;
}

export class UrlStateRouter extends Context.Service<UrlStateRouter, UrlStateRouterShape>()(
  '@bible/desktop/services/UrlStateRouter',
) {
  // `Layer.effect` auto-strips Scope in v4, so the acquire/release pair
  // inside `makeLive` lives for the layer's own lifetime (= ManagedRuntime
  // dispose).
  static layer = Layer.effect(UrlStateRouter, makeLive);

  /** In-memory test layer. `initialHash` seeds the simulated `location.hash`. */
  static layerTest = (initialHash: string = '') =>
    Layer.effect(UrlStateRouter, makeTest(initialHash));
}
