// What a title or a label names as a command's key is the hub's binding now,
// as the viewer's keyboard writes it, with no literal left behind.

import { describe, expect, test } from 'bun:test';
import { Effect, Layer } from 'effect';
import { Clipboard } from '../../browser/clipboard.ts';
import { hostOf } from '../../browser/host.ts';
import { Keys } from '../../browser/keys.ts';
import { quietly } from '../../command/command.ts';
import { makeHub } from '../../command/hub.ts';
import { pageHref } from '../../core/api.ts';
import { keysAs } from './changes.ts';

/** A lab page, a Mac's or a PC's, with Note this frame bound to `n`, as the notes register it. */
const page = (mac = false) => {
  const host = hostOf(
    Layer.mergeAll(
      Keys.layerOn(new EventTarget(), mac),
      Clipboard.memory([], 'https://lab.slow.test'),
    ),
  );
  const hub = Effect.runSyncWith(host)(makeHub('player', () => pageHref.studio('f')));
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
  test('the keys bound now, as the keyboard writes them, a title with the first', () => {
    const [pc, mac] = [page(false), page(true)];
    expect(keysAs(pc).first('notes.frame')).toBe('N');
    expect(keysAs(pc).text('notes.frame')).toBe('N Shift+N');
    expect(keysAs(mac).text('notes.frame')).toBe('N ⇧N');
    expect(keysAs(pc).titled('Note frame', 'notes.frame')).toBe('Note frame (N)');
    expect(keysAs(pc).text('nothing.bound')).toBe('');
    expect(keysAs(pc).titled('Unbound', 'nothing.bound')).toBe('Unbound');
  });
});
