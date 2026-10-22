/**
 * Android's Back with search open, over a stack of screens. Back goes to
 * each handler as React Native's `BackHandler` does
 * (`react-native/Libraries/Utilities/BackHandler.android.js`): the newest
 * first, until one returns true. The stack's handler, added when the
 * navigator mounts, is older than search's.
 */

import { describe, expect, it } from 'bun:test';

import { searchBack } from './back';

/** The home screen with search open on `query`, the stack and its Back handlers. */
const phone = (query: string) => {
  const state = { screens: ['home'], query, searching: true };
  const stack = () => {
    if (state.screens.length === 1) return false;
    state.screens.pop();
    return true;
  };
  const search = searchBack({
    isFocused: () => state.screens.at(-1) === 'home',
    cancel: () => {
      state.query = '';
      state.searching = false;
    },
  });
  const handlers = [stack, search];
  return {
    state,
    open: (screen: string) => void state.screens.push(screen),
    back: () => handlers.toReversed().some((handler) => handler()),
  };
};

describe('Back with search open', () => {
  it('on a hymn opened from the results, pops the hymn and keeps the search', () => {
    const app = phone('lord');
    app.open('hymn 100');
    expect(app.back()).toBe(true);
    expect(app.state).toEqual({ screens: ['home'], query: 'lord', searching: true });
  });

  it('on the results, cancels the search', () => {
    const app = phone('lord');
    expect(app.back()).toBe(true);
    expect(app.state).toEqual({ screens: ['home'], query: '', searching: false });
  });

  it('on a hymn, then on the results, pops the hymn and then cancels the search', () => {
    const app = phone('grace');
    app.open('hymn 108');
    app.back();
    app.back();
    expect(app.state).toEqual({ screens: ['home'], query: '', searching: false });
  });
});
