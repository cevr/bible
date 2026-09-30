import { describe, expect, test } from 'bun:test';
import { Option, Result } from 'effect';
import { type Addressable, addressKey, addressOf, resolveAddress } from './address.ts';
import { layout } from './layout.ts';

const none = { act: Option.none(), scene: Option.none(), short: Option.none() };

/** Four scenes of 4, 5, 6 and 7 s, two acts, and one short over `b`. */
const film: Addressable = {
  name: 'f',
  placed: Result.getOrThrow(
    layout(
      [
        { id: 'a', min: 4 },
        { id: 'b', min: 5 },
        { id: 'c', min: 6 },
        { id: 'd', min: 7 },
      ],
      { voice: '', scenes: {} },
    ),
  ),
  look: Option.some({
    acts: [
      { from: 'a', name: 'open' },
      { from: 'c', name: 'close' },
    ],
  }),
  shorts: [
    {
      id: 'clip',
      title: 'A clip',
      spans: [{ scene: 'b', from: { at: 'start' }, to: { at: 'end' } }],
    },
  ],
};

const failure = <A, E extends { readonly _tag: string }>(r: Result.Result<A, E>) =>
  Option.map(Result.getFailure(r), (e) => e._tag);

describe('addressOf', () => {
  test('no flag names the film; one names its scope', () => {
    expect(Result.getOrThrow(addressOf(none))).toEqual({ _tag: 'Film' });
    expect(Result.getOrThrow(addressOf({ ...none, act: Option.some('open') }))).toEqual({
      _tag: 'Act',
      act: 'open',
    });
    expect(Result.getOrThrow(addressOf({ ...none, scene: Option.some(['b', 'a']) }))).toEqual({
      _tag: 'Scenes',
      ids: ['b', 'a'],
    });
    expect(Result.getOrThrow(addressOf({ ...none, short: Option.some('clip') }))).toEqual({
      _tag: 'Short',
      id: 'clip',
    });
  });

  test('two scopes at once fail, naming both', () => {
    const both = addressOf({ ...none, scene: Option.some(['a']), short: Option.some('clip') });
    expect(Result.getFailure(both)).toMatchObject(Option.some({ given: ['scenes', 'short'] }));
  });
});

describe('resolveAddress', () => {
  const [a, b, c, d] = film.placed;
  const end = (d?.start ?? 0) + (d?.dur ?? 0);

  test('the film covers every scene and every act, with no span of its own', () => {
    const whole = Result.getOrThrow(resolveAddress(film, { _tag: 'Film' }));
    expect(whole.scenes.map((p) => p.spec.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(whole.span).toEqual(Option.none());
    expect(whole.acts.map((s) => s.part.name)).toEqual(['open', 'close']);
  });

  test('a film that declares no look has no acts to judge', () => {
    const bare = Result.getOrThrow(
      resolveAddress({ ...film, look: Option.none() }, { _tag: 'Film' }),
    );
    expect(bare.acts).toEqual([]);
  });

  test('an act spans its scenes and is judged whole', () => {
    const close = Result.getOrThrow(resolveAddress(film, { _tag: 'Act', act: 'close' }));
    expect(close.scenes.map((p) => p.spec.id)).toEqual(['c', 'd']);
    expect(close.span).toEqual(Option.some({ from: c?.start ?? 0, to: end }));
    expect(close.acts.map((s) => s.part.name)).toEqual(['close']);
  });

  test('scenes span from the first to start to the last to end, in film order; no act is judged', () => {
    const named = Result.getOrThrow(resolveAddress(film, { _tag: 'Scenes', ids: ['c', 'b'] }));
    expect(named.scenes.map((p) => p.spec.id)).toEqual(['b', 'c']);
    expect(named.span).toEqual(
      Option.some({ from: b?.start ?? 0, to: (c?.start ?? 0) + (c?.dur ?? 0) }),
    );
    expect(named.acts).toEqual([]);
    expect(a?.start).toBe(0);
  });

  test('scenes named in either order are one part: one address, one key', () => {
    const keyOf = (ids: readonly [string, ...Array<string>]) =>
      addressKey(Result.getOrThrow(resolveAddress(film, { _tag: 'Scenes', ids })).address);
    expect(keyOf(['c', 'b'])).toBe('scenes:b,c');
    expect(keyOf(['b', 'c'])).toBe(keyOf(['c', 'b']));
    expect(keyOf(['c', 'b', 'c'])).toBe('scenes:b,c');
  });

  test('a short covers its spans’ scenes and runs on its own clock', () => {
    const clip = Result.getOrThrow(resolveAddress(film, { _tag: 'Short', id: 'clip' }));
    expect(clip.scenes.map((p) => p.spec.id)).toEqual(['b']);
    expect(clip.span).toEqual(Option.none());
    expect(Option.map(clip.short, (s) => s.id)).toEqual(Option.some('clip'));
  });

  test('a name the film lacks fails once, here, with what it has', () => {
    expect(failure(resolveAddress(film, { _tag: 'Act', act: 'middle' }))).toEqual(
      Option.some('UnknownAct'),
    );
    expect(failure(resolveAddress(film, { _tag: 'Scenes', ids: ['b', 'z'] }))).toEqual(
      Option.some('UnknownScene'),
    );
    expect(failure(resolveAddress(film, { _tag: 'Short', id: 'reel' }))).toEqual(
      Option.some('UnknownShort'),
    );
    const broken = {
      ...film,
      shorts: [
        {
          id: 'clip',
          title: 'A clip',
          spans: [{ scene: 'b', from: { mark: 'nope' }, to: { at: 'end' } }],
        },
      ],
    } as const satisfies Addressable;
    expect(failure(resolveAddress(broken, { _tag: 'Short', id: 'clip' }))).toEqual(
      Option.some('UnknownMark'),
    );
    expect(
      failure(resolveAddress({ ...film, look: Option.none() }, { _tag: 'Act', act: 'open' })),
    ).toEqual(Option.some('UnknownAct'));
  });
});
