/** Select-to-lookup, as one owner every reading surface mounts (§7).
 *
 *  §7: "Curated phrases render as visible links; **any text selection can be
 *  looked up on demand** as the fallback", and §10's Milestone 7 ships "any
 *  selection is lookup-able". *Any* is the word this module exists for. The
 *  first version wired the gesture into `bible-reader.tsx` alone, so a reader
 *  inside *The Great Controversy* — prose that carries the same phrase overlay,
 *  on a surface built from the same components — could select a phrase and be
 *  answered with nothing at all. A rule that holds on one of three reading
 *  surfaces is not the rule §7 states.
 *
 *  One owner rather than the same twenty lines in three components, for the
 *  reason `useWritingsPhrases` is one hook shared by the writings readers: a
 *  selection that opened a panel on one surface and did nothing on another is a
 *  difference no reader could explain, and three copies of a gesture are three
 *  chances to spell it differently.
 *
 *  **What each surface contributes** is the context, and only that. §7 gives
 *  `context` one job — locating the selection inside a verse for the Strong's
 *  group — so the Bible reader passes a context built from `selectionVerse`,
 *  which answers only when one verse holds the whole selection, and the writings
 *  readers pass {@link noContext}, because no verse holds any of their prose.
 *  The adapter already documented that case; nothing had ever used it.
 */

import type { VerseReference } from '@bible/core/bible';
import type { LookupInput } from '@bible/core/wiki';
import { useNavigate } from '@solidjs/router';
import { Show } from '@solidjs/web';
import { Option } from 'effect';
import { createSignal, onCleanup } from 'solid-js';

import { LookupPanel } from './lookup-panel.js';
import { lookupSelection, selectionOwnsClick, type TextSelection } from './lookup-selection.js';
import { topicPath } from './peek-state.js';

/** Where a surface says a selection came from, given the selection itself. */
export type SelectionContext = (selection: TextSelection) => Option.Option<VerseReference>;

/** No verse holds this selection: writings prose, and any surface that is not
 *  Scripture. Four groups rather than a guessed fifth. */
export const noContext: SelectionContext = () => Option.none();

export interface SelectionLookup {
  /** The selection being resolved, if any. */
  readonly input: () => Option.Option<LookupInput>;
  /** The gesture: the reader finished a selection on this surface.
   *
   *  An empty result leaves any open panel alone. Selecting nothing is not a
   *  request to dismiss; the panel's own Close control and the sheet's backdrop
   *  are. */
  readonly select: (context: SelectionContext) => void;
  readonly dismiss: () => void;
}

/** The live DOM selection, as the pure rules read one. */
const current = (): Option.Option<TextSelection> => Option.fromNullishOr(window.getSelection());

export const useSelectionLookup = (): SelectionLookup => {
  const [lookup, setLookup] = createSignal(Option.none<LookupInput>());
  /** Whether a selection this owner accepted is still waiting for the `click`
   *  that completed it (§8.5). One boolean rather than a signal: nothing
   *  renders from it, and a reactive read inside a capture listener would make
   *  a DOM event handler part of the component's dependency graph. */
  let accepted = false;
  /** The selection that was live when the current pointer gesture began.
   *
   *  A press-and-release that leaves the selection exactly as it found it did
   *  not make one, and must not be read as a request to look anything up. The
   *  case is ordinary: pressing a `<button>` does not collapse a selection in
   *  the reading engine, so a reader who looks a phrase up and then taps a
   *  phrase span still has their old range live under the tap — and without
   *  this snapshot that tap would re-accept the *previous* selection, re-open
   *  the panel it already answered, and take the click the peek card was
   *  waiting for. */
  let pressed = '';

  /** §8.5's rule, against the layer that would otherwise answer first.
   *
   *  A drag ends in `mouseup` — which opens the panel — and the browser then
   *  delivers a `click` to the element the gesture began and ended on, because
   *  a click is a press and a release on one target however far the pointer
   *  travelled between them. Both reading layers are listening for that click:
   *  the phrase span opens §5's peek card and the verse surface opens §8.5's
   *  study pane. One gesture would then open two surfaces, with the second
   *  covering the answers the first was asked for.
   *
   *  **In the capture phase, on the document**, and both halves are
   *  load-bearing. A guard on the reading surface is too late by construction:
   *  the phrase span is *inside* it, so the span's own bubbling handler has
   *  already peeked by the time the surface is reached. Capturing at the
   *  document is the only position that precedes every handler in the subtree —
   *  Solid's delegated listeners included, which are bubble-phase listeners on
   *  the document itself — so this is the one place the rule can be stated once
   *  for all three reading surfaces rather than three times, once per surface,
   *  in the three components that mount a panel.
   *
   *  Exactly one click wide. The record is cleared by the first click after the
   *  selection was accepted, so the phrase tap that follows a lookup still
   *  peeks and the verse tap that follows one still opens the pane: this is a
   *  rule about one gesture, not a mode the reader has to get out of. The live
   *  selection is consulted as well as the record, because a press that begins
   *  a new gesture collapses the selection before its `click` is delivered —
   *  which is what tells "the click this drag ended with" apart from "the next
   *  click the reader made", the case of a keyboard selection followed by a tap
   *  on the panel's own rows. */
  const consumeOwnedClick = (event: MouseEvent): void => {
    if (!accepted) return;
    accepted = false;
    if (!selectionOwnsClick(current())) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  /** A press begins a new gesture, so nothing accepted before it can own the
   *  click this press is about to produce.
   *
   *  This is what keeps the rule pointer-shaped. `select` is also reached from
   *  `keyup` — a shift-arrow selection asks for a lookup exactly as a drag does
   *  — and a keyboard selection is completed by no click at all. Without this
   *  line the record would sit there until the reader's *next* press spent it,
   *  and that press is a real tap on a real control: the panel's own Close
   *  button, one of its rows, a phrase. Pressing does not collapse a selection
   *  when the press lands on a button, so the live-selection test alone would
   *  not catch it — the reader would meet a panel whose controls did nothing
   *  once. A press clears the record, so only a selection completed *after* the
   *  last press owns the click that follows. */
  const beginGesture = (): void => {
    accepted = false;
    pressed = Option.match(current(), { onNone: () => '', onSome: (made) => made.toString() });
  };

  document.addEventListener('mousedown', beginGesture, true);
  document.addEventListener('click', consumeOwnedClick, true);
  onCleanup(() => {
    document.removeEventListener('mousedown', beginGesture, true);
    document.removeEventListener('click', consumeOwnedClick, true);
  });

  return {
    input: lookup,
    select: (context) => {
      const live = current();
      if (Option.isNone(live)) return;
      // The gesture ended on the selection it started with: nothing was
      // selected by it, so there is nothing here to look up.
      if (live.value.toString() === pressed) return;
      const asked = lookupSelection(live.value, context(live.value));
      if (Option.isNone(asked)) return;
      accepted = true;
      setLookup(asked);
    },
    dismiss: () => setLookup(Option.none()),
  };
};

/** §7's combined panel, in the Milestone 5 pane surface.
 *
 *  Mounted from the reading surface rather than from inside the study pane,
 *  because a lookup is not verse-scoped: the reader may select text on a chapter
 *  route where no pane is open at all, or in a writings page where there is no
 *  pane to open. A lone topic hit renders §5's peek card instead — the flag is
 *  core's, and the panel obeys it. */
export const SelectionLookupPanel = (props: { readonly lookup: SelectionLookup }) => {
  const navigate = useNavigate();
  return (
    <Show when={Option.getOrUndefined(props.lookup.input())}>
      {(input) => (
        <LookupPanel
          input={input()}
          onDismiss={props.lookup.dismiss}
          onOpenTopic={(crumb) => {
            props.lookup.dismiss();
            navigate(topicPath(crumb.slug));
          }}
        />
      )}
    </Show>
  );
};
