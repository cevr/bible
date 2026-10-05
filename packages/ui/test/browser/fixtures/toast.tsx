// Fixtures for Toast: a receipt raised through a manager created outside
// the component tree (the Undo action in its action slot), toasts added
// from inside the tree with `useToastManager`, and an element swiped with
// `useSwipeDismiss` on its own.
import type { JSX } from '@solidjs/web';
import { createSignal, For } from 'solid-js';

import { Toast, type ToastObject } from '../../../src/toast/index.ts';
import { useSwipeDismiss } from '../../../src/utils/useSwipeDismiss.ts';
import { log, param } from './log.ts';

interface Receipt {
  tone: 'neutral' | 'danger';
}

// Created at module scope: commands raise receipts without a component.
const receipts = Toast.createToastManager<Receipt>();
let receiptCount = 0;

function raiseReceipt(said: string, tone: Receipt['tone'] = 'neutral') {
  receiptCount += 1;
  const count = receiptCount;
  const id: string = receipts.add({
    title: said,
    description: `receipt ${count}`,
    type: tone,
    priority: param('priority') === 'high' ? 'high' : 'low',
    data: { tone },
    onClose: () => log(`closed ${count}`),
    onRemove: () => log(`removed ${count}`),
    actionProps: {
      children: 'Undo',
      onClick: () => {
        log(`undo ${count}`);
        receipts.close(id);
      },
    },
  });
  return id;
}

const toastBox: JSX.CSSProperties = {
  display: 'block',
  width: '280px',
  height: '60px',
  margin: '4px 0',
  background: '#eee',
  'box-sizing': 'border-box',
};

const contentRow: JSX.CSSProperties = {
  display: 'flex',
  'align-items': 'center',
  gap: '6px',
  height: '60px',
  overflow: 'hidden',
};

const label: JSX.CSSProperties = { margin: '0', 'font-size': '12px' };

function ToastList(): JSX.Element {
  const manager = Toast.useToastManager();
  return (
    <For each={manager.toasts} keyed={(toast) => toast.id}>
      {(toast) => (
        <Toast.Root
          toast={toast() as ToastObject}
          data-testid="root"
          swipeDirection={param('swipe') === 'up' ? 'up' : ['down', 'right']}
          style={toastBox}
        >
          <Toast.Content data-testid="content" style={contentRow}>
            <Toast.Title data-testid="title" style={label} />
            <Toast.Description data-testid="description" style={label} />
            <Toast.Action data-testid="action" />
            <Toast.Close data-testid="close" aria-label="Close">
              x
            </Toast.Close>
          </Toast.Content>
        </Toast.Root>
      )}
    </For>
  );
}

/** Adds toasts from inside the tree, through `useToastManager`. */
function InsideControls(): JSX.Element {
  const manager = Toast.useToastManager();
  let promiseCount = 0;
  return (
    <>
      <button
        id="add-inside"
        onClick={() => {
          manager.add({ title: 'Inside', description: 'added inside' });
        }}
      >
        add inside
      </button>
      <button
        id="add-promise"
        onClick={() => {
          promiseCount += 1;
          const outcome = promiseCount === 1 ? 'resolve' : 'reject';
          const work = new Promise<string>((resolve, reject) => {
            window.setTimeout(() => {
              if (outcome === 'resolve') {
                resolve('saved');
              } else {
                reject(new Error('nope'));
              }
            }, 100);
          });
          manager
            .promise(work, {
              loading: 'Saving…',
              success: (value) => `Done: ${value}`,
              error: 'Failed',
            })
            .catch(() => log('promise rejected'));
        }}
      >
        add promise
      </button>
    </>
  );
}

function ReceiptFixture(): JSX.Element {
  const timeout = Number(param('timeout') ?? '5000');
  const limit = Number(param('limit') ?? '3');
  return (
    <>
      <button id="raise" onClick={() => raiseReceipt('Deleted note')}>
        raise
      </button>
      <button id="raise-danger" onClick={() => raiseReceipt('Removed tag', 'danger')}>
        raise danger
      </button>
      <button
        id="update-first"
        onClick={() => receipts.update('toast-1', { description: 'updated receipt' })}
      >
        update
      </button>
      <button id="close-all" onClick={() => receipts.close()}>
        close all
      </button>
      <Toast.Provider toastManager={receipts} timeout={timeout} limit={limit}>
        <InsideControls />
        <Toast.Portal>
          <Toast.Viewport
            id="viewport"
            style={{ position: 'fixed', right: '0', bottom: '0', width: '300px' }}
          >
            <ToastList />
          </Toast.Viewport>
        </Toast.Portal>
      </Toast.Provider>
      <div id="elsewhere" style={{ 'margin-top': '200px', width: '50px', height: '50px' }}>
        elsewhere
      </div>
    </>
  );
}

function SwipeBox(): JSX.Element {
  const [element, setElement] = createSignal<HTMLElement | null>(null, { ownedWrite: true });
  const [dismissed, setDismissed] = createSignal(false);
  const swipe = useSwipeDismiss({
    enabled: true,
    directions: ['right'],
    element,
    movementCssVars: { x: '--movement-x', y: '--movement-y' },
    onDismiss: (_event, details) => {
      log(`dismiss ${details.direction}`);
      setDismissed(true);
    },
    onRelease: (details) => {
      log(`release ${details.direction ?? 'none'} ${Math.round(details.deltaX)}`);
    },
  });
  return (
    <div style={{ padding: '40px' }}>
      <div
        id="swipe-box"
        ref={setElement}
        {...swipe.getPointerProps()}
        data-swiping={swipe.swiping() ? '' : undefined}
        data-dismissed={dismissed() ? '' : undefined}
        style={{ width: '200px', height: '80px', background: '#ccc', ...swipe.getDragStyles() }}
      >
        <button id="swipe-button">button</button>
      </div>
    </div>
  );
}

/** A toast anchored to a button, through `positionerProps`. */
function AnchoredList(): JSX.Element {
  const manager = Toast.useToastManager();
  return (
    <For each={manager.toasts} keyed={(toast) => toast.id}>
      {(toast) => (
        <Toast.Positioner toast={toast() as ToastObject} id="positioner">
          <Toast.Root toast={toast() as ToastObject} data-testid="root" style={toastBox}>
            <Toast.Arrow id="arrow" />
            <Toast.Title data-testid="title" style={label} />
          </Toast.Root>
        </Toast.Positioner>
      )}
    </For>
  );
}

function AnchoredControls(): JSX.Element {
  const manager = Toast.useToastManager();
  return (
    <button
      id="copy"
      style={{ 'margin-top': '200px', 'margin-left': '200px' }}
      onClick={(event) => {
        manager.add({
          title: 'Copied',
          positionerProps: { anchor: event.currentTarget, sideOffset: 8 },
        });
      }}
    >
      copy
    </button>
  );
}

function AnchoredFixture(): JSX.Element {
  return (
    <Toast.Provider>
      <AnchoredControls />
      <Toast.Portal>
        <Toast.Viewport id="viewport">
          <AnchoredList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

export const fixtures: Record<string, () => JSX.Element> = {
  receipt: ReceiptFixture,
  'swipe-dismiss': SwipeBox,
  anchored: AnchoredFixture,
};
