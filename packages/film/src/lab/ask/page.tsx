// A page of asks (`/asks/page/<page>`, and `/asks/<ask>` at one of them; the
// review's): the asks an agent made in sequence, in the order made, each an
// agent's guided review for the owner, composed from the lab's primitives
// and the material it is about, as the agent's machine says: its head, the
// index of its sections, every section the owner's answers reach on one
// scrolling page, and its own Send held in reach under them. A page of one
// ask is that ask's page alone; a page of more is headed by how many it
// holds and how many are answered, each ask a part under it, folded to a
// line of its answers once answered, and the page takes the owner to the
// first still asking. The page is only which parts show and where; the
// review reads the page (`askPage`), each ask's provider holds its ask
// (`context.tsx`), the parts draw it (`parts.tsx`, `material.tsx`).

import { useAtomRefresh, useAtomValue } from '@bible/atom-solid';
import { For, Show } from '@solidjs/web';
import { Match, Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { type Accessor, createMemo } from 'solid-js';
import {
  type AskRecord,
  type AsksPage as Page,
  nextAsking,
  pageCount,
  pageCountText,
} from '../../core/ask.ts';
import { useReview } from '../review/context.tsx';
import { failureText } from '../review/format.ts';

import { PlaceStyle } from '../place-style.tsx';
import { PHONE, WIDE } from '../viewport.ts';
import * as Ask from './parts.tsx';

/**
 * An ask's look, read only through the studio's tokens: its own place's, so
 * it rides with the page (`PlaceStyle`). Its rules name the ask's own parts,
 * and the material it shows keeps the look it has everywhere: the rules under
 * `.ak-mat` set only the layout and size an ask's column asks of it (a
 * pending row's inset, a note's smaller title, and the script's reader run
 * out over the gutter with its name). The rules that reach past the ask are
 * the laptop's: the main column keeps no bottom room (`.rv-main:has(.ak-send)`),
 * the dock no margin, and a still opened full size (`.rv-lightbox`) sits above
 * the dock, while the ask's Send is held at its floor. What
 * else differs is the parts' own: the reader leaves out the day's spend by
 * its `cost` prop, and a video's quiet play is the player's (`PlayedAlone`'s
 * `quiet`).
 */
const ASK_CSS = `
.ak,.akp{max-width:720px;margin:0 auto}
.ak-head{display:grid;gap:var(--s-1);padding:var(--s-4) 0 var(--s-3)}
.ak-head-row{display:flex;flex-wrap:wrap;align-items:baseline;gap:var(--s-1) var(--s-2)}
.ak-head h1{font-size:var(--fs-5);line-height:var(--lh-5);font-weight:var(--w-3);margin:0}
.ak-head p{margin:0}
.ak-why{color:var(--text-1)}
.ak-by{color:var(--text-2);font-size:var(--fs-2);line-height:var(--lh-2)}
.ak-index ol{display:flex;flex-wrap:wrap;gap:var(--s-1);margin:0 0 var(--s-3);padding:0;list-style:none}
.ak-index-go{gap:var(--s-1);min-height:var(--hit);padding:0 var(--s-2)}
.ak-index-done{color:var(--state-approved)}
.ak-status p{margin:0}
.ak-status:has(button){display:grid;justify-items:start;gap:var(--s-2);margin-bottom:var(--s-3)}
.ak-sections{display:grid;gap:var(--s-6)}
.ak-step,.ak-outcome{display:grid;gap:var(--s-3);min-width:0;scroll-margin-top:var(--header-h)}
.ak-section-h{position:sticky;top:var(--header-h);z-index:5;margin:0;padding:var(--s-2) 0;
  background:var(--surface-1);border-bottom:var(--border);
  font-size:var(--fs-5);line-height:var(--lh-5);font-weight:var(--w-3)}
.ak-count{color:var(--text-2)}
/* The last section is the reading window tall (the window less the header, the dock and the
   shell's chrome under the page), so the head before it scrolls away; its rows keep their height. */
.ak-step:last-child{align-content:start;
  min-height:calc(100dvh - var(--header-h) - var(--dock-h) - var(--shell-floor) - var(--s-4))}
.ak-h{font-size:var(--fs-3);line-height:var(--lh-3);font-weight:var(--w-2);margin:0}
.ak-prose{margin:0;white-space:pre-line}
.ak-img{margin:0;display:grid;gap:var(--s-1)}
.ak-img img{display:block;width:100%;height:auto;background:var(--surface-0)}
.ak-img figcaption{color:var(--text-2);font-size:var(--fs-2);line-height:var(--lh-2)}
.ak-field{display:grid;gap:var(--s-2);border:0;margin:0;padding:0;min-width:0;
  scroll-margin-top:calc(var(--header-h) + var(--hit) + var(--s-4))}
.ak-field legend,.ak-legend{font-size:var(--fs-5);line-height:var(--lh-5);font-weight:var(--w-3);padding:0;margin-bottom:var(--s-2)}
.ak-field[data-invalid=true] legend,.ak-field[data-invalid=true] .ak-legend{color:var(--state-findings)}
.ak-field[data-invalid=true] .ak-text{border-color:var(--state-findings)}
.ak-unanswered{margin:0;color:var(--state-findings);font-size:var(--fs-2);line-height:var(--lh-2)}
.ak-rec-why{margin:0;color:var(--text-2);font-size:var(--fs-2);line-height:var(--lh-2)}
.ak-optional{color:var(--text-2);font-weight:var(--w-1)}
.ak-options{display:flex;flex-wrap:wrap;gap:var(--s-2)}
.ak-options[data-pictured=true]{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}
.ak-option{display:grid;justify-content:stretch;gap:var(--s-1);min-height:var(--hit);padding:var(--s-1) var(--s-2);text-align:left}
.ak-text{width:100%;box-sizing:border-box;resize:vertical;font:inherit}
.ak-mat .rv-pending .rv-row{padding-inline:0}
.ak-mat .rv-note h1{font-size:var(--fs-4);line-height:var(--lh-4)}
.ak-send{justify-content:space-between;margin-top:var(--s-4)}
.ak-send [data-role=answered]{min-width:0;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.ak-send [data-act=send]{flex:none;min-width:8rem;min-height:var(--hit)}
.ak-answers{display:grid;gap:var(--s-2);margin:0}
.ak-answers dt{color:var(--text-2);font-size:var(--fs-2);line-height:var(--lh-2)}
.ak-answers dd{margin:0}
.ak-outcome p{margin:0}
.akp-head{display:grid;gap:var(--s-1);padding:var(--s-4) 0 var(--s-3);border-bottom:var(--border)}
.akp-head h1{font-size:var(--fs-5);line-height:var(--lh-5);font-weight:var(--w-3);margin:0}
.akp-count{margin:0;color:var(--text-2);font-size:var(--fs-2);line-height:var(--lh-2)}
.akp-status p{margin:0}
.akp-status:has(button){display:grid;justify-items:start;gap:var(--s-2);margin:var(--s-3) 0}
.akp-parts{display:grid;gap:var(--s-6);padding-top:var(--s-3)}
.akp .ak{margin:0;max-width:none;min-width:0;scroll-margin-top:var(--header-h)}
.akp .ak-part-h{font-size:var(--fs-5);line-height:var(--lh-5);font-weight:var(--w-3);margin:0}
/* Only the page's last ask holds its last section a window tall: an ask above it ends where it ends. */
.akp .ak:not(:last-child) .ak-step:last-child{min-height:0}
.ak-folded{min-width:0}
.ak-folded-line{display:flex;align-items:center;gap:var(--s-2);min-height:var(--hit);cursor:pointer}
.ak-folded-title{flex:none;max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:var(--w-2)}
.ak-folded-answers{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-2)}
.ak-folded[open] .ak-outcome{padding-top:var(--s-2)}
/* The script's reader is inset by the gutter, so it runs out over the gutter, and the held heads
   with it: its words then start on the column's edge, on the phone and the laptop alike. */
.ak-mat[data-material=script],.ak-section-h{margin-inline:calc(-1 * var(--gutter))}
.ak-mat[data-material=script] .ak-mat-name,.ak-section-h{padding-inline:var(--gutter)}
@media ${PHONE}{
  /* On a page of more asks each part's Send is held at the floor while its part is in view, as the
     laptop holds the one Send: docked to the window, every part's would lie on one another. */
  .akp .ak-send{position:sticky;left:auto;right:auto;margin-inline:calc(-1 * var(--gutter))}
}
@media ${WIDE}{
  .ak-options[data-pictured=true]{grid-template-columns:repeat(4,minmax(0,1fr))}
  /* Held at the window's floor and run out over the gutter as the heads are, so its words start
     on the column's edge and its Send ends on the other. */
  .ak-send{position:sticky;top:auto;bottom:0;border-top:var(--border);border-bottom:0;
    margin-inline:calc(-1 * var(--gutter));padding-inline:var(--gutter)}
  /* The held Send is the page's floor: the main column keeps no room under it, nor the dock a margin. */
  .rv-main:has(.ak-send){padding-bottom:0}
  .rv-main .sh-dock.ak-send{margin-bottom:0}
  /* A still opened full size keeps its group above the held Send: the dock's height is the
     lightbox's floor and comes off the still's. Read through the Send (body:has), so it holds only
     while the Send is drawn and outranks the shared .rv-lightbox in whichever order the sheets load. */
  body:has(.ak-send) .rv-lightbox{padding-bottom:calc(var(--s-4) + var(--dock-h))}
  body:has(.ak-send) .rv-lightbox img{max-height:calc(100dvh - 2 * var(--s-4) - var(--dock-h) - var(--s-2) - var(--lh-2))}
}
`;

/** One ask on a page of its own: its head and index, its sections and its send, or what came of it. */
const OneAsk = (props: {
  readonly id: string;
  readonly first: Accessor<AskRecord>;
  readonly moved: () => void;
}) => (
  <Ask.Provider ask={props.id} first={props.first} moved={props.moved}>
    <article class="ak" data-ask={props.id}>
      <Ask.Head />
      <Ask.Index />
      <Ask.Status />
      <div class="ak-sections">
        <Ask.Sections />
      </div>
      <Ask.Submit />
      <Ask.Outcome />
    </article>
  </Ask.Provider>
);

/**
 * One ask of a page of more: while it asks, its head, index, sections and
 * send; once answered or closed, one line of its answers; the page takes the
 * owner to it when it is `next` (the first still asking past the first part).
 */
const PartAsk = (props: {
  readonly id: string;
  readonly first: Accessor<AskRecord>;
  readonly moved: () => void;
  readonly next: Accessor<boolean>;
}) => (
  <Ask.Provider ask={props.id} first={props.first} moved={props.moved}>
    <article class="ak" data-ask={props.id}>
      <Ask.WhileAsking>
        <Ask.PartHead />
        <Ask.Index />
        <Ask.Status />
        <div class="ak-sections">
          <Ask.Sections />
        </div>
        <Ask.Submit />
      </Ask.WhileAsking>
      <Ask.Folded />
      <Show when={props.next()}>
        <Ask.TakeTo />
      </Show>
    </article>
  </Ask.Provider>
);

/** The ask `at` names on `page` while it asks, else the first still asking: where the page takes the owner. */
const nextOn = (page: Page, at: Option.Option<string>): Option.Option<string> =>
  Option.orElse(
    Option.filter(at, (id) => page.asks.some((a) => a.id === id && a.state._tag === 'Asking')),
    () => Option.map(nextAsking(page.asks), (a) => a.id),
  );

/** A page of more than one ask: its title and count, then each ask in the order made. */
const ManyAsks = (props: {
  readonly page: Accessor<Page>;
  readonly at: Option.Option<string>;
  readonly moved: () => void;
}) => {
  const { state } = useReview();
  // Each part is drawn once by its ask's id: a read again of the page keeps every part (its draft, its send) where it is.
  const ids = createMemo(() => props.page().asks.map((a) => a.id));
  const recordOf = (id: string) =>
    Option.fromUndefinedOr(props.page().asks.find((a) => a.id === id));
  const next = createMemo(() => nextOn(props.page(), props.at));
  return (
    <section class="akp" data-page={props.page().page}>
      <header class="akp-head">
        <h1>
          {Option.match(state.ask(), {
            onNone: () => `${ids().length} asks`,
            onSome: (shown) => shown.title,
          })}
        </h1>
        <p class="akp-count" data-role="page-count" role="status" aria-live="polite">
          {pageCountText(pageCount(props.page().asks))}
        </p>
      </header>
      <div class="akp-parts">
        <For each={ids()}>
          {(id, i) => (
            <Show when={Option.getOrUndefined(recordOf(id))}>
              {(first: Accessor<AskRecord>) => (
                <PartAsk
                  id={id}
                  first={first}
                  moved={props.moved}
                  next={() => i() > 0 && Option.contains(next(), id)}
                />
              )}
            </Show>
          )}
        </For>
      </div>
    </section>
  );
};

/**
 * The page of asks `of` is on (`of` an ask's id, a page's its first ask's),
 * taken to ask `at` while it asks, else to the first still asking: one ask
 * alone as its own page, more as parts of one. Each answer that lands reads
 * the page again, so its count moves and an ask that joined it shows.
 */
export const AsksPage = (props: { readonly of: string; readonly at: Option.Option<string> }) => {
  const { meta } = useReview();
  const read = useAtomValue(() => meta.askPage(props.of));
  const again = useAtomRefresh(() => meta.askPage(props.of));
  const page = createMemo(() => AsyncResult.value(read()));
  return (
    <>
      <PlaceStyle css={ASK_CSS} />
      <Show
        when={Option.getOrUndefined(page())}
        fallback={
          <div class="akp akp-status">
            <p class="rv-hint" role="status" aria-live="polite">
              {Match.value(read()).pipe(
                Match.tag('Failure', (f) =>
                  Option.match(AsyncResult.error(f), {
                    onNone: () => 'This page of asks cannot be read.',
                    onSome: (e) => `This page of asks cannot be read: ${failureText(e)}`,
                  }),
                ),
                Match.orElse(() => 'Reading the asks…'),
              )}
            </p>
            <Show when={AsyncResult.isFailure(read())}>
              <button type="button" class="sh-btn" data-act="retry" onClick={() => again()}>
                Read again
              </button>
            </Show>
          </div>
        }
      >
        {(shown: Accessor<Page>) => (
          <Show
            when={shown().asks.length > 1}
            fallback={
              // Drawn once by its ask's id: a read again of the page keeps its draft and its last word.
              <Show when={shown().asks[0]?.id} keyed>
                {(id: string) => (
                  <Show when={shown().asks.find((a) => a.id === id)}>
                    {(first: Accessor<AskRecord>) => <OneAsk id={id} first={first} moved={again} />}
                  </Show>
                )}
              </Show>
            }
          >
            <ManyAsks page={shown} at={props.at} moved={again} />
          </Show>
        )}
      </Show>
    </>
  );
};
