/**
 * Vim-style goto mode state machine.
 *
 * States:
 * - normal: Default mode, no pending goto command
 * - awaiting: After pressing 'g', waiting for digits or another 'g'
 *
 * Transitions:
 * - normal + 'g' -> awaiting('')
 * - normal + 'G' -> normal + goToLast action
 * - awaiting + digit -> awaiting(digits + digit)
 * - awaiting + 'g' (no digits) -> normal + goToFirst action
 * - awaiting + 'g' (with digits) -> normal + goToVerse action
 * - awaiting + Enter (with digits) -> normal + goToVerse action
 * - awaiting + Escape -> normal
 */

// State types
export type GotoModeState = { _tag: 'normal' } | { _tag: 'awaiting'; digits: string };

// State constructors
export const GotoModeState = {
  normal: (): GotoModeState => ({ _tag: 'normal' }),
  awaiting: (digits: string = ''): GotoModeState => ({
    _tag: 'awaiting',
    digits,
  }),
} as const;

// Event types
export type GotoModeEvent =
  | { _tag: 'pressG' }
  | { _tag: 'pressShiftG' }
  | { _tag: 'pressDigit'; digit: string }
  | { _tag: 'pressEnter' }
  | { _tag: 'pressEscape' }
  | { _tag: 'other' };

// Event constructors
export const GotoModeEvent = {
  pressG: (): GotoModeEvent => ({ _tag: 'pressG' }),
  pressShiftG: (): GotoModeEvent => ({ _tag: 'pressShiftG' }),
  pressDigit: (digit: string): GotoModeEvent => ({ _tag: 'pressDigit', digit }),
  pressEnter: (): GotoModeEvent => ({ _tag: 'pressEnter' }),
  pressEscape: (): GotoModeEvent => ({ _tag: 'pressEscape' }),
  other: (): GotoModeEvent => ({ _tag: 'other' }),
} as const;

// Action types (side effects to perform after transition)
export type GotoModeAction =
  | { _tag: 'goToFirst' }
  | { _tag: 'goToLast' }
  | { _tag: 'goToVerse'; verse: number };

// Action constructors
export const GotoModeAction = {
  goToFirst: (): GotoModeAction => ({ _tag: 'goToFirst' }),
  goToLast: (): GotoModeAction => ({ _tag: 'goToLast' }),
  goToVerse: (verse: number): GotoModeAction => ({ _tag: 'goToVerse', verse }),
} as const;

// Transition result
export type GotoModeResult = {
  state: GotoModeState;
  action?: GotoModeAction;
};

/**
 * Pure state transition function for goto mode.
 * Returns the new state and optionally an action to perform.
 */
export function gotoModeTransition(state: GotoModeState, event: GotoModeEvent): GotoModeResult {
  switch (state._tag) {
    case 'normal':
      switch (event._tag) {
        case 'pressG':
          return { state: GotoModeState.awaiting('') };
        case 'pressShiftG':
          return {
            state: GotoModeState.normal(),
            action: GotoModeAction.goToLast(),
          };
        default:
          return { state };
      }

    case 'awaiting':
      switch (event._tag) {
        case 'pressDigit':
          return { state: GotoModeState.awaiting(state.digits + event.digit) };
        case 'pressG':
          if (state.digits === '') {
            return {
              state: GotoModeState.normal(),
              action: GotoModeAction.goToFirst(),
            };
          }
          const verse = parseInt(state.digits, 10);
          return {
            state: GotoModeState.normal(),
            action: GotoModeAction.goToVerse(verse),
          };
        case 'pressEnter':
          if (state.digits !== '') {
            const verse = parseInt(state.digits, 10);
            if (verse > 0) {
              return {
                state: GotoModeState.normal(),
                action: GotoModeAction.goToVerse(verse),
              };
            }
          }
          return { state: GotoModeState.normal() };
        case 'pressEscape':
        case 'other':
          return { state: GotoModeState.normal() };
        default:
          return { state };
      }
  }
}

/**
 * Convert a key event to a GotoModeEvent.
 * Use with ink's useInput key object.
 */
export function keyToGotoEvent(key: { name?: string; sequence?: string }): GotoModeEvent {
  if (key.sequence === 'G') return GotoModeEvent.pressShiftG();
  if (key.name === 'g') return GotoModeEvent.pressG();
  if (key.name === 'return') return GotoModeEvent.pressEnter();
  if (key.name === 'escape') return GotoModeEvent.pressEscape();
  if (key.name && /^[0-9]$/.test(key.name)) return GotoModeEvent.pressDigit(key.name);
  return GotoModeEvent.other();
}
