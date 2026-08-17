import {
  verseNumber,
  type ChapterReference,
  type VerseNumber,
  type VerseReference,
} from '@bible/core/bible';
import { useNavigate } from '@solidjs/router';
import { Errored, For, Loading, Show } from '@solidjs/web';
import { Option } from 'effect';
import { createEffect, createSignal } from 'solid-js';

import { useBibleChapter } from '../runtime/index.js';
import { ContextMenu, ScrollViewport, SplitPane } from '../ui/index.js';
import { AnnotationTools } from '../library/annotation-tools.js';
import { claimedGesture } from './gesture.js';
import {
  closeAction,
  deepened,
  tapped,
  verseKey,
  type PaneEntry,
  type PaneReference,
} from './study-pane-state.js';
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
   *  The whole verse is the tap surface today because the reader renders
   *  `{verse.text}` as one text node — there are no phrase spans yet. §8.5's
   *  rule is that **the two link layers never claim the same gesture**: verse
   *  tap opens the study pane, wiki phrase tap opens the peek card, and the
   *  verse surface owns the tap *outside* a phrase span.
   *
   *  This handler is written to honor that rule before the phrase layer exists.
   *  It reads the event target and does nothing when the tap landed on an
   *  element that claims its own gesture — today the verse-number anchor, and
   *  in Milestone 6 the phrase spans that will replace `{verse.text}`. A phrase
   *  span marked `data-claims-gesture` therefore nests *inside* this surface
   *  with no re-plumbing here: M6 adds the spans and the attribute, and the
   *  precedence is already correct.
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
              >
                <a
                  class="bible-verse-number"
                  href={versePath(verse.reference.verse)}
                  aria-label={`Open study tools for verse ${String(verse.reference.verse)}`}
                >
                  {verse.reference.verse}
                </a>
                {verse.text}
              </p>
            </ContextMenu>
          )}
        </For>
      </div>
    </ScrollViewport>
  );

  return (
    <article class="bible-reader">
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
