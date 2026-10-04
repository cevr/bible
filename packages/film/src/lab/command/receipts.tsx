// The page's receipts: a toast for each thing that just happened, in the
// words its command or its write gave (`command/command.ts`: before → after
// where something moved), with its Undo when it has one (the button runs
// the undoing command through the hub, as its key would, labelled as that
// command is; a refusal's is its way past, Accept anyway), on @bible/ui's
// Toast. One toast per slot (`Hub.announce`): a slot's next receipt replaces
// its last, so `undoing…` becomes what was undone and a run of nudges reads
// as one. Done goes after a few seconds, a refusal stays longer, a write on
// its way stays until its answer replaces it. The receipts still showing as
// the page goes (a write reloads the lab) are kept in the tab's store and
// shown again on the page that loads in its place (`scope`: the same page,
// the same film), so a write's receipt and its Undo outlive the reload it
// causes.

import { Toast } from '@bible/ui/toast';
import { For } from '@solidjs/web';
import { Option, Schema } from 'effect';
import * as Atom from 'effect/reactivity/Atom';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { onCleanup, onSettled } from 'solid-js';
import type { StoreRuntime } from '../../browser/storage.ts';
import { BY_BUTTON, Receipt } from '../../command/command.ts';
import type { Hub } from '../../command/hub.ts';

/** How long a receipt shows, by its tone (ms; 0 until replaced). */
const SHOWN_FOR = { done: 5000, refused: 10000, busy: 0 } as const;

/** One receipt as a toast carries it, and as the tab keeps it across a reload. */
const Kept = Schema.Struct({
  slot: Schema.String,
  said: Schema.String,
  undo: Schema.OptionFromOptionalKey(Schema.String),
  tone: Schema.Literals(['done', 'refused', 'busy']),
});
type Kept = typeof Kept.Type;

/** The receipts showing as a page went, and which page it was. */
const Carried = Schema.Struct({ scope: Schema.String, receipts: Schema.Array(Kept) });

/** The key the tab keeps them under. */
const KEPT_AS = 'film-receipts';

/**
 * The page's receipts, from `hub`: shown as toasts, and kept in `tab` (the
 * tab's store) as the page goes, for the page of `scope` that loads next.
 */
export const Receipts = (props: {
  readonly hub: Hub;
  readonly tab: StoreRuntime;
  readonly scope: string;
}) => {
  const manager = Toast.createToastManager<Kept>();
  const showing = new Map<string, Kept>();
  const undoLabel = (id: string) =>
    Option.match(props.hub.commands.byId(id), { onNone: () => 'Undo', onSome: (c) => c.label });
  const show = (kept: Kept) => {
    showing.set(kept.slot, kept);
    manager.add({
      id: kept.slot,
      title: kept.said,
      type: kept.tone,
      timeout: SHOWN_FOR[kept.tone],
      priority: 'low',
      data: kept,
      onRemove: () => {
        if (showing.get(kept.slot) === kept) showing.delete(kept.slot);
      },
      // Always given, so a receipt with no Undo takes the button of the one it replaces away.
      actionProps: Option.getOrUndefined(
        Option.map(kept.undo, (id) => ({
          children: undoLabel(id),
          'data-act': 'receipt-undo',
          'data-command': id,
          onClick: () => {
            manager.close(kept.slot);
            props.hub.invokeId(id, BY_BUTTON);
          },
        })),
      ),
    });
  };
  onCleanup(
    props.hub.receipts((receipt, slot) =>
      Receipt.$match(receipt, {
        Quiet: () => {},
        Said: (s) => show({ slot, said: s.said, undo: s.undo, tone: s.tone }),
      }),
    ),
  );

  const carried = Atom.kvs({
    runtime: props.tab,
    key: KEPT_AS,
    schema: Carried,
    defaultValue: (): typeof Carried.Type => ({ scope: '', receipts: [] }),
    mode: 'sync',
  });
  const registry = AtomRegistry.make();
  registry.mount(carried);
  const keep = () => registry.set(carried, { scope: props.scope, receipts: [...showing.values()] });
  window.addEventListener('pagehide', keep);
  onCleanup(() => window.removeEventListener('pagehide', keep));
  // Shown again once the page's commands are registered, so an Undo is named as its command is.
  onSettled(() => {
    const was = registry.get(carried);
    registry.set(carried, { scope: '', receipts: [] });
    if (was.scope === props.scope) for (const kept of was.receipts) show(kept);
  });

  return (
    <Toast.Provider toastManager={manager} limit={3}>
      <Toast.Portal>
        <Toast.Viewport class="lab-receipts" data-role="receipts">
          <ReceiptList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
};

/** Each receipt showing: its words, its Undo, and its close. */
const ReceiptList = () => {
  const toasts = Toast.useToastManager<Kept>();
  return (
    <For each={toasts.toasts} keyed={(t) => t.id}>
      {(t) => (
        <Toast.Root
          toast={t()}
          class="lab-receipt"
          data-role="receipt"
          data-receipt={t().id}
          swipeDirection={['down', 'right']}
        >
          <Toast.Content class="lab-receipt-content">
            <Toast.Title class="lab-receipt-said" />
            <Toast.Action class="lab-receipt-undo" />
            <Toast.Close class="lab-receipt-close" aria-label="Dismiss">
              ×
            </Toast.Close>
          </Toast.Content>
        </Toast.Root>
      )}
    </For>
  );
};
