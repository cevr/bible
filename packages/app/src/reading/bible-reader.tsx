import {
  Reference,
  verseNumber,
  type ChapterReference,
  type VerseNumber,
  type VerseReference,
} from '@bible/core/bible';
import { useNavigate } from '@solidjs/router';
import { Errored, For, Loading, Show } from '@solidjs/web';
import { Option } from 'effect';
import { createEffect, createMemo, createSignal } from 'solid-js';

import type { MarginNoteAnchor } from '@bible/core/bible-rendering';

import { useBibleChapter, useChapterMarginAnchors, useWikiDictionary } from '../runtime/index.js';
import { ContextMenu, ScrollViewport, SplitPane } from '../ui/index.js';
import { AnnotationTools } from '../library/annotation-tools.js';
import { claimedGesture } from './gesture.js';
import { selectionVerse } from './lookup-selection.js';
import {
  SelectionLookupPanel,
  useSelectionLookup,
  type SelectionContext,
} from './selection-lookup.js';
import { PeekCard } from './peek-card.js';
import {
  dismissesPeek,
  dismissOnPlanChange,
  dismissPeek,
  noPeek,
  phraseTap,
  topicPath,
  type Peeked,
  type PhraseOccurrenceId,
} from './peek-state.js';
import { buildChapterPlan, usePhraseSource, versePlan } from './match-plan.js';
import {
  closeAction,
  deepened,
  tapped,
  verseKey,
  type PaneEntry,
  type PaneReference,
} from './study-pane-state.js';
import { VerseSegments } from './verse-segments.js';
import { usePanePresentation, VerseStudyPane } from './verse-study-pane.js';

export interface BibleReaderProps {
  readonly reference: ChapterReference | VerseReference;
}

export const BibleReader = (props: BibleReaderProps) => {
  const navigate = useNavigate();
  const chapter = useBibleChapter(() => ({
    book: props.reference.book,
    chapter: props.reference.chapter,
  }));
  const presentation = usePanePresentation();
  /** How the pane got here, and how much history it owns.
   *
   *  Recorded rather than read off history: `window.history` exposes only its
   *  length, and this component is the only place that knows which of its
   *  entries the pane put there. A session that opened the verse route directly
   *  owns none of them — the `deep-link` case — which is exactly the distinction
   *  `closeAction` needs to choose between going back and collapsing in place.
   *
   *  The default is `deep-link` because the reader may be mounted *on* a verse
   *  route: at that moment nothing belonging to this app precedes it. */
  const [entry, setEntry] = createSignal<PaneEntry>({ _tag: 'deep-link' });
  const versePath = (verse: number) =>
    `/bible/${String(props.reference.book)}/${String(props.reference.chapter)}/${String(verse)}`;
  const activeVerse = (verse: number) => {
    let marker = Option.none<''>();
    if (props.reference._tag === 'verse' && props.reference.verse === verse) {
      marker = Option.some('');
    }
    return Option.getOrUndefined(marker);
  };
  const selectedVerse = (): number => {
    if (props.reference._tag === 'verse') return props.reference.verse;
    return 1;
  };
  /** The verse the pane studies, as the branded number the procedure payload
   *  declares. Falls back to the chapter's own first verse — the pane only
   *  renders under `_tag === 'verse'`, so the fallback is the type system's
   *  business rather than a state a reader reaches. */
  const studyVerse = (): VerseNumber => {
    if (props.reference._tag === 'verse') return props.reference.verse;
    return verseNumber(1);
  };
  const verseLabel = (): string =>
    `${chapter().book.name} ${String(props.reference.chapter)}:${String(selectedVerse())}`;
  /** Opens the study pane on a verse (§8.5).
   *
   *  §8.5's rule is that **the two link layers never claim the same gesture**:
   *  verse tap opens the study pane, wiki phrase tap opens the peek card, and
   *  the verse surface owns the tap *outside* a phrase span.
   *
   *  The handler honors it by reading the event target and doing nothing when
   *  the tap landed on an element that claims its own gesture — the verse-number
   *  anchor, and the phrase spans `VerseSegments` now renders with
   *  `data-claims-gesture`. This is the seam Milestone 5 built the rule around
   *  and Milestone 6 landed into: adding the spans needed no change here at all,
   *  because `claimedGesture` walks from the target up to the verse surface and
   *  already stops at anything carrying the attribute.
   *
   *  Anchors are excluded rather than special-cased for a second reason: the
   *  verse number is a real link, and calling `navigate` on top of the
   *  browser's own activation would push the same route twice. */
  /** Opens the pane on a verse, recording the entry the tap pushes.
   *
   *  Push rather than replace: the chapter the reader was on stays reachable by
   *  Back, which is what makes the pane feel like a place they went to rather
   *  than a state the chapter changed into. Closing undoes exactly this push
   *  (`closeAction` → `pop`), so the round trip leaves the stack as it was. */
  const openPane = (verse: number): void => {
    setEntry(tapped);
    navigate(versePath(verse));
  };

  const openStudy = (event: MouseEvent, verse: number): void => {
    const target = event.target;
    if (target instanceof Element && Option.isSome(claimedGesture(target))) return;
    // §8.5's third claimant — the selection that ends in a `click` on this same
    // element — is not answered here. `useSelectionLookup` consumes that click
    // in the capture phase, before this handler or a phrase span's runs; a
    // guard on this handler would be too late for the phrase layer, which sits
    // inside it and bubbles first.
    openPane(verse);
  };

  const paneReference = (): PaneReference => ({
    book: props.reference.book,
    chapter: props.reference.chapter,
    verse: selectedVerse(),
  });

  /** Every verse route the pane reaches *while already open* is one more entry
   *  it owns.
   *
   *  A cross-reference and a concordance hit inside the open pane are real
   *  `<a href>` navigations to real verse routes, so each pushes. Closing has to
   *  undo all of them together or the reader lands on the previous verse — back
   *  inside the pane they just closed, which is the same dead-Back complaint at
   *  one more remove.
   *
   *  Keyed on the *pane's own address*: the route path when a verse is showing
   *  and the empty string when it is not. So chapter → verse is the open, which
   *  `openPane` already recorded, and verse → verse is the deepening this
   *  counts. Deriving the two from one key rather than from a second signal is
   *  what keeps them from disagreeing about whether the pane is open. */
  const openPaneKey = (): string => {
    if (props.reference._tag !== 'verse') return '';
    return verseKey(paneReference());
  };
  createEffect(openPaneKey, (key, previous) => {
    if (key === '') return;
    if (Option.isNone(Option.fromNullishOr(previous))) return;
    if (previous === '') return;
    setEntry(deepened(entry()));
  });

  /** Puts the study tools away, undoing exactly the history the pane created.
   *
   *  A tap-opened pane goes *back* over the entries it pushed: the route it
   *  opened over is already the previous entry, so replacing instead would put a
   *  second copy of it on top — two adjacent identical entries, and a reader
   *  pressing Back once appears to have pressed nothing. A deep-linked pane has
   *  no previous entry belonging to this app, so going back would leave the app
   *  and the verse entry is collapsed into the chapter in place. */
  const closePane = (): void => {
    const action = closeAction(paneReference(), entry());
    setEntry({ _tag: 'deep-link' });
    if (action._tag === 'pop') {
      navigate(-action.depth);
      return;
    }
    navigate(action.path, { replace: true });
  };

  // -------------------------------------------------------------------------
  // The wiki phrase overlay (§4)
  //
  // One automaton per dictionary (`usePhraseSource`), and — because §4.5's
  // table makes **the chapter** the section for Bible text — one
  // `SectionMatchState` per rendered chapter, spent in one pass over every
  // verse in verse order. What the JSX reads is the finished plan, never the
  // matcher: `match-plan.ts` says why a reactive renderer must not be the thing
  // that consumes a mutating matcher.
  // -------------------------------------------------------------------------
  const source = usePhraseSource(useWikiDictionary());
  /** The margin anchors for this chapter — the pipeline's third layer, which
   *  the reader had no data for until now. A second read beside the chapter, so
   *  the text is not held back by a table most chapters have no rows in. */
  const anchors = useChapterMarginAnchors(() => ({
    book: props.reference.book,
    chapter: props.reference.chapter,
  }));
  const anchorsByVerse = createMemo(() => {
    const byVerse = new Map<number, readonly MarginNoteAnchor[]>();
    for (const entry of anchors().verses) byVerse.set(entry.verse, entry.anchors);
    return byVerse;
  });

  /** The whole chapter, rendered: every verse's segments and every phrase's
   *  occurrence id, from **one** matcher pass in verse order.
   *
   *  The memo's key is the chapter address, so turning the page mints a fresh
   *  §4.5 section and every phrase gets its first occurrence again — and,
   *  because the address is the first component of every occurrence id, no id in
   *  the new plan can equal one from the old, which is what invalidates an open
   *  peek across a chapter turn. */
  const plan = createMemo(() =>
    buildChapterPlan({
      key: `${String(props.reference.book)}/${String(props.reference.chapter)}`,
      source: source(),
      verses: chapter().verses.map((verse) => ({
        verse: verse.reference.verse,
        text: verse.text,
        marginNotes: anchorsByVerse().get(verse.reference.verse) ?? [],
      })),
    }),
  );

  /** §5's peek state: which phrase occurrence, if any, is showing its card. */
  const [peeked, setPeeked] = createSignal(noPeek);

  // -------------------------------------------------------------------------
  // Select-to-lookup (§7)
  //
  // "Curated phrases render as visible links; **any text selection can be
  // looked up on demand** as the fallback." The gesture is the selection
  // itself: §7 gives the panel **no action menu**, so there is no intermediate
  // step between selecting a run of text and seeing what it could mean.
  //
  // §8.5 is untouched by this. A tap leaves a *collapsed* selection, which
  // `lookupSelection` answers `None` to, so the verse tap still opens the study
  // pane and a phrase tap still peeks — only a real range asks for a lookup.
  // -------------------------------------------------------------------------
  const lookup = useSelectionLookup();

  /** §7's `context` for a selection made in this chapter.
   *
   *  The verse comes from **the selection itself**, through `selectionVerse`,
   *  rather than from the element the gesture ended in: a drag that starts in
   *  verse 12 and ends in verse 13 ends in an element that can only name 13,
   *  and core would then compare verse 13's words against verse 12's text. The
   *  rule is that one verse must hold the whole range or there is no context,
   *  which is exactly what §7 means by "locates the selection inside a verse". */
  const verseContext: SelectionContext = (selection) =>
    Option.map(selectionVerse(selection), (verse) =>
      Reference.verse(props.reference.book, props.reference.chapter, verse),
    );

  /** A new plan closes the card.
   *
   *  A chapter turn is the obvious case, and the occurrence id already makes the
   *  *marking* correct there — no span in the new chapter can match the open id —
   *  but the card is mounted from the peek value and would otherwise float over
   *  the new chapter explaining a phrase that is no longer on screen.
   *
   *  Keyed on the plan **value**, not on `plan().key`, because the section key is
   *  not the only thing that changes the numbering underneath an open id. This
   *  chapter's margin anchors arrive on a second read (`useChapterMarginAnchors`)
   *  and rebuild the plan at the same address: same key, renumbered spans. See
   *  `dismissOnPlanChange`, which the three surfaces share. */
  dismissOnPlanChange(plan, setPeeked);

  /** A tap on a hot phrase. First tap peeks, second tap on the *same*
   *  occurrence navigates — the rule lives in `phraseTap`, not here. */
  const onPhrase = (tap: Peeked): void => {
    const outcome = phraseTap(peeked(), tap);
    if (outcome._tag === 'navigate') {
      setPeeked(dismissPeek());
      navigate(topicPath(outcome.slug));
      return;
    }
    setPeeked(outcome.state);
  };

  const peekedOccurrence = (): Option.Option<PhraseOccurrenceId> =>
    Option.map(peeked(), (current) => current.occurrence);

  const scripture = () => (
    <ScrollViewport label={`${chapter().book.name} ${String(chapter().reference.chapter)}`}>
      <div class="bible-scripture" role="list">
        <For each={chapter().verses}>
          {(verse) => (
            <ContextMenu
              label={`Verse ${String(verse.reference.verse)} actions`}
              targetProps={{
                role: 'listitem',
                id: `verse-${String(verse.reference.verse)}`,
              }}
              items={[
                {
                  id: 'study',
                  label: 'Open study tools',
                  // Through `openPane` rather than a bare `navigate`, so the
                  // menu path records the same background the tap path does and
                  // the close control behaves identically however the pane was
                  // opened.
                  select: () => openPane(verse.reference.verse),
                },
                {
                  id: 'search',
                  label: 'Search this wording',
                  select: () => navigate(`/search?q=${encodeURIComponent(verse.text)}`),
                },
              ]}
            >
              <p
                data-active={activeVerse(verse.reference.verse)}
                // Pointer and touch both arrive as `click`; the keyboard path is
                // the verse-number anchor below, which is already focusable and
                // already navigates to the same route. So all three input modes
                // reach the pane without three code paths.
                onClick={(event) => openStudy(event, verse.reference.verse)}
                // §7's gesture: the selection itself. `mouseup` is where a drag
                // ends and `keyup` is where a shift-arrow selection does, so the
                // pointer and the keyboard reach the panel through the one
                // builder rather than through two rules.
                onMouseUp={() => lookup.select(verseContext)}
                onKeyUp={() => lookup.select(verseContext)}
                // The verse the §7 context walk reads off the range's two ends.
                data-verse={verse.reference.verse}
              >
                <a
                  class="bible-verse-number"
                  href={versePath(verse.reference.verse)}
                  aria-label={`Open study tools for verse ${String(verse.reference.verse)}`}
                >
                  {verse.reference.verse}
                </a>
                {/* The segment pipeline, finally wired (§4.6). Every phrase span
                    it draws carries `data-claims-gesture`, which `openStudy`'s
                    `claimedGesture` walk above already excludes — so §8.5's rule
                    holds with no change to the verse handler: a tap inside a
                    phrase never opens the study pane, and a tap outside one
                    never reaches `onPhrase`. */}
                <VerseSegments
                  plan={versePlan(plan(), String(verse.reference.verse))}
                  peeked={peekedOccurrence()}
                  onPhrase={onPhrase}
                />
              </p>
            </ContextMenu>
          )}
        </For>
      </div>
      {/* One card for the whole chapter, not one per phrase: §5 allows exactly
          one peek at a time, and a card per span would mount a `useWikiTopic`
          read for every hot phrase on screen. */}
      <Show when={Option.getOrUndefined(peeked())}>
        {(current) => (
          <PeekCard
            slug={current().slug}
            phrase={current().phrase}
            onDismiss={() => setPeeked(dismissPeek())}
            onOpen={(crumb) => {
              setPeeked(dismissPeek());
              navigate(topicPath(crumb.slug));
            }}
          />
        )}
      </Show>
    </ScrollViewport>
  );

  return (
    <article
      class="bible-reader"
      // §5's "tapping elsewhere dismisses", on the whole reading surface rather
      // than on the verse list alone. The chapter heading, the study pane and
      // the annotation tools below are all "elsewhere" to a reader, and scoping
      // this to `.bible-scripture` left a card open over every one of them.
      //
      // Not on the document either: a tap inside the peek card — which portals
      // out of this subtree at narrow and sits outside it at wide — must not
      // dismiss the card the reader is reaching for, and neither must a tap on
      // the phrase itself, whose own handler runs first and re-peeks or
      // navigates. `dismissesPeek` excludes the latter; being scoped to the
      // article excludes the former.
      onClick={(event) => {
        const target = event.target;
        if (target instanceof Element && !dismissesPeek(target)) return;
        setPeeked(dismissPeek());
      }}
    >
      <Errored fallback={(error) => <ReaderFailure error={error()} />}>
        <Loading fallback={<ReaderLoading label="Loading chapter" />}>
          <header class="bible-reader__heading">
            <p class="bible-reader__eyebrow">The Holy Bible · King James Version</p>
            <h1>
              {chapter().book.name} <span>{chapter().reference.chapter}</span>
            </h1>
          </header>
          {/* The §8 study pane: the five corpus sections and the Strong's word
              tap. Above the annotation tools because it is what the verse tap
              was *for* — the reader's own notes stay reachable below it.

              Two presentations, and the narrow one is not a CSS fallback. In a
              rail the pane sits beside the Scripture in a resizable split. At
              `overlay` the split is not used at all: the reader keeps rendering
              the chapter and the pane is a full-width sheet *over* it, with
              focus moved into it. Block-flow stacking — the pane appended after
              the entire chapter — is what made a narrow verse tap change the
              route while the thing the reader asked for sat several screens
              below the fold. */}
          <Show when={props.reference._tag === 'verse' && presentation() === 'rail'}>
            <SplitPane
              label="Resize Scripture and study tools"
              primary={scripture()}
              secondary={
                <>
                  <VerseStudyPane
                    book={props.reference.book}
                    chapter={props.reference.chapter}
                    verse={studyVerse()}
                    label={verseLabel()}
                    presentation="rail"
                    onClose={closePane}
                  />
                  <AnnotationTools
                    location={{
                      source: 'bible',
                      resourceId: 'KJV',
                      location: versePath(selectedVerse()),
                    }}
                    label={verseLabel()}
                    expanded
                  />
                </>
              }
            />
          </Show>
          <Show when={props.reference._tag === 'verse' && presentation() === 'overlay'}>
            {scripture()}
            <VerseStudyPane
              book={props.reference.book}
              chapter={props.reference.chapter}
              verse={studyVerse()}
              label={verseLabel()}
              presentation="overlay"
              onClose={closePane}
            />
          </Show>
          <Show when={props.reference._tag !== 'verse'}>{scripture()}</Show>
          {/* §7's combined panel, in the Milestone 5 pane surface — the same
              owner every reading surface mounts. */}
          <SelectionLookupPanel lookup={lookup} />
          <nav class="bible-reader__pagination" aria-label="Chapter navigation">
            <Show when={Option.getOrUndefined(chapter().previous)}>
              {(previous) => (
                <a href={`/bible/${String(previous().book)}/${String(previous().chapter)}`}>
                  Previous chapter
                </a>
              )}
            </Show>
            <Show when={Option.getOrUndefined(chapter().next)}>
              {(next) => (
                <a href={`/bible/${String(next().book)}/${String(next().chapter)}`}>Next chapter</a>
              )}
            </Show>
          </nav>
        </Loading>
      </Errored>
    </article>
  );
};

export const ReaderLoading = (props: { readonly label: string }) => (
  <div class="bible-reader-state" role="status">
    <span class="bible-reader-state__mark" aria-hidden="true" />
    {props.label}…
  </div>
);

export const ReaderFailure = (props: { readonly error: unknown }) => {
  const message = (): string => {
    if (props.error instanceof Error) return props.error.message;
    return String(props.error);
  };
  return (
    <div class="bible-reader-state bible-reader-state--error" role="alert">
      <strong>This passage could not be opened.</strong>
      <span>{message()}</span>
    </div>
  );
};
