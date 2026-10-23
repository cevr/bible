/**
 * The follow on a whole hymn page (A7), drawn by react-native-web under
 * happy-dom: the sung line and word, how many lines draw again when a
 * syllable moves, a hand scroll's pause and its pill, and a seek.
 *
 * The page hears the player through its state alone, so a writable atom
 * stands in for the player's state. Reports step 200 ms at a time, inside
 * the clock's slack, as the player's polls do; a jump past the slack is a
 * seek. happy-dom lays nothing out, so each line measures itself at
 * `TOP + STEP * index` (at once, where the web measures on the next turn of
 * the loop) and the scroll's `scroll` is a spy: a scroll to `y` is a scroll
 * to line `(y - TOP) / STEP` (the page's height reads 0, so the line sits at
 * the top).
 *
 * `HangingLine` is wrapped in a counter of its draws by line; the wrapper
 * draws the real line.
 */

import { describe, expect, it, mock } from 'bun:test';
import { RegistryContext } from '@effect/atom-react';
import { Array as Arr, Duration, Match, Option } from 'effect';
import * as Atom from 'effect/reactivity/Atom';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';

import { hymnAt } from '~/hymns/hymns';
import { PlayerContext } from '~/player/context';
import { Player, playerOn } from '~/player/player';
import * as Hanging from '~/reader/HangingLine';
import { HymnPage } from '~/reader/HymnPage';
import { fakeDevice } from '~/test/device';
import { readerOn } from '~/test/reader';

import { book } from './book';
import type { Timeline } from './timeline';

/** Draws of `HangingLine` by its line index. */
const draws = new Map<number, number>();
const drawn = Hanging.HangingLine;
// oxlint-disable-next-line effect/noModuleMocks -- a line's draws are counted on the real page, so its line is wrapped; the wrapper draws the real line, and no other test file shares this file's process (test:slow runs it alone).
mock.module('~/reader/HangingLine', () => ({
  HangingLine: (props: ComponentProps<typeof drawn>) => {
    draws.set(props.index, (draws.get(props.index) ?? 0) + 1);
    return drawn(props);
  },
}));

const TOP = 1000;
const STEP = 100;
const ACCENT = 'var(--accent)';
const MUTED = 'var(--muted)';

const timelineOf = (number: number): Timeline => Option.getOrThrow(book.of(number));

const lineOf = (timeline: Timeline, k: number) => Option.getOrThrow(Arr.get(timeline.lines, k));

/** The first played line with syllable times whose sung word changes inside it. */
const wordLineOf = (timeline: Timeline) => {
  const k = timeline.lines.findIndex(
    (line) => line.played && !line.even && new Set(line.words).size >= 2,
  );
  const line = lineOf(timeline, k);
  /** The first syllable of the line's second word. */
  const second = line.words.findIndex((word) => word !== line.words[0]);
  return { k, line, second, at: Option.getOrThrow(Arr.get(line.syllables, second)) };
};

/** The first hymn with a played line that has no syllable times (line-level or Plain), and that line. */
const lineLevel = () =>
  Option.getOrThrow(
    Arr.findFirst(Arr.range(1, 695), (number) =>
      Option.match(book.of(number), {
        onNone: () => Option.none(),
        onSome: (timeline) =>
          Option.map(
            Arr.findFirstIndex(
              timeline.lines,
              (line) => line.played && line.syllables.length === 0,
            ),
            (k) => ({ number, k, start: lineOf(timeline, k).start }),
          ),
      }),
    ),
  );

/** Hymn `number`'s page over a player whose state the test sets; it unmounts when the `using` ends. */
const mount = (number: number, chords: boolean = false) => {
  const hymn = Option.getOrThrow(hymnAt(String(number)));
  const track = { number, title: hymn.title };
  const state = Atom.make<Player>(Player.Idle());
  const player = { ...playerOn(fakeDevice().layer, Duration.millis(1)), state };
  const registry = AtomRegistry.make();
  const device = new Map<string, string>();
  if (chords) device.set('chords', 'true');
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <RegistryContext value={registry}>
        <PlayerContext value={Option.some(player)}>
          <HymnPage hymn={hymn} reader={readerOn(device)} />
        </PlayerContext>
      </RegistryContext>,
    ),
  );
  const lines = () => [...host.querySelectorAll<HTMLElement>('[data-testid="line"]')];
  lines().forEach((line, k) =>
    Object.assign(line, {
      measureLayout: (_to: HTMLElement, done: (x: number, y: number) => void) =>
        done(0, TOP + STEP * k),
    }),
  );
  const scroll = Option.getOrThrow(
    Option.fromNullishOr(host.querySelector<HTMLElement>('[data-testid="hymn-scroll"]')),
  );
  const scrolled: Array<number> = [];
  Object.assign(scroll, {
    scroll: (to: ScrollToOptions) => scrolled.push(((to.top ?? 0) - TOP) / STEP),
  });
  /** The player is at `ms` into the hymn: playing, or paused. */
  const at = (ms: number, kind: 'Playing' | 'Paused' = 'Paused') => {
    const told = { track, at: ms / 1000, length: Option.none<number>() };
    const player = Match.value(kind).pipe(
      Match.when('Playing', () => Player.Playing(told)),
      Match.orElse(() => Player.Paused(told)),
    );
    act(() => registry.set(state, player));
  };
  const selected = () =>
    lines().flatMap((line, k) =>
      Arr.filter([k], () => line.getAttribute('aria-selected') === 'true'),
    );
  /**
   * In line `k`, the colour of each word (chords off) or each syllable
   * (chords on, where the chord names above them keep their own colour).
   */
  const colours = (k: number) =>
    Option.match(Arr.get(lines(), k), {
      onNone: () => [],
      onSome: (line) => {
        const syllables = [...line.querySelectorAll<HTMLElement>('[data-testid^="syllable-"]')];
        if (syllables.length > 0) return syllables.map((el) => el.style.color);
        return [...line.querySelectorAll<HTMLElement>(':scope > *')].map((el) => el.style.color);
      },
    });
  const pill = () =>
    Option.fromNullishOr(host.querySelector<HTMLElement>('[aria-label="Resume follow"]'));
  /** A hand scroll as the web sees it: a wheel on the page (`hand.ts`). */
  const drag = () =>
    act(() => {
      scroll.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -120 }));
    });
  const press = () => act(() => Option.getOrThrow(pill()).click());
  return {
    at,
    selected,
    colours,
    pill,
    drag,
    press,
    scrolled,
    lines,
    [Symbol.dispose]: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
};

describe('the follow on a hymn page', () => {
  it('marks only the sung line, and in it only the sung word in the accent, with chords off and on', () => {
    const { k, line, second, at } = wordLineOf(timelineOf(100));
    const sung = line.words[second];
    for (const chords of [false, true]) {
      using page = mount(100, chords);
      page.at(at);
      expect(page.selected()).toEqual([k]);
      // Chords off: one element per word, the sung one lit. Chords on: one per syllable, the sung word's lit.
      const lit = Match.value(chords).pipe(
        Match.when(true, () => line.words.map((word) => word === sung)),
        Match.orElse(() => page.colours(k).map((_, w) => w === sung)),
      );
      expect(page.colours(k)).toEqual(
        lit.map((on) =>
          Match.value(on).pipe(
            Match.when(true, () => ACCENT),
            Match.orElse(() => MUTED),
          ),
        ),
      );
      for (const other of page.lines().keys())
        if (other !== k) expect(page.colours(other)).not.toContain(ACCENT);
    }
  });

  it('marks a line with no syllable times but lights none of its words', () => {
    const { number, k, start } = lineLevel();
    using page = mount(number);
    page.at(start + 1);
    expect(page.selected()).toEqual([k]);
    expect(page.colours(k)).not.toContain(ACCENT);
  });

  it('draws one line again when the sung word moves, and two when the line changes', () => {
    const timeline = timelineOf(100);
    const { k, line, at } = wordLineOf(timeline);
    using page = mount(100);
    page.at(line.start);
    draws.clear();
    page.at(at);
    expect([...draws.keys()]).toEqual([k]);
    draws.clear();
    page.at(lineOf(timeline, k + 1).start);
    expect([...draws.keys()].toSorted((a, b) => a - b)).toEqual([k, k + 1]);
  });

  it('holds the scroll on a drag while the marks move on; the pill scrolls to the sung line and goes', () => {
    const timeline = timelineOf(100);
    using page = mount(100);
    const start = lineOf(timeline, 1).start;
    page.at(start, 'Playing');
    expect(page.scrolled.at(-1)).toBe(1);
    expect(Option.isNone(page.pill())).toBe(true);
    page.drag();
    expect(Option.isSome(page.pill())).toBe(true);
    const before = page.scrolled.length;
    const next = lineOf(timeline, 2).start;
    for (let ms = start + 200; ms < next + 200; ms += 200) page.at(ms, 'Playing');
    expect(page.selected()).toEqual([2]);
    expect(page.scrolled.length).toBe(before);
    page.press();
    expect(page.scrolled.at(-1)).toBe(2);
    expect(Option.isNone(page.pill())).toBe(true);
  });

  it('resumes on a seek and scrolls to the line sung there', () => {
    const timeline = timelineOf(100);
    using page = mount(100);
    page.at(lineOf(timeline, 1).start, 'Playing');
    page.drag();
    expect(Option.isSome(page.pill())).toBe(true);
    const j = timeline.lines.length - 2;
    page.at(lineOf(timeline, j).start + 1, 'Playing');
    expect(Option.isNone(page.pill())).toBe(true);
    expect(page.selected()).toEqual([j]);
    expect(page.scrolled.at(-1)).toBe(j);
  });
});
