/**
 * The player's controls on the web: the hymn page's control and the
 * now-playing bar, mounted in a browser's document (`src/test/setup.ts`)
 * over a player whose device the test holds (`src/test/device.ts`).
 */

import { RegistryContext } from '@effect/atom-react';
import { describe, expect, it } from 'effect-bun-test';
import { Duration, Effect, Option, Stream } from 'effect';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { hymnAt } from '~/hymns/hymns';
import { audioUrl } from '~/remote';

import { fakeDevice } from '../test/device';
import { opened } from '../test/one';
import { PlayerContext } from './context';
import { NowPlayingBar } from './NowPlayingBar';
import { Command, Player, playerOn } from './player';
import { PlayerControl } from './PlayerControl';
import { useCommitAtRest, useScrub } from './scrub';

const morning = Option.getOrThrow(hymnAt('100'));

const setValue = (input: HTMLInputElement, value: string) =>
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);

/** The reader's pointer on the bar: `pointerdown` opens a press, `pointerup` ends it. */
const pointer = (bar: HTMLInputElement, type: 'pointerdown' | 'pointerup' | 'pointercancel') =>
  bar.dispatchEvent(
    new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, pointerType: 'touch' }),
  );

/** The reader moves the bar to `value`: the browser sets it and says `input`. */
const drag = (bar: HTMLInputElement, value: string) => {
  setValue(bar, value);
  bar.dispatchEvent(new Event('input', { bubbles: true }));
};

/**
 * The browser's `change` after a drag: it fits the bar's value to its step,
 * as Chrome does and happy-dom does not, then says `change`.
 */
const release = (bar: HTMLInputElement) => {
  const step = Number(bar.step) || 1;
  setValue(bar, String(Math.round(Number(bar.value) / step) * step));
  bar.dispatchEvent(new Event('change', { bubbles: true }));
};
const praise = Option.getOrThrow(hymnAt('1'));

/**
 * The bar and hymn `shown`'s control over a fresh player, mounted in the
 * document; it unmounts when the test's `using` ends.
 */
const mount = (shown = morning) => {
  opened.splice(0);
  const { device, layer } = fakeDevice();
  const player = playerOn(layer, Duration.millis(1));
  const registry = AtomRegistry.make();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <RegistryContext value={registry}>
        <PlayerContext value={Option.some(player)}>
          <PlayerControl track={shown} />
          <NowPlayingBar />
        </PlayerContext>
      </RegistryContext>,
    ),
  );
  /** Wait, as the page shows each change, until the player's state is one `holds` is true of. */
  const until = (holds: (player: Player) => boolean) =>
    Effect.promise(() =>
      act(() =>
        Effect.runPromise(
          AtomRegistry.toStream(registry, player.state).pipe(
            Stream.filter(holds),
            Stream.runHead,
            Effect.asVoid,
            Effect.timeoutOrElse({
              duration: Duration.seconds(2),
              orElse: () =>
                Effect.die(`no such state; it stayed ${registry.get(player.state)._tag}`),
            }),
          ),
        ),
      ),
    );
  const find = (selector: string) => Option.fromNullishOr(host.querySelector(selector));
  /** The position bar, once it shows. */
  const bar = () =>
    Option.getOrThrow(
      Option.filter(
        find('input[type="range"]'),
        (found): found is HTMLInputElement => found instanceof HTMLInputElement,
      ),
    );
  const press = (label: string) =>
    act(() => {
      const target = Option.getOrThrow(find(`[aria-label="${label}"]`));
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
  return {
    device,
    until,
    find,
    bar,
    press,
    /** A command from elsewhere in the app: another hymn's page, or the lock screen. */
    send: (command: Command) => act(() => registry.set(player.send, command)),
    text: () => host.textContent,
    [Symbol.dispose]: () => {
      act(() => root.unmount());
      host.remove();
      registry.dispose();
    },
  };
};

describe('the hymn page’s recording control', () => {
  it.live('plays hymn 100: loading, then playing with its place and length, then paused', () =>
    Effect.gen(function* () {
      using page = mount();
      expect(page.text()).toContain('Recording');
      page.press('Play hymn 100');
      yield* page.until(Player.$is('Loading'));
      expect(page.device.played).toEqual([audioUrl(100)]);
      expect(page.text()).toContain('Loading the recording…');
      expect(Option.isSome(page.find('[aria-label="Loading hymn 100"]'))).toBe(true);

      page.device.now = { state: 'playing', positionMs: 62_000, durationMs: 151_000 };
      yield* page.until(Player.$is('Playing'));
      const bar = page.bar();
      expect({
        value: bar.getAttribute('value'),
        max: bar.getAttribute('max'),
        said: bar.getAttribute('aria-valuetext'),
      }).toEqual({ value: '62', max: '151', said: '1:02 of 2:31' });
      expect(page.text()).toContain('1:02');
      expect(page.text()).toContain('2:31');

      page.press('Pause hymn 100');
      yield* page.until(Player.$is('Paused'));
      expect(page.text()).toContain('Paused');
      expect(Option.isSome(page.find('[aria-label="Play hymn 100"]'))).toBe(true);
    }),
  );

  it.live('seeks once the reader lets go of the bar, and the bar then follows playback', () =>
    Effect.gen(function* () {
      using page = mount();
      page.press('Play hymn 100');
      page.device.now = { state: 'playing', positionMs: 10_400, durationMs: 151_000 };
      yield* page.until((player) => Player.$is('Playing')(player) && player.at === 10.4);
      const bar = page.bar();

      act(() => void pointer(bar, 'pointerdown'));
      act(() => drag(bar, '75'));
      expect(page.device.sought).toEqual([]);
      act(() => void pointer(bar, 'pointerup'));
      // Playing on between the pointer's release and the browser's `change`.
      page.device.now = { ...page.device.now, positionMs: 75_400 };
      yield* page.until((player) => Player.$is('Playing')(player) && player.at === 75.4);
      act(() => release(bar));
      // One seek across the release and its `change`.
      expect(page.device.sought).toEqual([75_000]);

      page.device.now = { ...page.device.now, positionMs: 80_400 };
      yield* page.until((player) => Player.$is('Playing')(player) && player.at === 80.4);
      expect(bar.getAttribute('aria-valuetext')).toBe('1:20 of 2:31');
      // A key's release with no step (a bare Shift) sends nothing.
      act(
        () => void bar.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Shift' })),
      );
      act(() => void bar.dispatchEvent(new Event('change', { bubbles: true })));
      expect(page.device.sought).toEqual([75_000]);
    }),
  );

  it.live('sends nothing on a `change` the browser fits from a fractional place', () =>
    Effect.gen(function* () {
      using page = mount();
      page.press('Play hymn 100');
      page.device.now = { state: 'playing', positionMs: 80_400, durationMs: 151_000 };
      yield* page.until((player) => Player.$is('Playing')(player) && player.at === 80.4);
      const bar = page.bar();

      // Chrome holds the place on the bar's step, and says `change` with it.
      act(() => {
        setValue(bar, '80');
        bar.dispatchEvent(new Event('change', { bubbles: true }));
      });
      page.device.now = { ...page.device.now, positionMs: 85_400 };
      yield* page.until((player) => Player.$is('Playing')(player) && player.at === 85.4);
      expect(bar.getAttribute('aria-valuetext')).toBe('1:25 of 2:31');
      expect(page.device.sought).toEqual([]);
    }),
  );

  it.live('seeks a key’s step at once, with no press', () =>
    Effect.gen(function* () {
      using page = mount();
      page.press('Play hymn 100');
      page.device.now = { state: 'playing', positionMs: 40_200, durationMs: 151_000 };
      yield* page.until((player) => Player.$is('Playing')(player) && player.at === 40.2);
      const bar = page.bar();

      // ArrowRight: Chrome steps the value and says `input`, then `change`.
      act(() => drag(bar, '41'));
      expect(page.device.sought).toEqual([41_000]);
      act(() => void bar.dispatchEvent(new Event('change', { bubbles: true })));
      expect(page.device.sought).toEqual([41_000]);
    }),
  );

  it.live('holds the place it sent until the player reaches it', () =>
    Effect.gen(function* () {
      using page = mount();
      page.press('Play hymn 100');
      page.device.now = { state: 'playing', positionMs: 10_000, durationMs: 151_000 };
      yield* page.until(Player.$is('Playing'));
      const bar = page.bar();

      page.device.lagging = true;
      act(() => {
        pointer(bar, 'pointerdown');
        drag(bar, '75');
        pointer(bar, 'pointerup');
        release(bar);
      });
      expect(page.device.sought).toEqual([75_000]);
      // The device still plays at the old place while its seek goes.
      page.device.now = { ...page.device.now, positionMs: 10_500 };
      yield* page.until((player) => Player.$is('Playing')(player) && player.at === 10.5);
      expect(bar.getAttribute('aria-valuetext')).toBe('1:15 of 2:31');

      // The seek lands, and the bar follows the player again.
      page.device.now = { ...page.device.now, positionMs: 75_200 };
      yield* page.until((player) => Player.$is('Playing')(player) && player.at === 75.2);
      page.device.now = { ...page.device.now, positionMs: 80_000 };
      yield* page.until((player) => Player.$is('Playing')(player) && player.at === 80);
      expect(bar.getAttribute('aria-valuetext')).toBe('1:20 of 2:31');
    }),
  );

  it.live('drops a drag the page takes away, unsent', () =>
    Effect.gen(function* () {
      using page = mount();
      page.press('Play hymn 100');
      page.device.now = { state: 'playing', positionMs: 10_000, durationMs: 151_000 };
      yield* page.until(Player.$is('Playing'));
      const bar = page.bar();

      act(() => {
        pointer(bar, 'pointerdown');
        drag(bar, '95');
        pointer(bar, 'pointercancel');
      });
      page.device.now = { ...page.device.now, positionMs: 80_000 };
      yield* page.until((player) => Player.$is('Playing')(player) && player.at === 80);
      expect(bar.getAttribute('aria-valuetext')).toBe('1:20 of 2:31');
      expect(page.device.sought).toEqual([]);
    }),
  );

  it.live('keeps the bar and Pause while the recording loads again mid-hymn', () =>
    Effect.gen(function* () {
      using page = mount();
      page.press('Play hymn 100');
      page.device.now = { state: 'playing', positionMs: 60_000, durationMs: 151_000 };
      yield* page.until(Player.$is('Playing'));

      page.device.now = { state: 'loading', positionMs: 61_000 };
      yield* page.until(Player.$is('Buffering'));
      expect(page.text()).toContain('Loading the recording…');
      expect(page.bar().getAttribute('aria-valuetext')).toBe('1:01 of 2:31');

      page.press('Pause hymn 100');
      yield* page.until(Player.$is('Paused'));
      expect(page.device.now.state).toBe('paused');
    }),
  );

  it.live(
    'says a recording needs a connection when the device is offline, and plays on Retry',
    () =>
      Effect.gen(function* () {
        using page = mount();
        page.device.online = false;
        page.press('Play hymn 100');
        yield* page.until(Player.$is('Failed'));
        expect(page.text()).toContain('The recording needs a connection.');

        page.device.online = true;
        page.press('Retry hymn 100');
        yield* page.until(Player.$is('Loading'));
        expect(page.device.played).toEqual([audioUrl(100), audioUrl(100)]);
      }),
  );

  it.live(
    'offers Play on another hymn’s page while hymn 100 plays, and playing it replaces 100',
    () =>
      Effect.gen(function* () {
        using page = mount(praise);
        page.send(Command.Start({ track: morning }));
        page.device.now = { state: 'playing', positionMs: 5_000, durationMs: 151_000 };
        yield* page.until(Player.$is('Playing'));
        expect(Option.getOrThrow(page.find('[aria-label="Play hymn 1"]')).textContent).toBe('Play');

        page.press('Play hymn 1');
        yield* page.until((player) => Player.$is('Loading')(player) && player.track.number === 1);
        expect(page.device.played).toEqual([audioUrl(100), audioUrl(1)]);
        expect(Option.isSome(page.find(`[aria-label="Now playing 1, ${praise.title}"]`))).toBe(
          true,
        );
      }),
  );
});

describe('the now-playing bar', () => {
  it.live('draws nothing until a hymn plays, then shows it and opens it', () =>
    Effect.gen(function* () {
      using page = mount();
      expect(Option.isNone(page.find('[aria-label="Now playing"]'))).toBe(true);

      page.press('Play hymn 100');
      page.device.now = { state: 'playing', positionMs: 5_000, durationMs: 151_000 };
      yield* page.until(Player.$is('Playing'));
      const bar = Option.getOrThrow(page.find('[aria-label="Now playing"]'));
      expect(bar.textContent).toBe(`100${morning.title}Pause`);
      const link = Option.getOrThrow(page.find(`[aria-label="Now playing 100, ${morning.title}"]`));
      expect(link.getAttribute('href')).toBe('/hymns/100');

      page.press(`Now playing 100, ${morning.title}`);
      expect(opened).toEqual(['/hymns/100']);
    }),
  );

  it.live('pauses from the bar while another hymn’s page shows', () =>
    Effect.gen(function* () {
      // The page shows hymn 1; the bar holds hymn 100, started on its own page.
      using page = mount(praise);
      page.send(Command.Start({ track: morning }));
      page.device.now = { state: 'playing', positionMs: 5_000, durationMs: 151_000 };
      yield* page.until(Player.$is('Playing'));

      page.press('Pause hymn 100');
      yield* page.until(Player.$is('Paused'));
      expect(page.device.now.state).toBe('paused');
      expect(Option.getOrThrow(page.find('[aria-label="Now playing"]')).textContent).toBe(
        `100${morning.title}Play`,
      );
    }),
  );
});

/**
 * A bar over `useScrub` alone, at a player that stays at 0:10, its seeks
 * kept: it lets a drag go once it rests for 20 ms, as iOS's and Android's
 * bars do, and holds a place it sent for `settle`. It unmounts when the
 * test's `using` ends.
 */
const hooked = (settle: Duration.Input = Duration.seconds(2)) => {
  const sought = new Array<number>();
  const bar = { scrub: Option.none<ReturnType<typeof useScrub>>() };
  function Bar() {
    const scrub = useScrub(
      { at: 10, length: Option.some(151), onSeek: (s) => sought.push(s) },
      settle,
    );
    useCommitAtRest(scrub, Duration.millis(20));
    bar.scrub = Option.some(scrub);
    return <></>;
  }
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() => root.render(<Bar />));
  let mounted = true;
  const scrub = () => Option.getOrThrow(bar.scrub);
  const unmount = () => {
    if (mounted) act(() => root.unmount());
    mounted = false;
  };
  return {
    sought,
    value: () => scrub().value,
    change: (seconds: number) => act(() => scrub().change(seconds)),
    /** The web's press: down, a move to `seconds`, and up. */
    drag: (seconds: number) =>
      act(() => {
        scrub().press();
        scrub().move(seconds);
        scrub().release();
      }),
    /** Wait while the bar rests past its `rest`. */
    rest: Effect.promise(() => act(() => Effect.runPromise(Effect.sleep(Duration.millis(60))))),
    /** Wait, as the bar draws, until `holds` is true of its value. */
    until: (holds: (value: number) => boolean) =>
      // Each look lets a millisecond pass inside `act`, so the bar draws what came in it.
      Effect.promise(() => act(() => Effect.runPromise(Effect.sleep(Duration.millis(1))))).pipe(
        Effect.map(() => scrub().value),
        Effect.repeat({ until: holds }),
        Effect.timeoutOrElse({
          duration: Duration.seconds(1),
          orElse: () => Effect.die(`the bar stayed at ${scrub().value}`),
        }),
      ),
    unmount,
    [Symbol.dispose]: unmount,
  };
};

describe('a bar that tells no drag’s end (iOS, Android)', () => {
  it.live('sends the drag once, where it rests, and nothing while it moves', () =>
    Effect.gen(function* () {
      using bar = hooked();
      bar.change(40);
      bar.change(70);
      expect(bar.sought).toEqual([]);
      yield* bar.rest;
      expect(bar.sought).toEqual([70]);
      yield* bar.rest;
      expect(bar.sought).toEqual([70]);
    }),
  );

  it.live('sends nothing once the bar is gone before the drag rests', () =>
    Effect.gen(function* () {
      using bar = hooked();
      bar.change(40);
      bar.unmount();
      yield* bar.rest;
      expect(bar.sought).toEqual([]);
    }),
  );
});

describe('the place a bar sent', () => {
  it.live('is held while the player is elsewhere, then given up after `settle`', () =>
    Effect.gen(function* () {
      // The player never reaches 1:15: a seek the device refused, or one that never lands.
      using bar = hooked(Duration.millis(30));
      bar.drag(75);
      expect(bar.sought).toEqual([75]);
      expect(bar.value()).toBe(75);
      yield* bar.until((value) => value === 10);
    }),
  );
});
