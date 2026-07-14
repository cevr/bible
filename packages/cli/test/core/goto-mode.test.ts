import { describe, expect, test } from 'bun:test';
import {
  GotoModeEvent,
  GotoModeState,
  gotoModeMachine,
  gotoModeTransition,
  keyToGotoEvent,
} from '../../src/tui/types/goto-mode.js';

describe('Vim goto mode machine', () => {
  test('supports gg, G, and counted verse navigation', () => {
    const awaiting = gotoModeTransition(GotoModeState.normal(), GotoModeEvent.pressG());
    expect(awaiting).toEqual({ state: { _tag: 'awaiting', digits: '' } });
    expect(gotoModeTransition(awaiting.state, GotoModeEvent.pressG())).toEqual({
      state: { _tag: 'normal' },
      action: { _tag: 'goToFirst' },
    });

    expect(gotoModeTransition(GotoModeState.normal(), GotoModeEvent.pressShiftG())).toEqual({
      state: { _tag: 'normal' },
      action: { _tag: 'goToLast' },
    });

    const one = gotoModeTransition(awaiting.state, GotoModeEvent.pressDigit('1')).state;
    const twelve = gotoModeTransition(one, GotoModeEvent.pressDigit('2')).state;
    expect(gotoModeTransition(twelve, GotoModeEvent.pressEnter())).toEqual({
      state: { _tag: 'normal' },
      action: { _tag: 'goToVerse', verse: 12 },
    });
  });

  test('cancels awaiting mode and exposes a sound graph', () => {
    expect(gotoModeTransition(GotoModeState.awaiting('4'), GotoModeEvent.pressEscape())).toEqual({
      state: { _tag: 'normal' },
    });
    expect(gotoModeMachine.unreachableStates()).toEqual([]);
    expect(gotoModeMachine.deadTransitions()).toEqual([]);
  });

  test('preserves the OpenTUI key mapping', () => {
    expect(keyToGotoEvent({ name: 'g' })).toEqual({ _tag: 'pressG' });
    expect(keyToGotoEvent({ sequence: 'G' })).toEqual({ _tag: 'pressShiftG' });
    expect(keyToGotoEvent({ name: '7' })).toEqual({ _tag: 'pressDigit', digit: '7' });
    expect(keyToGotoEvent({ name: 'escape' })).toEqual({ _tag: 'pressEscape' });
  });
});
