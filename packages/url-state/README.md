# @bible/url-state

URL state as Effect Schemas: a page declares the address it lives at once, as
schemas, and reads and writes it through that one declaration. The model
follows [nuqs](https://nuqs.dev): each key has a codec and a default, a key
at its default is left out of the link, and a broken key reads as its default
rather than failing the page.

The core depends on `effect` alone. `@bible/url-state/atom` binds it to Effect
atoms, and `@bible/atom-solid` renders those atoms in Solid, on the server
and in the browser.

## The model

A URL has three parts: the path, a list of segments, and the query and the
hash, each a record of keys to lists of values:

```
/films/righteousness-by-faith/lab/roof?cue=render%3Ascenes%3Aroof#t=1.5
 └──────────── path ────────────────┘ └──────── query ─────────┘ └hash┘
```

One schema inside the package (`src/url-parts.ts`) runs between an href and
its parts (`{ path, query, hash }`), and is the only code that reads or prints
URL syntax. Path segments are percent-decoded, and printing keeps `:`, `@` and
`,` readable.
The query prints the way `URLSearchParams` does (so `:` is `%3A` there); the
hash prints as `k=v&…` and keeps `, : / @` readable.

A **place** is one address an app can be at: a path pattern with typed
params, and optionally a query section and a hash section (`Field.none`, the
section with no keys, when left out). Its schema runs between an href
and the place's value; `None` means the href is not this place.

```ts
import { Codec, Field, Place } from '@bible/url-state';

/** The film lab: a film's scene, the cue on screen, and the playhead. */
export const Lab = Place.make({
  path: '/films/:film/lab/:scene',
  params: { film: Codec.Segment, scene: Codec.Segment },
  query: Field.struct({ cue: Field.key(Codec.Text, { default: '', history: 'push' }) }),
  hash: Field.struct({
    t: Field.key(Codec.Finite, { default: 0, throttle: '250 millis' }),
  }),
});

Place.decode(Lab, '/films/rbf/lab/roof?cue=a#t=1.5');
// Some({ path: { film: 'rbf', scene: 'roof' },
//        query: { cue: 'a' },
//        hash: { t: 1.5 } })

Place.href(Lab, { path: { film: 'rbf', scene: 'roof' }, query: { cue: '' }, hash: { t: 0 } });
// '/films/rbf/lab/roof': both keys are at their defaults
```

Every place gets one more thing from its declaration: how a change enters
history. `Place.history(place, from, to)` says, for a move between two hrefs:

- a path change pushes;
- a change to a key declared `history: 'push'` (a citable key, like a query
  or a cue) pushes;
- any other change replaces (a refinement, a filter, the playhead);
- a move whose every changed key is throttled waits out the longest window.

Keys are compared by what they mean, each href read as the place writes it:
`?q=x&q=y` and `?q=x` are the same query, so a scope change beside it
replaces.

## Codecs are Schema transformations

Every codec is an Effect Schema from the URL's text to a value; encoding is
the same schema run the other way, so a link the app writes is a link it
reads, by construction. Property tests check `decode(encode(x)) = x` for
every value a place's type admits (`effect/Arbitrary`).

`Codec` holds the building blocks:

| Codec                       | Reads                    | Value                          |
| --------------------------- | ------------------------ | ------------------------------ |
| `Text`                      | any well-formed text     | `string`                       |
| `Segment`                   | a non-empty path segment | `string`, not `.` or `..`      |
| `Finite`, `Int`             | `1.5`, `1e1`             | `number`                       |
| `Flag`                      | `1`                      | `true`; anything else, `false` |
| `literals(values)`          | one of a fixed set       | the literal union              |
| `truncate(self)`            | `7.9`                    | `7`                            |
| `clamp({ min, max })(self)` | `200` with `max: 100`    | `100`                          |

A codec for one key is a `Schema.Codec<A, string>`; a codec for a repeated
key is a `Schema.Codec<A, ReadonlyArray<string>>`. Any schema of either shape
works: egw-search reads its signed axes (`?type=book&type=-periodical`) with
the API's own `SignedFromStrings` from `@bible/core/writings`, through
`Field.keys`, so the link and the endpoint share one codec.

`Field` lifts codecs to keys:

- `Field.key(codec, { default, history?, throttle? })`: one value, the first
  in the URL. Missing or refused, it reads as the default (a refusal is logged
  at Debug as `url-state.key.invalid`); at the default it is left out.
- `Field.keys(codec, { history?, throttle? })`: a repeated key, the whole
  list of values read by a list codec. No values is the default, and a value
  that writes none leaves the key out.
- `Field.struct(fields, { keys? })`: a section; `keys` renames a field in the
  URL (`{ excludeApparatus: 'noref' }`).
- `Field.indexed(section, { max, key, marker })`: copies of a section under
  suffixed keys (`q`, `q2`, `q3`). Copy 0 always exists; later copies exist
  while the URL holds any of their keys, and each writes its `marker` key,
  empty if need be, so a copy at its defaults survives the round trip.

A place's href holds only its declared keys: keys it does not declare are
dropped when it writes.

## The core services

`Location` is the one seam between URL state and whatever owns the address:

```ts
interface LocationService {
  readonly current: Effect<Entry>; // { href, key, navigation }
  readonly changes: Stream<Entry>; // the current entry, then each one after
  readonly push: (href: string) => Effect<void>;
  readonly replace: (href: string) => Effect<void>; // keeps the entry's key
  readonly back: Effect<void>; // as the Back button: lands as a `traverse`
}
```

Three layers fill it:

- `layerBrowser({ scrollRestoration? })`: the tab's `window.history`. Each
  entry carries `{ key }` in `history.state`; Back and Forward arrive as
  `traverse` entries. `back` at the tab's first entry leaves the page for the
  tab's previous one, so a page calls it only over an entry it pushed. It is
  the only module that touches `window.location`,
  `history` or `popstate`, and lint keeps `window.location`, `history` and
  `onpopstate` out of every other module of this package, of egw-search, and
  of the film's lab, player and browser modules (the film's lint also refuses
  a `popstate` listener there).
- `layerMemory(href)`: a history stack in memory; `back` at its first entry
  stays there. `LocationHistory` adds `forward` and the stack (`entries`)
  for a test to drive and read.
- `layerServer(href)`: the request URL without its hash, read-only. A write
  is ignored and logged at Debug (`location.server.write.ignored`); a `back`
  is ignored too (`location.server.back.ignored`).

Entry keys (`<ms>-<n>`; a server render's one entry is `'server'`) name
history entries, so anything remembered per entry
(a scroll position) is remembered against the key.

`UrlState` (`UrlState.layer`, over a `Location`) is where writes go:

- `UrlState.get(place)`: the place's value, `None` off the place.
- `UrlState.set(place, value)`: navigate to the value's href, moving as
  `Place.history` says; nothing when the href is the one already there.
- `UrlState.update(place, f)`: `set` with `f` of the value as the URL holds it
  now; nothing off the place.

Writes made in one tick (one microtask turn) see each other and flush as one
history entry: a push if any of them pushes, else a replace. A batch whose
keys are all throttled waits for its window; an unthrottled write takes it
along at once. Any entry that lands from elsewhere (Back, Forward, a push made
around `UrlState`) drops a write that has not flushed yet, and shows. A batch
whose writes end where the entry already is writes nothing.

## The atom binding

`@bible/url-state/atom` is a thin binding: every atom reads and writes through
the core's services and holds no URL state of its own.

```ts
import * as UrlAtom from '@bible/url-state/atom';

const lab = UrlAtom.place(Lab); // Writable<Option<Lab value>, Lab value>, one per place, at module level
```

- `UrlAtom.layer`: the registry's `Location` layer; the browser's unless
  seeded through the registry's initial values.
- `UrlAtom.place(place)`: the place's value; writing a value navigates to it.
  Every place atom derives from `UrlAtom.href`, so all of them agree within a
  tick, before the entry flushes.
- `UrlAtom.href`: the URL as the program's writes leave it.
- `UrlAtom.entry`: the history entry on screen, for per-entry memory.
- `UrlAtom.services`: `Location` and `UrlState`, built from `layer` and kept
  alive with the registry. A layer that carries its own `UrlState` gives that
  one, so a page whose host already writes through a `UrlState` has one.

```tsx
<RegistryProvider initialValues={[[UrlAtom.layer, layerBrowser({ scrollRestoration: 'manual' })]]}>
  <App />
</RegistryProvider>
```

A host that builds `Location` and `UrlState` itself (the film's pages) seeds
the layer with them, built: `[[UrlAtom.layer, Layer.succeedContext(host)]]`.
The registry's atoms then read and write through the host's own `UrlState`,
and no second one follows the address bar.

## Testing with the memory layer

The core is tested as Effect code over `layerMemory`:

```ts
const memory = UrlState.layer.pipe(Layer.provideMerge(layerMemory('/films/f/lab/s')));

it.effect('a citable key pushes', () =>
  Effect.gen(function* () {
    yield* UrlState.update(Lab, (value) => ({ ...value, query: { cue: 'c' } }));
    yield* Effect.yieldNow; // the tick ends; the entry flushes
    const { stack } = yield* (yield* LocationHistory).entries;
    expect(stack.map((entry) => entry.navigation)).toEqual(['load', 'push']);
  }).pipe(Effect.provide(memory)),
);
```

Throttle windows run on `Clock`, so `TestClock.adjust` moves them. Atoms are
tested the same way, with the built memory layer seeded into a registry:
`AtomRegistry.make({ initialValues: [[UrlAtom.layer, Layer.succeedContext(context)]] })`.
See `src/url-state.test.ts` and `src/atom.test.ts`.

## Server rendering

Importing the package on a server is safe: nothing runs at import, and no
module holds mutable state; each registry builds its own services.

Per request, seed the registry with the request URL:

```tsx
renderToString(() => (
  <RegistryProvider initialValues={[[UrlAtom.layer, layerServer(request.url)]]}>
    <App />
  </RegistryProvider>
));
```

Path and query read the same on the server and in the browser. A browser
never sends the hash, so a place with hash keys carries a server value
(`Atom.withServerValue`): the place read from its href without the hash,
every hash key at its default. `@bible/atom-solid`'s hooks render that value
on the server and through the client's hydration pass, so the two produce the
same markup, and then the real hash. `packages/atom-solid/test/ssr` proves it:
`server.test.ts` renders the lab place (in the gate), and
`bun run --cwd packages/atom-solid test:ssr` hydrates it in Chromium with a
hash in the URL and checks for no mismatch.
