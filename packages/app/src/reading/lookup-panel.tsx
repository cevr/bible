/** The select-to-lookup panel (§7, Milestone 7).
 *
 *  **One combined panel, all five groups, empty groups collapsed, no action
 *  menu.** §7 is explicit about all four, and each of them is a decision about
 *  restraint rather than about markup:
 *
 *  - *One panel.* The five groups are one round trip and one surface. Five
 *    panels, or a panel per corpus, would make the reader choose where to look
 *    before knowing which corpus answered.
 *  - *All groups.* A group that found nothing still draws its row, so the
 *    panel's shape is the result's shape and a reflex gesture always finds the
 *    same rows in the same places (`lookup-panel-state.ts`).
 *  - *No action menu.* A selection opens this directly. There is no intermediate
 *    "Look up / Search / Copy" menu, so the gesture costs one step.
 *  - *A lone topic hit is a peek card.* §5's card, not a panel with one row —
 *    and the decision is `LookupResult.lonePeek`, taken in core. This component
 *    obeys the flag; it does not re-derive it.
 *
 *  **One plan, read once.** Everything below draws `plan()`, a `createMemo` over
 *  one `lookupView` of one result. No branch reads the live result a second
 *  time. Solid tracks each read separately, so a panel that read the result per
 *  group could pair one result's count with the next result's items — two
 *  correct answers rendered as one wrong one, and a reflex gesture is exactly
 *  the situation where the second answer arrives while the first is on screen.
 *
 *  **One component, two hosts.** Web and desktop both render *this* file, so
 *  §10's "identical on web and desktop" is structural rather than maintained.
 *  The two presentations are the study pane's own — the `Dialog surface='sheet'`
 *  at narrow and the rail aside at wide — through `usePanePresentation`, so the
 *  panel appears in the Milestone 5 pane surface rather than in a third surface
 *  of its own.
 */

import type { LookupInput } from '@bible/core/wiki';
import { Errored, For, Loading, Match, Show, Switch, type JSX } from '@solidjs/web';
import { Option } from 'effect';
import { createMemo } from 'solid-js';

import { useLookup } from '../runtime/index.js';
import { Button, Dialog } from '../ui/index.js';
import { lookupView, type LookupGroupView, type LookupView } from './lookup-panel-state.js';
import { PeekCard } from './peek-card.js';
import { topicPath } from './peek-state.js';
import { usePanePresentation } from './verse-study-pane.js';

export interface LookupPanelProps {
  /** The selection being resolved, as the portable input both DOM hosts build
   *  with `lookupSelection` and the CLI builds from its argument. */
  readonly input: LookupInput;
  readonly onDismiss: () => void;
  /** The click-through on a topic or catalog row. Routed through the caller
   *  rather than a bare `<a>` because arriving at a topic is a breadcrumb hop
   *  and the trail is the caller's to keep — the same contract `PeekCard` has. */
  readonly onOpenTopic: (crumb: { readonly slug: string; readonly title: string }) => void;
}

/** The panel's frame, at whichever presentation the viewport calls for.
 *
 *  The study pane's two presentations, not a third: narrow gets the app's own
 *  `Dialog` in its `sheet` surface — the focus trap, the focus restore, the
 *  scroll lock and the Escape handling that `ui/dialog.tsx` already implements —
 *  and wide gets a labelled aside beside the Scripture. A wide panel is not
 *  announced as a modal because it does not cover the reading, which is the
 *  same reasoning `PeekCard` states. */
const LookupSurface = (props: {
  readonly label: string;
  readonly onDismiss: () => void;
  readonly children: JSX.Element;
}) => {
  const presentation = usePanePresentation();
  /** The bar both presentations carry: what was looked up, and the way to put
   *  it away. A close control rather than only an outside tap, for the reason
   *  the study pane grew one — at narrow the panel covers the reader, and
   *  "tap elsewhere" has nowhere to land. */
  const contents = () => (
    <>
      <div class="bible-lookup__bar">
        <h2 class="bible-lookup__heading">{props.label}</h2>
        <Button aria-label={`Close ${props.label}`} onClick={props.onDismiss}>
          Close
        </Button>
      </div>
      {props.children}
    </>
  );
  return (
    <>
      <Show when={presentation() === 'overlay'}>
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) props.onDismiss();
          }}
          title={props.label}
          surface="sheet"
        >
          <div class="bible-lookup bible-lookup--sheet">{contents()}</div>
        </Dialog>
      </Show>
      <Show when={presentation() === 'rail'}>
        <aside class="bible-lookup bible-lookup--card" aria-label={props.label}>
          {contents()}
        </aside>
      </Show>
    </>
  );
};

/** The five rows, drawn from the plan and from nothing else.
 *
 *  `<details>` rather than a hand-rolled disclosure, for the reason the topic
 *  page's sections use it: it is the platform's own control, it is keyboard- and
 *  screen-reader-correct with no JS, and its `open` attribute is exactly the
 *  fact `lookupView` computes. Uncontrolled after that — the reader may open an
 *  empty group to confirm it is empty, and nothing here should fight them for
 *  it. */
const LookupGroups = (props: {
  readonly groups: readonly LookupGroupView[];
  readonly onOpenTopic: LookupPanelProps['onOpenTopic'];
}) => (
  <For each={props.groups}>
    {(group) => (
      <details class="bible-lookup__group" open={group.open} data-group={group.id}>
        <summary>
          <span>{group.label}</span>
          <small>{group.count}</small>
        </summary>
        <ul class="bible-lookup__list">
          <For each={group.rows}>
            {(row) => (
              <li>
                <Switch>
                  <Match when={row._tag === 'topic' && row}>
                    {(topic) => (
                      <>
                        <button
                          type="button"
                          data-topic={topicPath(topic().slug)}
                          onClick={() =>
                            props.onOpenTopic({ slug: topic().slug, title: topic().title })
                          }
                        >
                          {topic().title}
                        </button>
                        <small>{topic().note}</small>
                      </>
                    )}
                  </Match>
                  <Match when={row._tag === 'lexicon' && row}>
                    {(hit) => (
                      <>
                        <span class="bible-lookup__source">{hit().word}</span>
                        <Show
                          when={Option.getOrUndefined(hit().entry)}
                          fallback={<em>No lexicon entry for this word.</em>}
                        >
                          {(entry) => <span>{entry()}</span>}
                        </Show>
                      </>
                    )}
                  </Match>
                  <Match when={row._tag === 'verse' && row}>
                    {(hit) => (
                      <>
                        <a href={hit().href}>{hit().label}</a>
                        <span>{hit().text}</span>
                      </>
                    )}
                  </Match>
                  <Match when={row._tag === 'passage' && row}>
                    {(hit) => (
                      <>
                        <span class="bible-lookup__source">{hit().source}</span>
                        <span>{hit().snippet}</span>
                      </>
                    )}
                  </Match>
                </Switch>
              </li>
            )}
          </For>
        </ul>
      </details>
    )}
  </For>
);

/** The resolved lookup: §5's card for a lone topic hit, the panel otherwise.
 *
 *  Its own component so the branch happens *below* the boundary and *above* the
 *  surface: the peek card brings its own presentation, so a lone hit must not be
 *  wrapped in the panel's frame. */
const LookupResolved = (props: LookupPanelProps) => {
  const result = useLookup(() => ({ text: props.input.text, context: props.input.context }));
  /** The one read. Everything drawn below comes out of this value, so no two
   *  parts of the panel can describe two different results. */
  const plan = createMemo((): LookupView => lookupView(result()));
  return (
    <Show
      when={Option.getOrUndefined(plan().peek)}
      fallback={
        <LookupSurface label={plan().label} onDismiss={props.onDismiss}>
          <LookupGroups groups={plan().groups} onOpenTopic={props.onOpenTopic} />
        </LookupSurface>
      }
    >
      {(topic) => (
        <PeekCard
          slug={topic().slug}
          phrase={topic().phrase}
          onDismiss={props.onDismiss}
          onOpen={props.onOpenTopic}
        />
      )}
    </Show>
  );
};

export const LookupPanel = (props: LookupPanelProps) => (
  <Errored
    fallback={(error) => (
      <LookupSurface label="Lookup" onDismiss={props.onDismiss}>
        <p class="bible-form-status bible-form-status--error" role="alert">
          {String(error())}
        </p>
      </LookupSurface>
    )}
  >
    <Loading
      fallback={
        <LookupSurface label="Lookup" onDismiss={props.onDismiss}>
          <p class="bible-form-status" role="status">
            Looking this up…
          </p>
        </LookupSurface>
      }
    >
      <LookupResolved {...props} />
    </Loading>
  </Errored>
);
