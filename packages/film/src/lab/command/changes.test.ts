// What a title or a label names as a command's key is the hub's binding now:
// a viewer's rebind moves it, with no literal left behind.

import { describe, expect, test } from 'bun:test';
import { Effect, Layer } from 'effect';
import { Clipboard } from '../../browser/clipboard.ts';
import { memoryStorage } from '../../browser/fixtures/storage.ts';
import { hostOf } from '../../browser/host.ts';
import { Keys } from '../../browser/keys.ts';
import { storeOver } from '../../browser/storage.ts';
import { quietly } from '../../command/command.ts';
import { makeHub } from '../../command/hub.ts';
import { pageHref } from '../../core/api.ts';
import { keysAs } from './changes.ts';

/** A PC's lab page with Note this frame bound to `n`, as the notes register it. */
const page = () => {
  const host = hostOf(
    Layer.mergeAll(
      Keys.layerOn(new EventTarget(), false),
      Clipboard.memory([], 'https://lab.test'),
    ),
  );
  const hub = Effect.runSyncWith(host)(
    makeHub(
      'lab',
      () => pageHref.lab('f'),
      storeOver(() => memoryStorage()),
    ),
  );
  hub.commands.register({
    id: 'notes.frame',
    label: 'Note this frame',
    group: 'Notes',
    keys: ['n', 'shift+n'],
    touch: 'Note frame',
    when: () => true,
    run: quietly(() => {}),
  });
  return hub;
};

describe("a command's keys as a title names them", () => {
  test("the viewer's: the key bound now, so a rebind moves it", () => {
    const hub = page();
    const keys = keysAs(hub, () => true);
    expect(keys.first('notes.frame')).toBe('N');
    expect(keys.text('notes.frame')).toBe('N Shift+N');
    hub.setOverrides([
      { key: 'n', command: '-notes.frame' },
      { key: 'shift+n', command: '-notes.frame' },
      { key: 'b', command: 'notes.frame' },
    ]);
    expect(keys.first('notes.frame')).toBe('B');
    expect(keys.text('notes.frame')).toBe('B');
    expect(keys.titled('Note frame', 'notes.frame')).toBe('Note frame (B)');
    expect(keys.text('nothing.bound')).toBe('');
    expect(keys.titled('Unbound', 'nothing.bound')).toBe('Unbound');
  });

  test("a server render's: the defaults, as a PC writes them, whatever the viewer rebound", () => {
    const hub = page();
    hub.setOverrides([{ key: 'b', command: 'notes.frame' }]);
    expect(keysAs(hub, () => false).text('notes.frame')).toBe('N Shift+N');
  });
});
