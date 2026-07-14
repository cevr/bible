import { describe, expect, it } from 'vitest';
import { drawerMachine, transitionDrawer } from '../src/services/drawer-machine.js';

describe('reader drawer machine', () => {
  it('keeps Bible mode within closed and toc', () => {
    expect(transitionDrawer('bible', 'closed', { _tag: 'libraryClick' })).toBe('toc');
    expect(transitionDrawer('bible', 'toc', { _tag: 'libraryClick' })).toBe('closed');
    expect(transitionDrawer('bible', 'toc', { _tag: 'toggleLibraryPane' })).toBe('toc');
  });

  it('cycles all three layers in EGW mode', () => {
    const toc = transitionDrawer('egw', 'closed', { _tag: 'libraryClick' });
    const library = transitionDrawer('egw', toc, { _tag: 'libraryClick' });
    expect(transitionDrawer('egw', library, { _tag: 'libraryClick' })).toBe('closed');
    expect(transitionDrawer('egw', library, { _tag: 'toggleLibraryPane' })).toBe('toc');
  });

  it('exposes a reachable graph with no dead edges', () => {
    expect(drawerMachine.unreachableStates()).toEqual([]);
    expect(drawerMachine.deadTransitions()).toEqual([]);
  });
});
