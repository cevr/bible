import { Schema as S } from 'effect';
import { Machine } from 'foldkit/experimental';
import { m } from 'foldkit/message';
import { ts } from 'foldkit/schema';

const Normal = ts('normal');
const Awaiting = ts('awaiting', { digits: S.String });

const GotoModeStateSchema = S.Union([Normal, Awaiting]);
export type GotoModeState = typeof GotoModeStateSchema.Type;

export const GotoModeState = {
  normal: Normal,
  awaiting: (digits: string = ''): GotoModeState => Awaiting({ digits }),
} as const;

const PressG = m('pressG');
const PressShiftG = m('pressShiftG');
const PressDigit = m('pressDigit', { digit: S.String });
const PressEnter = m('pressEnter');
const PressEscape = m('pressEscape');
const Other = m('other');

const GotoModeEventSchema = S.Union([
  PressG,
  PressShiftG,
  PressDigit,
  PressEnter,
  PressEscape,
  Other,
]);
export type GotoModeEvent = typeof GotoModeEventSchema.Type;

export const GotoModeEvent = {
  pressG: PressG,
  pressShiftG: PressShiftG,
  pressDigit: (digit: string): GotoModeEvent => PressDigit({ digit }),
  pressEnter: PressEnter,
  pressEscape: PressEscape,
  other: Other,
} as const;

export type GotoModeAction =
  | { readonly _tag: 'goToFirst' }
  | { readonly _tag: 'goToLast' }
  | { readonly _tag: 'goToVerse'; readonly verse: number };

export const GotoModeAction = {
  goToFirst: (): GotoModeAction => ({ _tag: 'goToFirst' }),
  goToLast: (): GotoModeAction => ({ _tag: 'goToLast' }),
  goToVerse: (verse: number): GotoModeAction => ({ _tag: 'goToVerse', verse }),
} as const;

export interface GotoModeResult {
  readonly state: GotoModeState;
  readonly action?: GotoModeAction;
}

/**
 * Renderer-independent Vim goto graph. OpenTUI owns the Solid signals and
 * renderer; Foldkit owns the legal transitions and makes the graph inspectable.
 */
export const gotoModeMachine = Machine.define({
  state: GotoModeStateSchema,
  message: GotoModeEventSchema,
})({
  initial: Normal(),
  states: {
    normal: {
      on: {
        pressG: Machine.to('awaiting', () => Awaiting({ digits: '' })),
        pressShiftG: Machine.to('normal', () => Normal()),
      },
    },
    awaiting: {
      on: {
        pressDigit: Machine.to('awaiting', ({ state, message }) =>
          Awaiting({ digits: state.digits + message.digit }),
        ),
        pressG: Machine.to('normal', () => Normal()),
        pressEnter: Machine.to('normal', () => Normal()),
        pressEscape: Machine.to('normal', () => Normal()),
        other: Machine.to('normal', () => Normal()),
      },
    },
  },
});

const actionFor = (state: GotoModeState, event: GotoModeEvent): GotoModeAction | undefined => {
  if (state._tag === 'normal') {
    return event._tag === 'pressShiftG' ? GotoModeAction.goToLast() : undefined;
  }
  if (event._tag === 'pressG') {
    return state.digits === ''
      ? GotoModeAction.goToFirst()
      : GotoModeAction.goToVerse(Number.parseInt(state.digits, 10));
  }
  if (event._tag === 'pressEnter' && state.digits !== '') {
    const verse = Number.parseInt(state.digits, 10);
    return verse > 0 ? GotoModeAction.goToVerse(verse) : undefined;
  }
  return undefined;
};

export const gotoModeTransition = (state: GotoModeState, event: GotoModeEvent): GotoModeResult => {
  const action = actionFor(state, event);
  const next = gotoModeMachine.transition(state, event)[0];
  return action === undefined ? { state: next } : { state: next, action };
};

/** Convert an OpenTUI key event to a renderer-independent message. */
export function keyToGotoEvent(key: { name?: string; sequence?: string }): GotoModeEvent {
  if (key.sequence === 'G') return GotoModeEvent.pressShiftG();
  if (key.name === 'g') return GotoModeEvent.pressG();
  if (key.name === 'return') return GotoModeEvent.pressEnter();
  if (key.name === 'escape') return GotoModeEvent.pressEscape();
  if (key.name && /^[0-9]$/.test(key.name)) return GotoModeEvent.pressDigit(key.name);
  return GotoModeEvent.other();
}
