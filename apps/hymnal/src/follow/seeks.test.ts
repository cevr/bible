/**
 * The seek count the page's follow hears (`seeks.ts`), under the app's
 * player over a device the test holds: a seek of any size counts once.
 */

import { Duration, Effect, Option, Stream, SubscriptionRef } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';

import { Command, Player, playerOn } from '../player/player';
import { fakeDevice } from '../test/device';
import { counted } from './seeks';

const morning = { number: 100, title: 'Hymn 100' };

/** The app's player over a fresh device with its seeks counted; its registry ends with the test's `using`. */
const open = () => {
  const count = Effect.runSync(SubscriptionRef.make(0));
  const { device, layer } = fakeDevice();
  const player = playerOn(counted(layer, count), Duration.millis(1));
  const registry = AtomRegistry.make();
  registry.mount(player.send);
  registry.mount(player.remote);
  return {
    device,
    count: SubscriptionRef.get(count),
    send: (command: Command) => registry.set(player.send, command),
    /** The player's state once `holds` is true of it. */
    until: (holds: (player: Player) => boolean) =>
      AtomRegistry.toStream(registry, player.state).pipe(
        Stream.filter(holds),
        Stream.runHead,
        Effect.map(Option.getOrThrow),
        Effect.timeout(Duration.seconds(2)),
      ),
    [Symbol.dispose]: () => registry.dispose(),
  };
};

const playingAt = (seconds: number) => (state: Player) =>
  Player.$is('Playing')(state) && state.at === seconds;

describe('the seek count', () => {
  it.live('counts a seek of 100 ms once, as it counts one of a minute', () =>
    Effect.gen(function* () {
      using app = open();
      app.send(Command.Start({ track: morning }));
      app.device.now = { state: 'playing', positionMs: 60_000, durationMs: 151_000 };
      yield* app.until(Player.$is('Playing'));
      expect(yield* app.count).toBe(0);

      app.send(Command.Seek({ seconds: 60.1 }));
      yield* app.until(playingAt(60.1));
      expect(app.device.sought).toEqual([60_100]);
      expect(yield* app.count).toBe(1);

      app.send(Command.Seek({ seconds: 120 }));
      yield* app.until(playingAt(120));
      expect(yield* app.count).toBe(2);
    }),
  );
});
