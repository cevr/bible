import { Schema as S } from 'effect';
import { Machine } from 'foldkit/experimental';
import { m } from 'foldkit/message';
import { ts } from 'foldkit/schema';
import type { ReaderMode } from './reader-settings.js';

const Closed = ts('closed');
const Toc = ts('toc');
const TocPlusLibrary = ts('tocPlusLib');

const DrawerMachineState = S.Union([Closed, Toc, TocPlusLibrary]);
type DrawerMachineState = typeof DrawerMachineState.Type;
export type DrawerState = DrawerMachineState['_tag'];

const ReaderModeSchema = S.Literals(['bible', 'egw']);
const LibraryClick = m('libraryClick', { mode: ReaderModeSchema });
const ToggleLibraryPane = m('toggleLibraryPane', { mode: ReaderModeSchema });
const Close = m('close');
const DrawerMessage = S.Union([LibraryClick, ToggleLibraryPane, Close]);

export type DrawerAction =
  | { readonly _tag: 'libraryClick' }
  | { readonly _tag: 'toggleLibraryPane' }
  | { readonly _tag: 'close' };

/**
 * Three-layer reader drawer graph. Solid remains the renderer; this module
 * owns the mode-aware transition seam and makes invalid edges inspectable.
 */
export const drawerMachine = Machine.define({
  state: DrawerMachineState,
  message: DrawerMessage,
})({
  initial: Closed(),
  states: {
    closed: {
      on: {
        libraryClick: Machine.to('toc', () => Toc()),
        toggleLibraryPane: [
          Machine.when(
            (_state, message) => message.mode === 'egw',
            'tocPlusLib',
            () => TocPlusLibrary(),
          ),
        ],
        close: Machine.to('closed', () => Closed()),
      },
    },
    toc: {
      on: {
        libraryClick: [
          Machine.when(
            (_state, message) => message.mode === 'bible',
            'closed',
            () => Closed(),
          ),
          Machine.otherwise(Machine.to('tocPlusLib', () => TocPlusLibrary())),
        ],
        toggleLibraryPane: [
          Machine.when(
            (_state, message) => message.mode === 'egw',
            'tocPlusLib',
            () => TocPlusLibrary(),
          ),
        ],
        close: Machine.to('closed', () => Closed()),
      },
    },
    tocPlusLib: {
      on: {
        libraryClick: Machine.to('closed', () => Closed()),
        toggleLibraryPane: [
          Machine.when(
            (_state, message) => message.mode === 'egw',
            'toc',
            () => Toc(),
          ),
        ],
        close: Machine.to('closed', () => Closed()),
      },
    },
  },
});

const stateFromTag = (state: DrawerState): DrawerMachineState => {
  switch (state) {
    case 'closed':
      return Closed();
    case 'toc':
      return Toc();
    case 'tocPlusLib':
      return TocPlusLibrary();
  }
};

export const transitionDrawer = (
  mode: ReaderMode,
  state: DrawerState,
  action: DrawerAction,
): DrawerState => {
  const message =
    action._tag === 'libraryClick'
      ? LibraryClick({ mode })
      : action._tag === 'toggleLibraryPane'
        ? ToggleLibraryPane({ mode })
        : Close();
  return drawerMachine.transition(stateFromTag(state), message)[0]._tag;
};
