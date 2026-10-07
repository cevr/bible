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
// causes. A receipt bound to the change it made (`Bound`: its film, its
// change's id) runs its Undo on that change alone (`how.bound`), so a receipt
// carried to another film's page, or one a newer change stands before, never
// steps a change it did not make. Its Undo pressed when it cannot act (its
// command not available, the page that loaded still reading the step it
// undoes; or its command says why it cannot take that change, `fits`) says
// why and is held: still offered, it never expires, and once it can act the
// receipt says again what it did; a receipt in its slot after it supersedes it.
// One whose command says it never can (`Unfit.Never`: the lab no longer has
// the change) is retired: it says why, loses its Undo, and goes as a refusal.

import { Toast } from '@bible/ui/toast';
import { For } from '@solidjs/web';
import { Equal, Option, Schema } from 'effect';
import { createEffect, createSignal, onCleanup, onSettled } from 'solid-js';
import { type StoreRuntime, keptJson } from '../../browser/storage.ts';
import { BY_BUTTON, type Bound, Receipt, Unfit, unfit } from '../../command/command.ts';
import type { Hub } from '../../command/hub.ts';
import { OpId } from '../../core/catalogue.ts';
import { ChangeId } from '../../core/schema.ts';
import { hubChanges } from './changes.ts';

/** How long a receipt shows, by its tone (ms; 0 until replaced). */
const SHOWN_FOR = { done: 5000, refused: 10000, busy: 0 } as const;

/** A receipt bound to a change in the film's history, by its id. */
const ChangeKept = Schema.Struct({ film: Schema.String, change: ChangeId });

/** A receipt bound to an approve run's approvals: its op, and the scenes it gave one to. */
const GaveKept = Schema.Struct({
  film: Schema.String,
  gave: Schema.Struct({ op: OpId, scenes: Schema.Array(Schema.String) }),
});

/** One receipt as a toast carries it, and as the tab keeps it across a reload. */
const Kept = Schema.Struct({
  slot: Schema.String,
  said: Schema.String,
  undo: Schema.OptionFromOptionalKey(Schema.String),
  /** The change its Undo acts on, when it names one (`Receipt.Said.bound`). */
  bound: Schema.OptionFromOptionalKey(Schema.Union([ChangeKept, GaveKept])),
  tone: Schema.Literals(['done', 'refused', 'busy']),
  /** Its Undo was pressed when it could not act: why, said until it can. */
  held: Schema.OptionFromOptionalKey(Schema.String),
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
  // The held receipts showing: each waits for its Undo's command.
  const [held, setHeld] = createSignal<ReadonlyArray<Kept>>([], { ownedWrite: true });
  const changes = hubChanges(props.hub);
  const undoLabel = (id: string) =>
    Option.match(props.hub.commands.byId(id), { onNone: () => 'Undo', onSome: (c) => c.label });
  /**
   * Why command `id` cannot act for a receipt bound to `bound`: it cannot
   * take that change (`Command.fits`: for now, or never), else it is not
   * available now (not yet registered; the page still reading what it acts
   * on); none when it can.
   */
  const whyNot = (id: string, bound: Option.Option<Bound>): Option.Option<Unfit> => {
    const ctx = props.hub.context();
    const notNow = Option.some(Unfit.Now({ reason: `${undoLabel(id)} is not available now` }));
    return Option.match(props.hub.commands.byId(id), {
      onNone: () => notNow,
      onSome: (c) =>
        Option.orElse(
          Option.flatMap(bound, (b) => unfit(c, b, ctx)),
          () => Option.filter(notNow, () => !c.when(ctx)),
        ),
    });
  };
  /**
   * `kept` as `why` leaves it: held with its reason while its Undo cannot
   * act for now, retired (said why, no Undo, gone as a refusal goes) when it
   * never can, and as it was once it can.
   */
  const judged = (kept: Kept, why: Option.Option<Unfit>): Kept =>
    Option.match(why, {
      onNone: () => ({ ...kept, held: Option.none() }),
      onSome: Unfit.$match({
        Now: ({ reason }) => ({ ...kept, held: Option.some(reason) }),
        Never: ({ reason }) => ({
          ...kept,
          said: reason,
          tone: 'refused' as const,
          undo: Option.none(),
          bound: Option.none(),
          held: Option.none(),
        }),
      }),
    });
  const show = (kept: Kept) => {
    showing.set(kept.slot, kept);
    // A slot's next receipt supersedes the one held there.
    setHeld((all) => [
      ...all.filter((k) => k.slot !== kept.slot),
      ...[kept].filter((k) => Option.isSome(k.held)),
    ]);
    const held = kept.held;
    manager.add({
      id: kept.slot,
      title: Option.getOrElse(held, () => kept.said),
      type: Option.match(held, { onNone: () => kept.tone, onSome: () => 'refused' }),
      // Held, it stays until its Undo can act or a receipt supersedes it.
      timeout: Option.match(held, { onNone: () => SHOWN_FOR[kept.tone], onSome: () => 0 }),
      data: kept,
      onRemove: () => {
        if (showing.get(kept.slot) !== kept) return;
        showing.delete(kept.slot);
        setHeld((all) => all.filter((k) => k !== kept));
      },
      // Always given, so a receipt with no Undo takes the button of the one it replaces away.
      actionProps: Option.getOrUndefined(
        Option.map(kept.undo, (id) => ({
          children: undoLabel(id),
          'data-act': 'receipt-undo',
          'data-command': id,
          onClick: () => {
            // It cannot act now (a reloaded page still learning the step it undoes;
            // another film's change, or one a newer change stands before): said why,
            // and held; or never (the lab no longer has the change): said why, and
            // retired. Never a press that silently does nothing or steps another change.
            const why = whyNot(id, kept.bound);
            if (Option.isSome(why)) return show(judged(kept, why));
            manager.close(kept.slot);
            props.hub.invokeId(
              id,
              Option.match(kept.bound, {
                onNone: () => BY_BUTTON,
                onSome: (bound) => ({ ...BY_BUTTON, bound }),
              }),
            );
          },
        })),
      ),
    });
  };
  // A held receipt says again what it did once its Undo can act, why not in
  // fresh words when the reason changes (not available → a newer change first),
  // and is retired once it never can (the page has read a history without it).
  createEffect(
    () => {
      changes();
      return held().map((kept) => ({
        kept,
        next: judged(
          kept,
          Option.flatMap(kept.undo, (id) => whyNot(id, kept.bound)),
        ),
      }));
    },
    (now) => {
      for (const { kept, next } of now) {
        if (showing.get(kept.slot) !== kept || Equal.equals(next, kept)) continue;
        show(next);
      }
    },
  );
  onCleanup(
    props.hub.receipts((receipt, slot) =>
      Receipt.$match(receipt, {
        Quiet: () => {},
        Said: (s) =>
          show({
            slot,
            said: s.said,
            undo: s.undo,
            bound: s.bound,
            tone: s.tone,
            held: Option.none(),
          }),
      }),
    ),
  );

  // The tab's kept receipts are the browser's: read, shown and kept again as
  // the page is left only once the page is the client's (a server render
  // reads and keeps nothing). Shown again once the page's commands are
  // registered, so an Undo is named as its command is.
  onSettled(() => {
    const carried = keptJson(props.tab, KEPT_AS, Carried, (): typeof Carried.Type => ({
      scope: '',
      receipts: [],
    }));
    const was = carried.get();
    carried.set({ scope: '', receipts: [] });
    if (was.scope === props.scope) for (const kept of was.receipts) show(kept);
    const keep = () => carried.set({ scope: props.scope, receipts: [...showing.values()] });
    window.addEventListener('pagehide', keep);
    return () => window.removeEventListener('pagehide', keep);
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
