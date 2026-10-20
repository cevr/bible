/**
 * The prebuild's SocketPort guard (`vite/socketport.ts`, onejs/one#991) over
 * lines of the Foundation table One 2.9.0 generates. A device build compiles
 * the table with `targetEnvironment(simulator)` false; the iphoneos SDK has
 * no `SocketPort`, so no line a device compiles may name it.
 */

import { describe, expect, test } from 'bun:test';

import { guardSocketPort, marker } from '../vite/socketport';

/** Lines of `OneSDK_Foundation.swift` as One 2.9.0 writes them. */
const generated = [
  '    switch id {',
  '    case 646917577721102: let o: Foundation.SocketPort = try c.receiver(); return c.out(o.socket)',
  '    case 1026981537245095: return c.out(Foundation.SocketPort(remoteWithProtocolFamily: (try c.arg(0) as Int32), socketType: (try c.arg(1) as Int32), protocol: (try c.arg(2) as Int32), address: (try c.arg(3) as Data)))',
  '    case 1145542942409579: return c.out(Foundation.SocketPort())',
  '    case 1175177556587236: let o: Foundation.NSFileCoordinator = try c.receiver(); return c.void',
  '    default: throw OneSDKError.unknown(id)',
  '    }',
].join('\n');

/** The lines a device build compiles: a simulator-only branch is dropped. */
const onDevice = (source: string) => {
  const live: Array<boolean> = [];
  return source.split('\n').filter((line) => {
    const word = line.trimStart().split(/\s/, 1)[0];
    if (word === '#if') live.push(!/^#if targetEnvironment\(simulator\)/.test(line.trim()));
    else if (word === '#else') live.push(!(live.pop() ?? true));
    else if (word === '#endif') live.pop();
    else return live.every(Boolean);
    return false;
  });
};

const named = (lines: ReadonlyArray<string>) =>
  lines.filter((line) => line.includes('SocketPort')).length;

describe('the SocketPort guard', () => {
  test('One 2.9.0 writes SocketPort cases a device build compiles', () => {
    expect(named(onDevice(generated))).toBe(3);
  });

  test('guards each SocketPort case so a device build compiles none, and leaves the rest', () => {
    const guard = guardSocketPort(generated);
    expect(guard._tag).toBe('Guarded');
    if (guard._tag !== 'Guarded') return;
    expect(guard.cases).toBe(3);
    expect(named(onDevice(guard.source))).toBe(0);
    expect(onDevice(guard.source)).toEqual(
      generated.split('\n').filter((line) => !line.includes('SocketPort')),
    );
    expect(guard.source.split('\n').filter((line) => line === marker)).toHaveLength(3);
  });

  test('a second run finds its own guards and changes nothing', () => {
    const first = guardSocketPort(generated);
    expect(first._tag).toBe('Guarded');
    if (first._tag !== 'Guarded') return;
    expect(guardSocketPort(first.source)).toEqual({ _tag: 'AlreadyGuarded', cases: 3 });
  });

  test('says it has nothing to do once One guards SocketPort itself', () => {
    const lines = generated.split('\n');
    const fixed = [
      lines[0],
      '#if targetEnvironment(simulator)',
      ...lines.slice(1, 4),
      '#endif',
      ...lines.slice(4),
    ].join('\n');
    expect(guardSocketPort(fixed)).toEqual({ _tag: 'Gone' });
  });

  test('says it has nothing to do once One writes no SocketPort case', () => {
    const without = generated
      .split('\n')
      .filter((line) => !line.includes('SocketPort'))
      .join('\n');
    expect(guardSocketPort(without)).toEqual({ _tag: 'Gone' });
  });

  test('a case under a device-only branch is still guarded', () => {
    const lines = generated.split('\n');
    const deviceOnly = [lines[0], '#if !targetEnvironment(simulator)', lines[3], '#endif'].join(
      '\n',
    );
    const guard = guardSocketPort(deviceOnly);
    expect(guard._tag).toBe('Guarded');
  });
});
