/** The contextual study pane (§8, Milestone 5).
 *
 *  Five sections for one verse — the verse's words with their Strong's numbers,
 *  its cross-references, its margin notes, the EGW Bible Commentary on it, and
 *  the parallel writings that cite it — plus the word-tap drill-down into a
 *  Strong's lexicon entry and its reverse concordance.
 *
 *  **One component, two hosts.** Web and desktop both render *this* file, so
 *  parity is structural rather than maintained: there is no second pane to keep
 *  in step. What differs between the hosts is the history implementation the
 *  shell was built with (`browserHistory()` on web, `hashHistory()` on desktop),
 *  and nothing here reads the location directly — the reference arrives as a
 *  prop from the route the reader already decoded, so the desktop's
 *  everything-after-`#` layout is invisible to this component.
 *
 *  **Loading / Errored / retained-stale** come from the app's existing
 *  convention, not from anything local: `useVerseStudy` is a `useAtomSuspense`
 *  read, so an initial load suspends into the nearest `<Loading>` and a failure
 *  throws into the nearest `<Errored>` — both declared here — while a *refetch*
 *  keeps rendering the previous bundle, because the hook omits
 *  `suspendOnWaiting`. Moving from verse to verse therefore keeps the old
 *  bundle on screen instead of flashing a spinner.
 *
 *  **Narrow and wide are two presentations, not one layout with a media query.**
 *  Wide is the resizable `SplitPane` rail beside the Scripture. Narrow is a
 *  real modal — the app's own `Dialog` in its `sheet` surface — so the focus
 *  trap, the focus restore and the body scroll lock the `role="dialog"` on the
 *  old hand-rolled `<aside>` merely *claimed* are the ones `ui/dialog.tsx`
 *  already implements. The stylesheet's block-flow fallback, which stacked the
 *  pane after the entire chapter, is what made a narrow verse tap change the
 *  route while the study tools sat several screens below the fold. The
 *  breakpoint is the exact query text the split rule uses, read through
 *  `usePanePresentation` so the JS and the CSS cannot disagree about it.
 *
 *  **The decisions are not in this file.** Which numbers a word offers, which
 *  verse the pane is scoped to, what closing does to history, which
 *  presentation a viewport gets — all of it lives in `study-pane-state.ts` and
 *  is tested there. What the *markup* does — one transport request per verse,
 *  a working focus trap on the narrow sheet — is asserted against this compiled
 *  component in `apps/desktop/e2e/study-pane.spec.ts`, because a topology test
 *  over the hooks cannot see a second fetch added to the JSX.
 */

import type { BookNumber, ChapterNumber, VerseNumber } from '@bible/core/bible';
import type {
  ConcordanceEntry,
  StrongsLanguage,
  StrongsNumber,
  StudyCrossReference,
  StudyWord,
} from '@bible/core/study';
import { Errored, For, Loading, Show } from '@solidjs/web';
import { Option } from 'effect';
import { createEffect, createSignal, onSettled, type Accessor } from 'solid-js';

import { useStrongsStudy, useVerseStudy } from '../runtime/index.js';
import { Button, Dialog, Tabs } from '../ui/index.js';
import {
  NARROW_BREAKPOINT_QUERY,
  presentationClass,
  presentationFor,
  shouldFocusOnOpen,
  verseKey,
  wordActive,
  wordTargetLabel,
  wordTargets,
  type PanePresentation,
} from './study-pane-state.js';

/** Which presentation the current viewport calls for, kept in step with it.
 *
 *  `matchMedia` over `NARROW_BREAKPOINT_QUERY` — the exact query text the
 *  stylesheet's split rule uses, rem and all — so the JS decision and the CSS
 *  cannot disagree about where narrow starts. Reading `matches` rather than
 *  comparing `innerWidth` to a pixel number is what makes that true at a root
 *  font size other than 16px, where `60rem` is not 960px and the two used to
 *  disagree in exactly the direction that produces the bug.
 *
 *  A listener rather than a one-shot read, because a desktop window is resized
 *  across the breakpoint and a pane that stayed a rail at 500px would be the
 *  original bug at a different moment.
 *
 *  `onSettled` is where the subscription goes: the query is a browser API, and
 *  the reading shell already uses that hook for exactly this reason — to keep a
 *  document-level listener out of the render pass and to get its teardown from
 *  the returned function. */
export const usePanePresentation = (): Accessor<PanePresentation> => {
  const [presentation, setPresentation] = createSignal<PanePresentation>(
    presentationFor(window.matchMedia(NARROW_BREAKPOINT_QUERY).matches),
  );
  onSettled(() => {
    const query = window.matchMedia(NARROW_BREAKPOINT_QUERY);
    const sync = (): void => {
      setPresentation(presentationFor(query.matches));
    };
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  });
  return presentation;
};

export interface VerseStudyPaneProps {
  readonly book: BookNumber;
  readonly chapter: ChapterNumber;
  readonly verse: VerseNumber;
  /** The reference as it reads, for the pane's accessible name. */
  readonly label: string;
  /** How the pane is laid out at the current viewport: a rail beside the
   *  Scripture, or a full-width sheet over it. Narrow gets the sheet, because
   *  the block-flow default put the pane below the whole chapter and a verse tap
   *  changed the route with nothing visible happening. */
  readonly presentation: PanePresentation;
  /** Puts the study tools away and returns to the chapter. */
  readonly onClose: () => void;
}

const compactFailure = (cause: unknown): string => {
  let message = String(cause);
  if (cause instanceof Error) message = cause.message;
  return message.replace(/\s+/g, ' ').trim();
};

/** The path a cross-reference or a concordance hit navigates to. A whole-chapter
 *  target has no verse segment, which is exactly the route the codec decodes as
 *  a `chapter` reference. */
const versePath = (book: number, chapter: number, verse: Option.Option<number>): string => {
  const base = `/bible/${String(book)}/${String(chapter)}`;
  return Option.match(verse, {
    onNone: () => base,
    onSome: (target) => `${base}/${String(target)}`,
  });
};

const crossReferencePath = (reference: StudyCrossReference): string =>
  versePath(reference.book, reference.chapter, reference.verse);

const concordancePath = (entry: ConcordanceEntry): string =>
  `/bible/${String(entry.reference.book)}/${String(entry.reference.chapter)}/${String(
    entry.reference.verse,
  )}`;

/** How many of a section's items there are, for the tab label. A count in the
 *  label is what lets a reader see a section is empty without opening it — and
 *  §8.4 makes empty the common case for parallel writings. */
const count = (value: number): string => ` ${String(value)}`;

// ---------------------------------------------------------------------------
// Words — the Strong's tap targets
// ---------------------------------------------------------------------------

interface WordsProps {
  readonly words: readonly StudyWord[];
  readonly onSelect: (number: StrongsNumber) => void;
  readonly selected: Option.Option<StrongsNumber>;
}

/** `aria-pressed` as ARIA spells it.
 *
 *  ARIA's own values are the strings `'true'` and `'false'`, which is what Solid
 *  types the attribute as — a boolean would be a different attribute state. So
 *  the two-case result is returned as the enumerated string rather than computed
 *  as a boolean and converted at the call site. */
const pressed = (state: boolean): 'true' | 'false' => {
  if (state) return 'true';
  return 'false';
};

/** The `data-italic` marker, present only on the KJV's supplied words.
 *
 *  An attribute whose *presence* carries the meaning, so the absent case has to
 *  be `undefined` rather than `''` — an empty string would still render the
 *  attribute and italicise every word. `Option.getOrUndefined` is how the rest
 *  of this file spells that same "omit the attribute" idea. */
const italicMarker = (word: StudyWord) => {
  let marker = Option.none<''>();
  if (word.italic) marker = Option.some('');
  return Option.getOrUndefined(marker);
};

/** The same presence-carries-the-meaning attribute, for the word whose lexicon
 *  entry is currently open. */
const activeMarker = (active: boolean) => {
  let marker = Option.none<''>();
  if (active) marker = Option.some('');
  return Option.getOrUndefined(marker);
};

/** The BCP 47 tag for a lexicon lemma, so a screen reader pronounces it and the
 *  browser picks a font that has the script.
 *
 *  A total record over the two-member union rather than a branch: adding a third
 *  language to `StrongsLanguage` would fail to typecheck here, which is the
 *  reminder a fallback branch would swallow. */
const LEMMA_LANGUAGE = { hebrew: 'he', greek: 'grc' } satisfies Record<StrongsLanguage, string>;

const lemmaLanguage = (language: StrongsLanguage): string => LEMMA_LANGUAGE[language];

/** The verse's words, with one tappable chip per Strong's number behind each.
 *
 *  **One chip per number, not one per word.** `StudyWord.strongs` is an array
 *  because the KJV's word-to-lexeme alignment is many-to-many, and 16,162 rows
 *  in the shipped `verse_words` table carry more than one number. A single
 *  button that opened `strongs[0]` made every number after the first
 *  unreachable — the reader saw a tap target, tapped it, and got the wrong entry
 *  with nothing on screen saying the others existed. `wordTargets` turns the
 *  array into the list of choices it always was.
 *
 *  A `<button>` per chip rather than a span with a click handler, deliberately:
 *  it is focusable, it responds to Enter and Space without a keydown handler, it
 *  announces itself as actionable, and it is a native touch target. The three
 *  input modes the milestone requires — keyboard, pointer, touch — are the
 *  element's own behavior rather than three code paths.
 *
 *  Words with no Strong's number render as plain text: they are not tap targets,
 *  and making them focusable would put punctuation and the KJV's supplied words
 *  into the tab order for nothing. */
const StudyWords = (props: WordsProps) => (
  <p class="bible-study-pane__words">
    <For each={props.words}>
      {(word) => (
        <>
          <Show
            when={word.strongs.length > 0}
            fallback={<span data-italic={italicMarker(word)}>{word.text}</span>}
          >
            <span
              class="bible-study-word-group"
              data-active={activeMarker(wordActive(word, props.selected))}
            >
              <span class="bible-study-word-group__text" data-italic={italicMarker(word)}>
                {word.text}
              </span>
              <For each={wordTargets(word, props.selected)}>
                {(target) => (
                  <button
                    type="button"
                    class="bible-study-word"
                    aria-pressed={pressed(target.selected)}
                    aria-label={wordTargetLabel(word, target)}
                    onClick={() => props.onSelect(target.number)}
                  >
                    {target.label}
                  </button>
                )}
              </For>
            </span>
          </Show>{' '}
        </>
      )}
    </For>
  </p>
);

// ---------------------------------------------------------------------------
// Strong's drill-down
// ---------------------------------------------------------------------------

interface StrongsViewProps {
  readonly number: StrongsNumber;
  readonly onDismiss: () => void;
}

/** The lexicon entry and its reverse concordance.
 *
 *  Its own component so its suspense is its own: opening a word must not
 *  re-suspend the five sections that are already on screen, and a boundary
 *  around the whole pane would do exactly that. */
const StrongsView = (props: StrongsViewProps) => {
  const study = useStrongsStudy(() => ({ number: props.number }));
  return (
    <section class="bible-study-strongs" aria-label={`Strong's ${props.number}`}>
      <div class="bible-study-strongs__header">
        <h3>{props.number}</h3>
        <Button onClick={props.onDismiss}>Close</Button>
      </div>
      <Errored
        fallback={(error) => (
          <p class="bible-form-status bible-form-status--error" role="alert">
            {compactFailure(error())}
          </p>
        )}
      >
        <Loading
          fallback={
            <p class="bible-form-status" role="status">
              Opening lexicon…
            </p>
          }
        >
          <Show
            when={Option.getOrUndefined(study().entry)}
            fallback={<p class="bible-study-empty">No lexicon entry for this number.</p>}
          >
            {(entry) => (
              <dl class="bible-study-lexicon">
                {/* The lemma is a required string in the wire model but is
                    empty for roughly half the rows in the shipped Strong's
                    table — a defect in the artifact's ingestion, upstream of
                    this milestone. Rendering an empty `<dd>` would show the
                    reader a blank row and a `lang` attribute over nothing, so
                    the row is omitted exactly as the optional fields below are
                    when they are absent. */}
                <Show when={entry().lemma.length > 0}>
                  <dt>Lemma</dt>
                  <dd lang={lemmaLanguage(entry().language)}>{entry().lemma}</dd>
                </Show>
                <Show when={Option.getOrUndefined(entry().transliteration)}>
                  {(value) => (
                    <>
                      <dt>Transliteration</dt>
                      <dd>{value()}</dd>
                    </>
                  )}
                </Show>
                <Show when={Option.getOrUndefined(entry().pronunciation)}>
                  {(value) => (
                    <>
                      <dt>Pronunciation</dt>
                      <dd>{value()}</dd>
                    </>
                  )}
                </Show>
                <dt>Definition</dt>
                <dd>{entry().definition}</dd>
                <Show when={Option.getOrUndefined(entry().kjvDefinition)}>
                  {(value) => (
                    <>
                      <dt>KJV usage</dt>
                      <dd>{value()}</dd>
                    </>
                  )}
                </Show>
              </dl>
            )}
          </Show>
          <h4 class="bible-study-strongs__concordance">
            Occurrences
            <span>
              {study().occurrences.length} of {study().total}
            </span>
          </h4>
          <ul class="bible-study-list">
            <For each={study().occurrences}>
              {(occurrence) => (
                <li>
                  <a href={concordancePath(occurrence)}>{occurrence.label}</a>
                  <span>{occurrence.text}</span>
                </li>
              )}
            </For>
          </ul>
          {/* The cap is a fact the pane states rather than hides: `total`
              exceeding what is shown is exactly what a reader needs to know
              before concluding a word appears only this often. */}
          <Show when={study().total > study().occurrences.length}>
            <p class="bible-study-empty">
              Showing the first {study().occurrences.length} of {study().total} occurrences.
            </p>
          </Show>
        </Loading>
      </Errored>
    </section>
  );
};

// ---------------------------------------------------------------------------
// The pane
// ---------------------------------------------------------------------------

/** The five sections and the word-tap drill-down.
 *
 *  Split out from `VerseStudyPane` so the `<Loading>` boundary sits *above* the
 *  component that reads — a boundary and its suspending read in the same
 *  component body would never show the fallback. */
const StudyBody = (props: VerseStudyPaneProps) => {
  const study = useVerseStudy(() => ({
    book: props.book,
    chapter: props.chapter,
    verse: props.verse,
  }));
  /** Which word the reader tapped, as pane-local state.
   *
   *  Deliberately *not* in the route. The pane's own open/verse state is the
   *  route — `/bible/:book/:chapter/:verse` is what opens this pane, and it
   *  survives navigation, reload and back/forward on both hosts because it is
   *  the reader's existing model. The Strong's selection is transient
   *  drill-down *within* an already-addressed pane, the same class of state as
   *  the tab `AnnotationTools` keeps in `Tabs`, and putting it in the URL would
   *  mean extending `AppRoute` and its codec for something a reader never
   *  bookmarks. */
  const [selected, setSelected] = createSignal(Option.none<StrongsNumber>());

  /** Clears the selection whenever the pane moves to a different verse.
   *
   *  Keyed on the verse address rather than on the new verse's contents. The
   *  retired rule hid the selection only when the new verse's words did *not*
   *  contain the number, which let a stale entry stay open whenever they did —
   *  and they often do: H8064 (*shamayim*) occurs in 420 verses, so selecting it
   *  on Genesis 1:1 and moving to Genesis 1:8 left the lexicon panel open on a
   *  word the reader never tapped here. `createEffect` over the key is Solid 2's
   *  own spelling of "when this changes, do that", and the key changes on every
   *  navigation regardless of what the verses share. */
  createEffect(
    () => verseKey({ book: props.book, chapter: props.chapter, verse: props.verse }),
    () => {
      setSelected(Option.none());
    },
  );

  return (
    <>
      <StudyWords
        words={study().words}
        selected={selected()}
        onSelect={(number) => setSelected(Option.some(number))}
      />
      <Show when={Option.getOrUndefined(selected())}>
        {(number) => <StrongsView number={number()} onDismiss={() => setSelected(Option.none())} />}
      </Show>
      <Tabs
        label={`Study of ${props.label}`}
        defaultValue="cross-references"
        items={[
          {
            id: 'cross-references',
            label: `Cross-references${count(study().crossRefs.length)}`,
            content: () => (
              <section aria-label="Cross-references">
                <Show
                  when={study().crossRefs.length > 0}
                  fallback={<p class="bible-study-empty">No cross-references for this verse.</p>}
                >
                  <ul class="bible-study-list">
                    <For each={study().crossRefs}>
                      {(reference) => (
                        <li>
                          <a href={crossReferencePath(reference)}>{reference.label}</a>
                          <Show when={Option.getOrUndefined(reference.preview)}>
                            {(preview) => <span>{preview()}</span>}
                          </Show>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </section>
            ),
          },
          {
            id: 'margin-notes',
            label: `Margin notes${count(study().marginNotes.length)}`,
            content: () => (
              <section aria-label="Margin notes">
                <Show
                  when={study().marginNotes.length > 0}
                  fallback={<p class="bible-study-empty">No marginal notes for this verse.</p>}
                >
                  <dl class="bible-study-notes">
                    <For each={study().marginNotes}>
                      {(note) => (
                        <>
                          <dt>{note.phrase}</dt>
                          <dd>
                            {note.text} <em>{note.kind}</em>
                          </dd>
                        </>
                      )}
                    </For>
                  </dl>
                </Show>
              </section>
            ),
          },
          {
            id: 'commentary',
            label: `Commentary${count(study().commentary.length)}`,
            content: () => (
              <section aria-label="Bible Commentary">
                <Show
                  when={study().commentary.length > 0}
                  fallback={
                    <p class="bible-study-empty">No Bible Commentary entry keyed to this verse.</p>
                  }
                >
                  <ul class="bible-study-passages">
                    <For each={study().commentary}>
                      {(entry) => (
                        <li>
                          <p class="bible-study-passages__source">
                            {entry.refcode} · {entry.bookTitle}
                          </p>
                          <p>{entry.content}</p>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </section>
            ),
          },
          {
            id: 'writings',
            label: `Writings${count(study().parallelWritings.length)}`,
            content: () => (
              <section aria-label="Parallel writings">
                <Show
                  when={study().parallelWritings.length > 0}
                  fallback={
                    // §8.4: bible-ref rows are markup-dependent and cover a
                    // minority of the library, so an empty list is the common
                    // case and reads as a known gap, not as a failure.
                    <p class="bible-study-empty">
                      No writings in this library cite this verse directly.
                    </p>
                  }
                >
                  <ul class="bible-study-passages">
                    <For each={study().parallelWritings}>
                      {(entry) => (
                        <li>
                          <p class="bible-study-passages__source">
                            {entry.refcode} · {entry.bookTitle}
                          </p>
                          <p>{entry.content}</p>
                        </li>
                      )}
                    </For>
                  </ul>
                  <Show when={study().parallelWritingsTotal > study().parallelWritings.length}>
                    <p class="bible-study-empty">
                      Showing {study().parallelWritings.length} of {study().parallelWritingsTotal}{' '}
                      citations.
                    </p>
                  </Show>
                </Show>
              </section>
            ),
          },
        ]}
      />
    </>
  );
};

/** Everything inside the pane's frame, at either presentation.
 *
 *  Split out so the two presentations wrap *one* subtree rather than each
 *  restating the bar, the close control and the two boundaries — which is what
 *  keeps "narrow and wide are two presentations" from becoming "narrow and wide
 *  are two panes". */
const PaneContents = (props: VerseStudyPaneProps) => (
  <>
    <div class="bible-study-pane__bar">
      <h2 class="bible-study-pane__heading">{props.label}</h2>
      {/* The close control §8 shipped without. Back works and a deep link
          opens, but neither is a way to *put the tools away* — and narrow,
          where the pane covers the reader, there was no way at all. */}
      <Button
        class="bible-study-pane__close"
        aria-label={`Close study tools for ${props.label}`}
        onClick={props.onClose}
      >
        Close
      </Button>
    </div>
    <Errored
      fallback={(error) => (
        <p class="bible-form-status bible-form-status--error" role="alert">
          {compactFailure(error())}
        </p>
      )}
    >
      <Loading
        fallback={
          <p class="bible-form-status" role="status">
            Opening study tools…
          </p>
        }
      >
        <StudyBody {...props} />
      </Loading>
    </Errored>
  </>
);

/** The pane, at whichever presentation the viewport calls for.
 *
 *  **Narrow is a real modal, through the app's own `Dialog`.** It used to be an
 *  `<aside>` carrying `role="dialog"` and `aria-modal="true"` by hand, with a
 *  `tabindex="-1"` root it focused on open and an Escape handler — and none of
 *  the three things those attributes *promise*. Tab walked out of the sheet into
 *  the chapter it was covering; closing left focus on the document body rather
 *  than on the verse the reader had tapped; and the page behind it scrolled
 *  under the reader's finger. `ui/dialog.tsx` had all three already: a focus
 *  trap over the panel's focusables, a restore to whatever had focus before, a
 *  body `overflow: hidden` for as long as it is open, and a stack so a nested
 *  modal's Escape does not close its parent too. Composing it rather than
 *  reimplementing it is what makes the promise the ARIA attributes make true —
 *  and `surface="sheet"` is the one thing the pane needed that the palette did
 *  not, because the chrome differs and the mechanics do not.
 *
 *  **Wide is not a dialog and must not claim to be.** The rail sits beside the
 *  Scripture in a resizable split; the reader can see both. Giving it
 *  `role="dialog"` would tell a screen reader the whole reading view was behind
 *  a modal that is in fact a column next to it, and trapping focus in it would
 *  make the chapter unreachable by keyboard. So the rail stays an `<aside>` with
 *  a plain accessible name, and `shouldFocusOnOpen` — false for the rail — is
 *  the same distinction stated as data. */
export const VerseStudyPane = (props: VerseStudyPaneProps) => (
  <Show
    when={shouldFocusOnOpen(props.presentation)}
    fallback={
      <aside
        class={presentationClass(props.presentation)}
        data-presentation={props.presentation}
        aria-label={`Study tools for ${props.label}`}
      >
        <PaneContents {...props} />
      </aside>
    }
  >
    <Dialog
      open
      surface="sheet"
      title={`Study tools for ${props.label}`}
      onOpenChange={(open) => {
        // The dialog's own dismissals — Escape, and a pointer down on the
        // backdrop — arrive here, and both mean the same thing the close
        // control means. Opening is not this component's to decide: the pane is
        // mounted by the route, so the only transition it can be told about is
        // the one to closed.
        if (open) return;
        props.onClose();
      }}
    >
      <div class={presentationClass(props.presentation)} data-presentation={props.presentation}>
        <PaneContents {...props} />
      </div>
    </Dialog>
  </Show>
);
