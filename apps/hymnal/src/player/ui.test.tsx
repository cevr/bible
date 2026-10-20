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

const morning = Option.getOrThrow(hymnAt('100'));
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
  const press = (label: string) =>
    act(() => {
      const target = Option.getOrThrow(find(`[aria-label="${label}"]`));
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
  return {
    device,
    until,
    find,
    press,
    /** A command from elsewhere in the app: another hymn's page, or the lock screen. */
    send: (command: Command) => act(() => registry.set(player.send, command)),
    text: () => host.textContent,
    [Symbol.dispose]: () => {
      act(() => root.unmount());
      host.remove();
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
      const bar = Option.getOrThrow(page.find('input[type="range"]'));
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

  it.live('seeks where the reader lets go of the bar', () =>
    Effect.gen(function* () {
      using page = mount();
      page.press('Play hymn 100');
      page.device.now = { state: 'playing', positionMs: 10_000, durationMs: 151_000 };
      yield* page.until(Player.$is('Playing'));

      const bar = Option.getOrThrow(page.find('input[type="range"]'));
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      act(() => {
        setValue?.call(bar, '75');
        bar.dispatchEvent(new Event('input', { bubbles: true }));
      });
      act(() => void bar.dispatchEvent(new Event('pointerup', { bubbles: true })));
      yield* page.until((player) => Player.$is('Playing')(player) && player.at === 75);
      expect(page.device.now.positionMs).toBe(75_000);
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
