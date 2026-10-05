import { expectTypeOf, test } from 'bun:test';
import { Duration, Effect, Logger, Option, References, Schema } from 'effect';
import * as Arbitrary from 'effect/Arbitrary';
import { describe, expect, it } from 'effect-bun-test';

import * as Codec from './codec.js';
import * as Field from './field.js';
import * as Place from './place.js';
import { printHref, readHref } from './url-parts.js';

/** The lab's place, as the README shows it. */
const Lab = Place.make({
  path: '/films/:film/lab/:scene',
  params: { film: Codec.Segment, scene: Codec.Segment },
  query: Field.struct({ cue: Field.key(Codec.Text, { default: '', history: 'push' }) }),
  hash: Field.struct({
    t: Field.key(Codec.Finite, { default: 0, throttle: '250 millis' }),
  }),
});

/** A repeated key of fixed words (`?section=bible&section=egw`): the shape of
 *  egw-search's axes, which read their values through core's codec. */
const Sections = Schema.Array(Codec.literals(['bible', 'egw', 'pioneer']));

/** A workspace of panes, shaped as egw-search's is. */
const Pane = Field.struct(
  {
    q: Field.key(Codec.Text, { default: '', history: 'push' }),
    scope: Field.key(Codec.literals(['all', 'egw', 'bible']), { default: 'all' }),
    section: Field.keys(Sections),
    excludeApparatus: Field.key(Codec.Flag, { default: false }),
    limit: Field.key(
      Codec.Finite.pipe(
        Codec.truncate,
        (n) => n.check(Schema.isGreaterThan(0)),
        Codec.clamp({ max: 100 }),
      ),
      { default: 40 },
    ),
  },
  { keys: { excludeApparatus: 'noref' } },
);
const paneKey = (name: string, pane: number): string =>
  Option.match(
    Option.liftPredicate(pane, (index) => index > 0),
    { onNone: () => name, onSome: (index) => `${name}${String(index + 1)}` },
  );
const Workspace = Place.make({
  path: '/',
  query: Field.indexed(Pane, { max: 4, key: paneKey, marker: 'q' }),
});

/** Every building block in every section, for the round-trip property. */
const Everything = Place.make({
  path: '/sets/:folder/:point',
  params: { folder: Codec.Segment, point: Codec.Segment },
  query: Field.struct({
    text: Field.key(Codec.Text, { default: '' }),
    count: Field.key(Codec.Int, { default: 0 }),
    ratio: Field.key(Codec.Finite, { default: 1 }),
    on: Field.key(Codec.Flag, { default: false }),
    axis: Field.keys(Sections),
  }),
  hash: Field.struct({
    t: Field.key(Codec.Finite, { default: 0 }),
    note: Field.key(Codec.Text, { default: '' }),
  }),
});

/** decode(encode(x)) is x for every value the place's type admits. */
const roundTrips = <A>(place: Place.Place<A>) =>
  Effect.gen(function* () {
    const equivalent = Schema.toEquivalence(Schema.toType(place.schema));
    const result = yield* Arbitrary.checkEffect(
      Arbitrary.schema(Schema.toType(place.schema)),
      (value) =>
        Option.match(Place.decode(place, Place.href(place, value)), {
          onNone: () => false,
          onSome: (back) => equivalent(back, value),
        }),
      { runs: 300 },
    );
    expect(Arbitrary.formatCheckFailure(result)).toBeUndefined();
  });

/** How a link can write a number: as JavaScript prints it, in exponent form,
 *  with a fixed fraction, far past the safe range, or as `-0`. */
const NumberText = Arbitrary.all({
  n: Arbitrary.schema(Schema.Finite),
  form: Arbitrary.schema(Schema.Literals(['plain', 'exponent', 'fraction', 'large', 'minus zero'])),
}).pipe(
  Arbitrary.map(({ n, form }) => {
    const write = {
      plain: () => String(n),
      exponent: () => n.toExponential(),
      fraction: () => n.toFixed(3),
      large: () => String((Math.abs(n) + 1) * 1e21),
      'minus zero': () => '-0',
    };
    return write[form]();
  }),
);

/** A link written by hand reads to a value whose href reads back as itself
 *  (the first write is the canonical one), and the value is `expected`. */
const settlesOnce = <A>(
  place: Place.Place<A>,
  link: (text: string) => string,
  expected: (text: string, value: A) => boolean,
) =>
  Effect.gen(function* () {
    const canonical = (href: string) =>
      Option.map(Place.decode(place, href), (value) => Place.href(place, value));
    const result = yield* Arbitrary.checkEffect(
      NumberText,
      (text) => {
        const href = link(encodeURIComponent(text));
        const once = canonical(href);
        return (
          Option.exists(Place.decode(place, href), (value) => expected(text, value)) &&
          Option.exists(once, (first) => Option.contains(canonical(first), first))
        );
      },
      { runs: 300 },
    );
    expect(Arbitrary.formatCheckFailure(result)).toBeUndefined();
  });

describe('UrlParts', () => {
  test('prints a folder as one segment and keeps colons, commas and slashes readable', () => {
    const href = printHref({
      path: ['sets', 'bible-tools/righteousness-by-faith', 'render:scenes:roof'],
      query: { q: ['latter rain'], type: ['book', '-periodical'] },
      hash: { t: ['1.5,4'], note: ['a/b'] },
    });
    expect(href).toBe(
      '/sets/bible-tools%2Frighteousness-by-faith/render:scenes:roof?q=latter+rain&type=book&type=-periodical#t=1.5,4&note=a/b',
    );
    expect(readHref(href)).toEqual({
      path: ['sets', 'bible-tools/righteousness-by-faith', 'render:scenes:roof'],
      query: { q: ['latter rain'], type: ['book', '-periodical'] },
      hash: { t: ['1.5,4'], note: ['a/b'] },
    });
  });

  test('reads the root as no segments, and a broken escape as written', () => {
    expect(readHref('/')).toEqual({ path: [], query: {}, hash: {} });
    expect(readHref('/a%zz?x=%zz#y=%zz')).toEqual({
      path: ['a%zz'],
      query: { x: ['%zz'] },
      hash: { y: ['%zz'] },
    });
  });
});

describe('Place', () => {
  test('reads and prints the lab place', () => {
    const href = '/films/righteousness-by-faith/lab/roof?cue=render:scenes:roof#t=1.5';
    const value = Place.decode(Lab, href);
    expect(value).toEqual(
      Option.some({
        path: { film: 'righteousness-by-faith', scene: 'roof' },
        query: { cue: 'render:scenes:roof' },
        hash: { t: 1.5 },
      }),
    );
    expect(Place.href(Lab, Option.getOrThrow(value))).toBe(
      '/films/righteousness-by-faith/lab/roof?cue=render%3Ascenes%3Aroof#t=1.5',
    );
  });

  test('prints a canonical href back exactly as it was read', () => {
    const canonical = [
      '/films/a/lab/b',
      '/films/a/lab/b?cue=x',
      '/films/a/lab/b#t=4.5',
      '/films/a/lab/b#t=-0.1',
      '/films/a/lab/b#t=1e%2B21',
      '/films/a%2Fb/lab/c%20d?cue=caf%C3%A9+au+lait#t=2',
    ];
    for (const href of canonical) {
      expect(Option.map(Place.decode(Lab, href), (value) => Place.href(Lab, value))).toEqual(
        Option.some(href),
      );
    }
  });

  test('leaves defaults out of the href', () => {
    expect(
      Place.href(Lab, {
        path: { film: 'a', scene: 'b' },
        query: { cue: '' },
        hash: { t: 0 },
      }),
    ).toBe('/films/a/lab/b');
  });

  test("a key's type is its codec's, not its default's", () => {
    type Pane = Place.Type<typeof Workspace>['query'][number];
    expectTypeOf<Pane['scope']>().toEqualTypeOf<'all' | 'egw' | 'bible'>();
    expectTypeOf<Pane['limit']>().toEqualTypeOf<number>();
  });

  test('is not the place when the path does not fit', () => {
    expect(Place.decode(Lab, '/films/a/scenes/b')).toEqual(Option.none());
    expect(Place.decode(Lab, '/films/a/lab')).toEqual(Option.none());
    expect(Place.decode(Workspace, '/no/such/page')).toEqual(Option.none());
  });

  it.effect(
    'a refused key reads as its default, logged at Debug, and the others still read',
    () => {
      const lines: Array<string> = [];
      return Effect.gen(function* () {
        const value = yield* Place.decodeEffect(Lab, '/films/a/lab/b?cue=x#t=4,1');
        expect(Option.map(value, (place) => [place.query.cue, place.hash.t])).toEqual(
          Option.some(['x', 0]),
        );
        expect(lines.some((line) => line.startsWith('url-state.key.invalid'))).toBe(true);
      }).pipe(
        Effect.provide(Logger.layer([Logger.make(({ message }) => lines.push(String(message)))])),
        Effect.provideService(References.MinimumLogLevel, 'Debug'),
      );
    },
  );

  it.effect('a hand-written limit truncates, then clamps; else it is the default', () =>
    settlesOnce(
      Workspace,
      (text) => `/?q=x&limit=${text}`,
      (text, value) => {
        const limit = Option.liftPredicate(
          Math.trunc(Number(text)),
          (n) => Number.isFinite(n) && n > 0,
        ).pipe(
          Option.map((n) => Math.min(n, 100)),
          Option.getOrElse(() => 40),
        );
        return value.query[0].limit === limit;
      },
    ),
  );

  it.effect('a hand-written integer or number reads as written, or as the default', () =>
    settlesOnce(
      Everything,
      (text) => `/sets/a/b?count=${text}&ratio=${text}`,
      (text, value) => {
        const n = Number(text);
        const count = Option.getOrElse(Option.liftPredicate(n, Number.isSafeInteger), () => 0);
        const ratio = Option.getOrElse(Option.liftPredicate(n, Number.isFinite), () => 1);
        return value.query.count === count && value.query.ratio === ratio;
      },
    ),
  );

  it.effect('the lab place round-trips every value', () => roundTrips(Lab));
  it.effect('a workspace of panes round-trips every value', () => roundTrips(Workspace));
  it.effect('every building block round-trips every value', () => roundTrips(Everything));
});

describe('Place.history', () => {
  const move = (from: string, to: string) => Place.history(Lab, from, to);

  test('a path change pushes', () => {
    expect(move('/films/a/lab/b', '/films/a/lab/c').history).toBe('push');
  });

  test('a citable key pushes, even beside a replacing one', () => {
    expect(move('/films/a/lab/b', '/films/a/lab/b?cue=x#t=3')).toEqual({
      history: 'push',
      throttle: Option.none(),
    });
  });

  test('the playhead alone replaces, throttled', () => {
    expect(move('/films/a/lab/b#t=1', '/films/a/lab/b#t=2')).toEqual({
      history: 'replace',
      throttle: Option.some(Duration.millis(250)),
    });
  });

  test('an undeclared key replaces', () => {
    expect(move('/films/a/lab/b', '/films/a/lab/b?other=1').history).toBe('replace');
  });

  test("a pane's query pushes and its filters replace", () => {
    const panes = (from: string, to: string) => Place.history(Workspace, from, to).history;
    expect(panes('/?q=a&q2=b', '/?q=a&q2=c')).toBe('push');
    expect(panes('/?q=a&q2=b', '/?q=a&q2=b&scope2=egw')).toBe('replace');
    expect(panes('/?q=a', '/?q=a&q2=')).toBe('push');
  });

  test('a key written another way, but meaning the same, is not a change', () => {
    const panes = (from: string, to: string) => Place.history(Workspace, from, to);
    expect(panes('/?q=x&q=y', '/?q=x&scope=egw')).toEqual({
      history: 'replace',
      throttle: Option.none(),
    });
    expect(panes('/?q=', '/?scope=egw').history).toBe('replace');
    expect(panes('/?q=x&limit=40', '/?q=x&noref=1').history).toBe('replace');
    expect(move('/films/a/lab/b?cue=', '/films/a/lab/b#t=2').history).toBe('replace');
    // A pane's presence is its meaning: adding an empty one still pushes.
    expect(panes('/?q=x&q2=', '/?q=x&q2=&scope=egw').history).toBe('replace');
    expect(panes('/?q=x', '/?q=x&q2=&scope2=egw').history).toBe('push');
  });
});
