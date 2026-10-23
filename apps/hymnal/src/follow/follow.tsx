/* oxlint-disable effect/noGlobals -- the follow's host adapter: the follower's clock and timers are the platform's. */

/**
 * The follow on a hymn page, in React: the page's `useFollow` runs a
 * `Follower` over the player's state while the player is on the page's
 * hymn, and hands its lines the marks through `FollowProvider`. A line reads
 * its own mark (`useLineMark`) and gives its view to the follow
 * (`useLineView`), which measures it when it scrolls to it.
 *
 * Lines are measured against the scroll's content when the follow scrolls,
 * not kept from `onLayout`: a line's `onLayout` gives its place in its
 * section, and the content's size changes (chords, text size, a turn) are
 * met by scrolling the shown line back into place.
 */

import { RegistryContext, useAtomValue } from '@effect/atom-react';
import { Effect, Option } from 'effect';
import * as Atom from 'effect/reactivity/Atom';
import {
  createContext,
  type ReactNode,
  type RefCallback,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import type { HostInstance, LayoutChangeEvent, ScrollViewInstance, TextStyle } from 'react-native';

import { color, useAccent } from '~/color';
import { usePlayer } from '~/player/context';
import { Player } from '~/player/player';
import { settings } from '~/store';

import { book } from './book';
import { followerOf, type Report } from './follower';
import { handOf } from './hand';
import { type Marks, marksOf, OFF } from './marks';
import { seekCount } from './seeks';

interface Follow {
  readonly marks: Marks;
  /** Keeps line `index`'s view for measuring; the returned function lets it go. */
  readonly keep: (index: number, view: HostInstance) => () => void;
}

/** A page no player follows: no line is ever marked. */
const still: Follow = { marks: marksOf(), keep: () => () => {} };

const FollowContext = createContext<Follow>(still);

export function FollowProvider({
  value,
  children,
}: {
  readonly value: Follow;
  readonly children: ReactNode;
}) {
  return <FollowContext value={value}>{children}</FollowContext>;
}

/** Line `index`'s mark: `OFF`, or its sung syllable (`-1` for none). */
const useLineMark = (index: number): number => {
  const { marks } = use(FollowContext);
  const subscribe = useCallback(
    (listener: () => void) => marks.subscribe(index, listener),
    [marks, index],
  );
  const read = () => marks.markOf(index);
  // A page rendered on the server is not followed: its lines read their mark as the client does.
  return useSyncExternalStore(subscribe, read, read);
};

/**
 * Line `index` in the follow: whether it is the sung line, a ref for its
 * view (kept for the follow's scroll), and each syllable's colour, by its
 * place in the line from 0. The sung line's syllables are muted and its
 * sung syllable is the accent; a line not sung keeps its own colour. The
 * line is not boxed or tinted: in the light theme the ink is the accent, so
 * the sung syllable shows only against muted ones.
 */
export const useLineFollow = (index: number) => {
  const { keep } = use(FollowContext);
  const mark = useLineMark(index);
  const accent = useAccent();
  const marked = mark !== OFF;
  const ref = useCallback<RefCallback<HostInstance>>(
    (view) =>
      Option.match(Option.fromNullishOr(view), {
        onNone: () => {},
        onSome: (kept) => keep(index, kept),
      }),
    [keep, index],
  );
  const syllableStyle = (syllable: number): TextStyle => {
    if (!marked) return {};
    if (syllable === mark) return { color: accent };
    return { color: color.muted };
  };
  /** A line drawn as words alone (a Plain part) has no syllable to light: it is muted whole. */
  const wordsStyle = wordsStyleOf(marked);
  return { marked, ref, syllableStyle, wordsStyle };
};

const wordsStyleOf = (marked: boolean): TextStyle => {
  if (!marked) return {};
  return { color: color.muted };
};

/** The player's state when no player is provided. */
const idle = Atom.make<Player>(Player.Idle());

const away: Report = { _tag: 'Away' };

const reportOf = (number: number, state: Player): Report => {
  const here = (
    track: { readonly number: number },
    at: number,
    kind: 'playing' | 'waiting' | 'paused',
  ): Report => {
    if (track.number !== number) return away;
    return { _tag: 'Here', at: at * 1000, state: kind };
  };
  return Player.$match(state, {
    Idle: () => away,
    Loading: () => away,
    Playing: ({ track, at }) => here(track, at, 'playing'),
    Buffering: ({ track, at }) => here(track, at, 'waiting'),
    Paused: ({ track, at }) => here(track, at, 'paused'),
    Ended: () => away,
    Stopped: () => away,
    Failed: () => away,
  });
};

const dev = typeof __DEV__ !== 'undefined' && __DEV__;

/** The page's follow: its marks for the lines and the scroll's handlers. */
export const useFollow = (number: number) => {
  const state = useAtomValue(
    Option.match(usePlayer(), { onNone: () => idle, onSome: (player) => player.state }),
  );
  const registry = use(RegistryContext);
  /** The page's scroll, once drawn: React hands a ref over as nothing until then. */
  const scroll = useRef<Option.Option<ScrollViewInstance>>(Option.none());
  const scrollRef = useCallback<RefCallback<ScrollViewInstance>>((node) => {
    scroll.current = Option.fromNullishOr(node);
  }, []);
  const height = useRef(0);
  const views = useRef(new Map<number, HostInstance>());
  /** A line event names the clock the follow keeps: the recording with sound on, else the score. */
  const withClock = (event: string) => {
    if (!event.startsWith('line ')) return event;
    if (registry.get(settings.sound)) return `${event} clock=recording`;
    return `${event} clock=score`;
  };

  const follower = useMemo(
    () =>
      Option.map(book.of(number), (timeline) =>
        followerOf(timeline, {
          now: () => performance.now(),
          wake: (ms, run) => {
            const timer = setTimeout(run, ms);
            return () => clearTimeout(timer);
          },
          scrollTo: (line, animated) =>
            Option.all([
              Option.fromNullishOr(views.current.get(line)),
              scroll.current,
              Option.flatMap(scroll.current, (page) =>
                Option.fromNullishOr(page.getInnerViewRef()),
              ),
            ]).pipe(
              Option.map(([view, page, inner]) =>
                view.measureLayout(inner, (_x, y) =>
                  page.scrollTo({ y: Math.max(0, y - height.current / 3), animated }),
                ),
              ),
            ),
          log: (event) => {
            if (!dev) return;
            Effect.runSync(Effect.logInfo(`[follow] ${withClock(event)}`));
          },
        }),
      ),
    [number, registry],
  );

  useEffect(() => {
    Option.map(follower, (f) => f.report(reportOf(number, state)));
  }, [follower, number, state]);
  useEffect(
    () => () => Option.match(follower, { onNone: () => {}, onSome: (f) => f.stop() }),
    [follower],
  );
  // Each seek the player asks, of any size, ends a hand pause (`seeks.ts`). The count is read
  // first: the read starts the atom on its ref, and a seek is a count past the one read.
  useEffect(
    () =>
      Option.match(follower, {
        onNone: () => () => {},
        onSome: (f) => {
          let heard = registry.get(seekCount);
          return registry.subscribe(seekCount, (count) => {
            if (count === heard) return;
            heard = count;
            f.seek();
          });
        },
      }),
    [follower, registry],
  );

  const follow = useMemo<Follow>(
    () =>
      Option.match(follower, {
        onNone: () => still,
        onSome: ({ marks }) => ({
          marks,
          keep: (index, view) => {
            views.current.set(index, view);
            return () => {
              if (views.current.get(index) === view) views.current.delete(index);
            };
          },
        }),
      }),
    [follower],
  );

  const subscribeHeld = useCallback(
    (listener: () => void) =>
      Option.match(follower, {
        onNone: () => () => {},
        onSome: (f) => f.held.subscribe(listener),
      }),
    [follower],
  );
  const readHeld = () =>
    Option.match(follower, { onNone: () => false, onSome: (f) => f.held.get() });
  const held = useSyncExternalStore(subscribeHeld, readHeld, readHeld);

  return {
    follow,
    /** The page's scroll's ref. */
    scroll: scrollRef,
    /** Whether a hand scroll holds the follow: the page shows `Resume follow`. */
    held,
    /** The `Resume follow` pill's press. */
    resume: () => Option.map(follower, (f) => f.resume()),
    /** The scroll's handlers that tell the follow a hand scroll began (`hand.ts`). */
    hand: handOf(() => Option.map(follower, (f) => f.drag())),
    onLayout: (event: LayoutChangeEvent) => {
      height.current = event.nativeEvent.layout.height;
    },
    onContentSizeChange: () => Option.map(follower, (f) => f.relayout()),
  };
};
