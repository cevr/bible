import { describe, expect, test } from 'bun:test';
import { Effect, Layer } from 'effect';
import { Clipboard } from '../browser/clipboard.ts';
import { memoryStorage } from '../browser/fixtures/storage.ts';
import { hostOf } from '../browser/host.ts';
import { Keys } from '../browser/keys.ts';
import { storeOver } from '../browser/storage.ts';
import { type Command, type Receipt, quietly, said } from './command.ts';
import { makeHub, titledNow } from './hub.ts';
import { cueOf } from './selection.ts';
import { pageHref } from '../core/api.ts';

/** A page whose presses go to `target`, with a hub over `storage` at `href`, on a Mac's keyboard unless `mac` is false. */
const pageWith = (
  storage: Storage,
  href = pageHref.labScene('f', 'one', { cue: 'rise' }),
  mac = true,
) => {
  const target = new EventTarget();
  const host = hostOf(
    Layer.mergeAll(Keys.layerOn(target, mac), Clipboard.memory([], 'https://lab.test')),
  );
  const hub = Effect.runSyncWith(host)(
    makeHub(
      'lab',
      () => href,
      storeOver(() => storage),
    ),
  );
  const stop = Effect.runCallbackWith(host)(hub.listen);
  const keydown = (key: string, held: Record<string, boolean> = {}) => {
    const e = Object.assign(new Event('keydown', { cancelable: true }), { key, ...held });
    target.dispatchEvent(e);
    return e.defaultPrevented;
  };
  return { hub, stop, keydown };
};

const counter = (id: string, over: Partial<Omit<Command, 'touch'>> = {}) => {
  const ran: Array<string> = [];
  const command: Command = {
    id,
    label: id,
    group: 'test',
    touch: 'a test command',
    when: () => true,
    run: quietly((_ctx, how) => {
      ran.push(how.step);
    }),
    ...over,
  };
  return { command, ran };
};

describe('the hub', () => {
  test("is the page's one key listener: a bound press runs its command and is taken", () => {
    const { hub, stop, keydown } = pageWith(memoryStorage());
    const frame = counter('play.frame-next', { keys: ['arrowright'], stepped: true });
    hub.commands.register(frame.command);
    expect([
      keydown('ArrowRight'),
      keydown('ArrowRight', { shiftKey: true }),
      keydown('q'),
    ]).toEqual([true, true, false]);
    expect(frame.ran).toEqual(['normal', 'coarse']);
    stop();
    keydown('ArrowRight');
    expect(frame.ran).toEqual(['normal', 'coarse']);
  });

  test('a rebound key survives the page: a new hub over the same storage reads it', () => {
    const storage = memoryStorage();
    const first = pageWith(storage);
    const undo = counter('edit.undo', { keys: ['mod+z'] });
    first.hub.commands.register(undo.command);
    first.hub.setOverrides([
      { key: 'mod+z', command: '-edit.undo' },
      { key: 'u', command: 'edit.undo' },
    ]);
    first.stop();
    const again = pageWith(storage);
    const undoAgain = counter('edit.undo', { keys: ['mod+z'] });
    again.hub.commands.register(undoAgain.command);
    expect(again.hub.keysOf('edit.undo')).toEqual(['u']);
    expect(again.keydown('z', { metaKey: true })).toBe(false);
    expect(again.keydown('u')).toBe(true);
    expect(undoAgain.ran).toEqual(['normal']);
  });

  test("reads the URL's selection and what the page refines it with; receipts reach their sinks", () => {
    const { hub } = pageWith(memoryStorage());
    expect(hub.context().selection).toEqual([cueOf('one', 'rise')]);
    const stopRefining = hub.refine((ctx) => ({ ...ctx, playing: true }));
    expect(hub.context().playing).toBe(true);
    stopRefining();
    expect(hub.context().playing).toBe(false);
    const heard: Array<readonly [Receipt, string]> = [];
    hub.receipts((receipt, slot) => heard.push([receipt, slot]));
    hub.commands.register({
      id: 'x',
      label: 'x',
      group: 'test',
      touch: 'a test command',
      when: () => true,
      run: () => Effect.succeed(said('done')),
    });
    hub.invokeId('x', { step: 'normal', via: 'menu' });
    // A write no command ran says its own, in its writer's slot.
    hub.announce(said('wrote'), 'edit');
    expect(heard).toEqual([
      [said('done'), 'x'],
      [said('wrote'), 'edit'],
    ]);
  });

  test('runs a command only where it is available, however it is asked for', () => {
    const { hub, keydown } = pageWith(memoryStorage());
    const playing = counter('play.only', { keys: ['p'], when: (ctx) => ctx.playing });
    hub.commands.register(playing.command);
    hub.invokeId('play.only', { step: 'normal', via: 'menu' });
    expect(keydown('p')).toBe(false);
    expect(playing.ran).toEqual([]);
    hub.refine((ctx) => ({ ...ctx, playing: true }));
    hub.invokeId('play.only', { step: 'normal', via: 'menu' });
    expect(keydown('p')).toBe(true);
    expect(playing.ran).toEqual(['normal', 'normal']);
  });

  test("names a command's key as the page's keyboard writes it", () => {
    const titled = (mac: boolean) => {
      const { hub } = pageWith(memoryStorage(), pageHref.lab('f'), mac);
      hub.commands.register(counter('edit.undo', { keys: ['mod+z'] }).command);
      return titledNow(hub, 'Undo', 'edit.undo');
    };
    expect([titled(true), titled(false)]).toEqual(['Undo (⌘Z)', 'Undo (Ctrl+Z)']);
  });
});
