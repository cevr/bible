/**
 * The player over a device the test holds (`src/test/device.ts`): each
 * state and each move between them, as the reader and the lock screen
 * make them. A test waits on the state it expects, never a fixed time.
 */

import { Duration, Effect, Option, Schedule, Stream } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';

import { audioUrl } from '~/remote';

import { fakeDevice } from '../test/device';
import { Command, Player, playerOn } from './player';

/** The states in the order they came, each once however many reads repeat it. */
const moves = (tags: ReadonlyArray<Player['_tag']>) =>
  tags.filter((tag, index) => index === 0 || tag !== tags[index - 1]);

const morning = { number: 100, title: 'Great Is Thy Faithfulness' };
const praise = { number: 1, title: 'Praise to the Lord' };

/**
 * The app with a player over a fresh device, its commands and lock-screen
 * follower running; its registry, and the reads it runs, end with the test's `using`.
 */
const open = () => {
  const { device, layer } = fakeDevice();
  const player = playerOn(layer, Duration.millis(1));
  const registry = AtomRegistry.make();
  registry.mount(player.send);
  registry.mount(player.remote);
  /** Each state the player showed, in order. */
  const shown = new Array<Player['_tag']>();
  const unwatch = registry.subscribe(player.state, (state) => void shown.push(state._tag));
  /** The player's state once `holds` is true of it. */
  const until = (holds: (player: Player) => boolean) =>
    AtomRegistry.toStream(registry, player.state).pipe(
      Stream.filter(holds),
      Stream.runHead,
      Effect.map(Option.getOrThrow),
      Effect.timeoutOrElse({
        duration: Duration.seconds(2),
        orElse: () => Effect.die(`no such state; it stayed ${registry.get(player.state)._tag}`),
      }),
    );
  return {
    device,
    until,
    send: (command: Command) => registry.set(player.send, command),
    /** The states shown from now on, by name. */
    since: () => {
      const from = shown.length;
      return () => shown.slice(from);
    },
    [Symbol.dispose]: () => {
      unwatch();
      registry.dispose();
    },
  };
};

describe('the player', () => {
  it.live('loads hymn 100 from its recording at audioUrl, then plays it', () =>
    Effect.gen(function* () {
      using app = open();
      app.send(Command.Start({ track: morning }));
      expect(yield* app.until(Player.$is('Loading'))).toEqual(Player.Loading({ track: morning }));
      expect(app.device.played).toEqual(['https://hymns.cvr.im/audio/sdah/100.mp3']);
      expect(app.device.played).toEqual([audioUrl(100)]);

      app.device.now = { state: 'playing', positionMs: 12_500, durationMs: 151_000 };
      expect(yield* app.until(Player.$is('Playing'))).toEqual(
        Player.Playing({ track: morning, at: 12.5, length: Option.some(151) }),
      );
      expect(app.device.announced).toEqual([
        { title: 'Great Is Thy Faithfulness', artist: 'Hymn 100' },
      ]);
    }),
  );

  it.live('pauses, seeks while paused, and plays on', () =>
    Effect.gen(function* () {
      using app = open();
      app.send(Command.Start({ track: morning }));
      app.device.now = { state: 'playing', positionMs: 60_000, durationMs: 151_000 };
      yield* app.until(Player.$is('Playing'));

      app.send(Command.Pause());
      expect(yield* app.until(Player.$is('Paused'))).toEqual(
        Player.Paused({ track: morning, at: 60, length: Option.some(151) }),
      );

      app.send(Command.Seek({ seconds: 90 }));
      expect(
        yield* app.until((player) => Player.$is('Paused')(player) && player.at === 90),
      ).toEqual(Player.Paused({ track: morning, at: 90, length: Option.some(151) }));
      expect(app.device.now.positionMs).toBe(90_000);

      app.send(Command.Resume());
      expect(yield* app.until(Player.$is('Playing'))).toEqual(
        Player.Playing({ track: morning, at: 90, length: Option.some(151) }),
      );
    }),
  );

  it.live('keeps its place, length and Pause while the device loads again mid-recording', () =>
    Effect.gen(function* () {
      using app = open();
      app.send(Command.Start({ track: morning }));
      app.device.now = { state: 'playing', positionMs: 60_000, durationMs: 151_000 };
      yield* app.until(Player.$is('Playing'));

      // A stall, or a seek past what the device holds: One says `loading`, its length unread.
      app.device.now = { state: 'loading', positionMs: 61_000 };
      expect(yield* app.until(Player.$is('Buffering'))).toEqual(
        Player.Buffering({ track: morning, at: 61, length: Option.some(151) }),
      );

      app.send(Command.Pause());
      expect(yield* app.until(Player.$is('Paused'))).toEqual(
        Player.Paused({ track: morning, at: 61, length: Option.some(151) }),
      );

      // A seek while paused that the device must load for stays paused, at its new place.
      app.device.lagging = true;
      app.send(Command.Seek({ seconds: 120 }));
      app.device.now = { state: 'loading', positionMs: 120_000 };
      app.send(Command.Follow());
      expect(
        yield* app.until((player) => Player.$is('Paused')(player) && player.at === 120),
      ).toEqual(Player.Paused({ track: morning, at: 120, length: Option.some(151) }));
    }),
  );

  it.live('ends at the end of the recording, and plays again from the start', () =>
    Effect.gen(function* () {
      using app = open();
      app.send(Command.Start({ track: morning }));
      app.device.now = { state: 'playing', positionMs: 150_000, durationMs: 151_000 };
      yield* app.until(Player.$is('Playing'));

      app.device.now = { state: 'ended', positionMs: 151_000, durationMs: 151_000 };
      expect(yield* app.until(Player.$is('Ended'))).toEqual(
        Player.Ended({ track: morning, length: Option.some(151) }),
      );

      app.send(Command.Resume());
      expect(yield* app.until(Player.$is('Playing'))).toEqual(
        Player.Playing({ track: morning, at: 0, length: Option.some(151) }),
      );
    }),
  );

  it.live('fails with the connection off, saying so, and plays on Retry once it is back', () =>
    Effect.gen(function* () {
      using app = open();
      app.device.online = false;
      app.send(Command.Start({ track: morning }));
      expect(yield* app.until(Player.$is('Failed'))).toEqual(
        Player.Failed({ track: morning, offline: true }),
      );

      app.device.online = true;
      app.send(Command.Start({ track: morning }));
      yield* app.until(Player.$is('Loading'));
      app.device.now = { state: 'playing', positionMs: 0, durationMs: 151_000 };
      yield* app.until(Player.$is('Playing'));
      expect(app.device.played).toEqual([audioUrl(100), audioUrl(100)]);
    }),
  );

  it.live('fails, not offline, when the recording breaks off with the connection on', () =>
    Effect.gen(function* () {
      using app = open();
      app.send(Command.Start({ track: morning }));
      app.device.now = { state: 'playing', positionMs: 30_000, durationMs: 151_000 };
      yield* app.until(Player.$is('Playing'));

      app.device.now = { state: 'failed', positionMs: 30_000 };
      expect(yield* app.until(Player.$is('Failed'))).toEqual(
        Player.Failed({ track: morning, offline: false }),
      );
    }),
  );

  it.live('starting a second hymn replaces the first', () =>
    Effect.gen(function* () {
      using app = open();
      app.send(Command.Start({ track: morning }));
      app.device.now = { state: 'playing', positionMs: 40_000, durationMs: 151_000 };
      yield* app.until(Player.$is('Playing'));

      app.send(Command.Start({ track: praise }));
      expect(yield* app.until(Player.$is('Loading'))).toEqual(Player.Loading({ track: praise }));
      app.device.now = { state: 'playing', positionMs: 2_000, durationMs: 120_000 };
      expect(yield* app.until(Player.$is('Playing'))).toEqual(
        Player.Playing({ track: praise, at: 2, length: Option.some(120) }),
      );
      expect(app.device.played).toEqual([audioUrl(100), audioUrl(1)]);
    }),
  );

  it.live('shows a pause and a play made on the lock screen', () =>
    Effect.gen(function* () {
      using app = open();
      app.send(Command.Start({ track: morning }));
      app.device.now = { state: 'playing', positionMs: 10_000, durationMs: 151_000 };
      yield* app.until(Player.$is('Playing'));

      app.device.press('pause', { state: 'paused', positionMs: 11_000, durationMs: 151_000 });
      expect(yield* app.until(Player.$is('Paused'))).toEqual(
        Player.Paused({ track: morning, at: 11, length: Option.some(151) }),
      );

      app.device.press('play', { state: 'playing', positionMs: 11_000, durationMs: 151_000 });
      yield* app.until(Player.$is('Playing'));
    }),
  );

  it.live('plays on after Resume while the device waits to play, and never shows Paused', () =>
    Effect.gen(function* () {
      using app = open();
      app.send(Command.Start({ track: morning }));
      app.device.now = { state: 'playing', positionMs: 60_000, durationMs: 151_000 };
      yield* app.until(Player.$is('Playing'));
      app.send(Command.Pause());
      yield* app.until(Player.$is('Paused'));

      // iOS: AVPlayer says it waits to play for its first few ms after a resume.
      app.device.waiting = 3;
      const shown = app.since();
      app.send(Command.Resume());
      expect(yield* app.until(Player.$is('Playing'))).toEqual(
        Player.Playing({ track: morning, at: 60, length: Option.some(151) }),
      );
      expect(moves(shown())).toEqual(['Buffering', 'Playing']);
    }),
  );

  it.live('plays on after the lock screen’s play while the device waits, never Paused', () =>
    Effect.gen(function* () {
      using app = open();
      app.send(Command.Start({ track: morning }));
      app.device.now = { state: 'playing', positionMs: 10_000, durationMs: 151_000 };
      yield* app.until(Player.$is('Playing'));
      app.device.press('pause', { state: 'paused', positionMs: 11_000, durationMs: 151_000 });
      yield* app.until(Player.$is('Paused'));

      app.device.waiting = 2;
      const shown = app.since();
      app.device.press('play', { state: 'playing', positionMs: 11_000, durationMs: 151_000 });
      expect(yield* app.until(Player.$is('Playing'))).toEqual(
        Player.Playing({ track: morning, at: 11, length: Option.some(151) }),
      );
      expect(moves(shown())).toEqual(['Buffering', 'Playing']);
    }),
  );

  it.live('shows Paused at once after Pause while the device still loads (the web)', () =>
    Effect.gen(function* () {
      using app = open();
      app.send(Command.Start({ track: morning }));
      app.device.now = { state: 'playing', positionMs: 60_000, durationMs: 151_000 };
      yield* app.until(Player.$is('Playing'));

      // The web: a paused element that holds too little to play says `loading`.
      app.device.waiting = 3;
      const shown = app.since();
      app.send(Command.Pause());
      yield* app.until(Player.$is('Paused'));
      // The reads go on while the device says `loading`, and the page stays on Paused.
      yield* Effect.sync(() => app.device.waiting).pipe(
        Effect.repeat({
          until: (left) => left === 0,
          schedule: Schedule.spaced(Duration.millis(1)),
        }),
        Effect.timeout(Duration.seconds(2)),
      );
      expect(shown().filter((tag) => tag !== 'Paused')).toEqual([]);
      expect(app.device.now.state).toBe('paused');
    }),
  );
});
