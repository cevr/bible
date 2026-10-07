// Fixtures for Toast: a receipt raised through a manager created outside
// the component tree (the Undo action in its action slot), and toasts added
// from inside the tree with `useToastManager`.
import type { JSX } from '@solidjs/web';
import { For } from 'solid-js';

import { Toast, type ToastObject } from '../../../src/toast/index.ts';
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
    title: `${said} ${count}`,
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
  return (
    <button
      id="add-inside"
      onClick={() => {
        manager.add({ title: 'Inside' });
      }}
    >
      add inside
    </button>
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

export const fixtures: Record<string, () => JSX.Element> = {
  receipt: ReceiptFixture,
};
