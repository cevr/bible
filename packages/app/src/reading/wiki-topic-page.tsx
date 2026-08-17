/** The composed topic page (§6.1), rendered.
 *
 *  Six sections, always all six, always in lineup order — the page model types
 *  the lineup as an exact tuple precisely so a client cannot render five, or
 *  reorder them, or find commentary where cross-references should be. This file
 *  therefore never asks *which* sections exist; it walks the tuple.
 *
 *  Two things it deliberately does not decide:
 *
 *  - **Which section arrives open.** §10's Milestone 6 makes it an acceptance
 *    criterion that the flag lives on the model and not in the UI, and it does:
 *    `openOnArrival` reads `section.defaultOpen` off the lineup, and nothing
 *    here names `key-verses` to decide a posture. Swap the model's flag and this
 *    page opens whatever the model says.
 *  - **What is capped, and in which order.** The composer capped and ordered
 *    everything before it crossed the wire, so `items` renders as given. A
 *    client re-sorting would be a fourth opinion about §6.1's table.
 */

import type {
  TopicSlug,
  WikiCommentaryEntry,
  WikiCrossReference,
  WikiMissingBook,
  WikiPassageRef,
  WikiRelatedTopic,
  WikiSearchHandoff,
  WikiSection,
  WikiSectionKind,
  WikiWritingsHit,
} from '@bible/core/wiki';
import { useNavigate } from '@solidjs/router';
import { Errored, For, Loading, Match, Show, Switch, type JSX } from '@solidjs/web';
import { Effect, Option } from 'effect';
import { createEffect, createMemo, createSignal } from 'solid-js';

import { failureCategory } from '@bible/core/observability';
import {
  useWikiDictionary,
  useWikiTopic,
  useWritingsDownload,
  useWritingsLibrary,
} from '../runtime/index.js';
import { Button } from '../ui/index.js';
import { ReaderFailure, ReaderLoading } from './bible-reader.js';
import { HotText } from './hot-text.js';
import {
  buildTextSectionPlan,
  textUnitSpans,
  useTopicPhraseSource,
  type PlannedSpan,
  type TextSectionPlan,
} from './match-plan.js';
import { PeekCard } from './peek-card.js';
import {
  dismissesPeek,
  dismissOnPlanChange,
  dismissPeek,
  noPeek,
  openOnArrival,
  phraseTap,
  sectionOpen,
  toggleSection,
  topicPath,
  type Peeked,
  type PhraseOccurrenceId,
} from './peek-state.js';
import { WikiBlocks } from './wiki-blocks.js';
import { sectionItems } from './wiki-section-items.js';
import { sectionTextUnits, textUnitId } from './wiki-section-text.js';
import { crumbFor, useWikiTrail, WikiTrail } from './wiki-trail.js';

/** The heading each section carries. In core's `WikiSectionKind` order, keyed by
 *  the kind rather than by position for the same reason the model keys on it:
 *  a page that legitimately omits nothing still must not be able to mislabel a
 *  section by shifting it. */
const SECTION_TITLES = {
  'key-verses': 'Key verses',
  'egw-statements': 'EGW statements',
  commentary: 'Commentary on the key verses',
  'pioneer-witnesses': 'Pioneer witnesses',
  'cross-references': 'Cross-references',
  'related-topics': 'Related topics',
} satisfies Readonly<Record<WikiSectionKind, string>>;

/** "3 of 12", or just "3" when the cap did not bite. `total > items.length` is
 *  exactly the condition §6.1's "show all" exists for, and the model carries
 *  both numbers so the client never has to guess whether it is seeing
 *  everything. */
const sectionCount = (section: WikiSection): string => {
  if (section.total > section.items.length) {
    return `${String(section.items.length)} of ${String(section.total)}`;
  }
  return String(section.items.length);
};

const versePath = (verse: {
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
}): string => `/bible/${String(verse.book)}/${String(verse.chapter)}/${String(verse.verse)}`;

/** How a section's item reaches the phrase overlay: the spans this section's own
 *  matcher pass decided for one unit, plus where a tap goes.
 *
 *  Passed down rather than read from a context, so a section that forgets it
 *  renders plain instead of silently sharing another section's §4.5 state. */
interface Overlay {
  readonly spans: (container: string) => readonly PlannedSpan[];
  readonly peeked: Option.Option<PhraseOccurrenceId>;
  readonly onPhrase: (tapped: Peeked) => void;
}

/** One piece of auto-mined prose on a topic page, with its phrases hot (§4.5's
 *  table: the topic page's layered sections are sections for the overlay). */
const MinedText = (props: {
  readonly overlay: Overlay;
  readonly container: string;
  readonly text: string;
}) => (
  <p>
    <HotText
      text={props.text}
      spans={props.overlay.spans(props.container)}
      peeked={props.overlay.peeked}
      onPhrase={props.overlay.onPhrase}
    />
  </p>
);

const KeyVerse = (props: {
  readonly passage: WikiPassageRef;
  readonly overlay: Overlay;
  readonly index: number;
}) => (
  <li class="bible-wiki-verse">
    <a href={versePath(props.passage.start)}>{props.passage.label}</a>
    <Show when={Option.getOrUndefined(props.passage.text)}>
      {(text) => (
        <MinedText
          overlay={props.overlay}
          container={textUnitId(props.index, 'text')}
          text={text()}
        />
      )}
    </Show>
  </li>
);

const WritingsHit = (props: {
  readonly hit: WikiWritingsHit;
  readonly overlay: Overlay;
  readonly index: number;
}) => (
  <li class="bible-wiki-hit">
    <p class="bible-refcode">
      {props.hit.refcode} · {props.hit.bookTitle}
    </p>
    <Show when={Option.getOrUndefined(props.hit.snippet)}>
      {(snippet) => (
        <MinedText
          overlay={props.overlay}
          container={textUnitId(props.index, 'snippet')}
          text={snippet()}
        />
      )}
    </Show>
  </li>
);

const CommentaryEntry = (props: {
  readonly entry: WikiCommentaryEntry;
  readonly overlay: Overlay;
  readonly index: number;
}) => (
  <li class="bible-wiki-hit">
    <p class="bible-refcode">
      {props.entry.verse.label} · {props.entry.refcode}
    </p>
    <MinedText
      overlay={props.overlay}
      container={textUnitId(props.index, 'content')}
      text={props.entry.content}
    />
  </li>
);

const CrossReference = (props: {
  readonly reference: WikiCrossReference;
  readonly overlay: Overlay;
  readonly index: number;
}) => (
  <li class="bible-wiki-verse">
    <a href={versePath(props.reference.to)}>{props.reference.to.label}</a>
    <Show when={Option.getOrUndefined(props.reference.preview)}>
      {(preview) => (
        <MinedText
          overlay={props.overlay}
          container={textUnitId(props.index, 'preview')}
          text={preview()}
        />
      )}
    </Show>
  </li>
);

/** §6.3: a cited book this library does not hold renders **refcode + book title
 *  + "get this book"** and no snippet.
 *
 *  Tapping fires the existing `v1.reading.writingsPublication.download` — except
 *  that a citation names a book by its *code*, not by the numeric publication id
 *  the procedure takes, and the model deliberately carries no id: the whole
 *  point of `not-installed` is that this host has no row for the book. So the
 *  affordance resolves the code against the combined library the download
 *  mutation already keys on. That resolution is the caller's, handed in here as
 *  `onGet`, because it needs the library read and this component is inside a
 *  section that must render whether or not that read has settled. */
const MissingBook = (props: {
  readonly book: WikiMissingBook;
  readonly onGet: (bookCode: string) => void;
  readonly busy: boolean;
}) => (
  <li class="bible-wiki-missing">
    <div>
      <p class="bible-refcode">{props.book.refcode}</p>
      <strong>{props.book.bookTitle}</strong>
      <small>{props.book.author}</small>
    </div>
    <Button
      disabled={props.busy}
      aria-label={`Get ${props.book.bookTitle} (${props.book.bookCode})`}
      onClick={() => props.onGet(props.book.bookCode)}
    >
      Get this book
    </Button>
  </li>
);

/** §6.2's handoff, rendered as the "search everywhere" affordance it describes.
 *
 *  The hybrid search UI is Milestone 8. Until it lands, the handoff links into
 *  **the search surface the app has today** (`/search`) with the topic's
 *  canonical phrase pre-filled — rather than being hidden, or rendered inert.
 *  Two reasons for the live link over an inert placeholder: the affordance's
 *  contract to the reader ("see everywhere this phrase appears") is one today's
 *  search already partly keeps, and a route that exists is a route a test can
 *  follow. The one thing today's search cannot honor is the handoff's *scope* —
 *  `/search` has no corpus-scope parameter — so the scope is rendered as text
 *  beside the link instead of silently dropped. Milestone 8 replaces the href
 *  and deletes the caption; nothing else here changes. */
const SearchHandoff = (props: { readonly handoff: WikiSearchHandoff }) => (
  <p class="bible-wiki-handoff">
    <a href={`/search?q=${encodeURIComponent(props.handoff.query)}`}>
      Search everywhere for “{props.handoff.query}”
    </a>
    <small>Scope: {props.handoff.scope}</small>
  </p>
);

const RelatedTopic = (props: {
  readonly topic: WikiRelatedTopic;
  readonly onOpen: (topic: WikiRelatedTopic) => void;
}) => (
  <li class="bible-wiki-related">
    <button
      type="button"
      data-topic={topicPath(String(props.topic.slug))}
      onClick={() => props.onOpen(props.topic)}
    >
      {props.topic.title}
    </button>
    <small>{props.topic.kind}</small>
  </li>
);

/** One collapsible section. `<details>` rather than a hand-rolled disclosure:
 *  the element is the platform's own, it is keyboard- and screen-reader-correct
 *  without a line of JS, and its `open` attribute is the exact fact
 *  `sectionOpen` computes. */
const Section = (props: {
  readonly section: WikiSection;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly children: JSX.Element;
}) => (
  <details
    class="bible-wiki-section"
    open={props.open}
    data-section={props.section._tag}
    onToggle={(event) => {
      // Only when the element's state actually differs from ours, so
      // programmatically setting `open` on a re-render does not bounce a toggle
      // back through the state that set it.
      if (event.currentTarget.open !== props.open) props.onToggle();
    }}
  >
    <summary>
      <span>{SECTION_TITLES[props.section._tag]}</span>
      <small>{sectionCount(props.section)}</small>
    </summary>
    {props.children}
  </details>
);

const compactFailure = (cause: unknown): string => {
  if (cause instanceof Error) return cause.message;
  return String(cause);
};

export interface WikiTopicPageProps {
  readonly slug: TopicSlug;
}

export const WikiTopicPage = (props: WikiTopicPageProps) => (
  <article class="bible-reader bible-wiki-page">
    <Errored fallback={(error) => <ReaderFailure error={error()} />}>
      <Loading fallback={<ReaderLoading label="Opening topic" />}>
        <TopicBody slug={props.slug} />
      </Loading>
    </Errored>
  </article>
);

const TopicBody = (props: WikiTopicPageProps) => {
  const page = useWikiTopic(() => ({ slug: props.slug }));
  const trail = useWikiTrail();
  const navigate = useNavigate();
  const startDownload = useWritingsDownload();
  /** The combined archive, which is where a citation's book *code* becomes the
   *  numeric publication id the download procedure takes. It carries the same
   *  `WRITINGS_LIBRARY_KEY` this page's own read does, so one download refreshes
   *  both — the section stops offering the book and starts showing its text with
   *  no bespoke wiring, which is §6.3's claim. */
  const library = useWritingsLibrary();
  const [downloading, setDownloading] = createSignal(Option.none<string>());
  const [failure, setFailure] = createSignal(Option.none<string>());

  // -------------------------------------------------------------------------
  // The phrase overlay on the auto-mined text (§4.5, §4.6)
  //
  // §4.5's table names **each layered section of the page** as its own section
  // for the first-occurrence rule, so there is one `SectionMatchState` per
  // section and not one per page: a phrase hot in "Key verses" is hot again in
  // "EGW statements", which is what makes the six sections read as six passages
  // rather than as one long one.
  //
  // The page's own slug is excluded from its own dictionary — **before** the
  // automaton is built, not after the matcher ran. §4 states no self-link rule
  // (§4.8's noise flags are an authoring decision and the composer does not
  // filter by destination), so this is the milestone's addition; `excluding` in
  // `match-plan.ts` records why the placement is the whole of it.
  // -------------------------------------------------------------------------
  const source = useTopicPhraseSource(useWikiDictionary(), () => String(page().slug));
  const plans = createMemo(() => {
    const own = String(page().slug);
    const built = new Map<WikiSectionKind, TextSectionPlan>();
    for (const section of page().sections) {
      built.set(
        section._tag,
        buildTextSectionPlan({
          key: `${own}/${section._tag}`,
          source: source(),
          units: sectionTextUnits(section),
        }),
      );
    }
    return built;
  });

  const [peeked, setPeeked] = createSignal(noPeek);

  /** A new set of plans closes the card, for the reason `bible-reader.tsx` gives:
   *  an occurrence id is a position inside the plan that minted it.
   *
   *  Arriving at a different topic is the obvious case and the slug alone would
   *  cover it. What it would not cover is §6.3's own seam: getting a book
   *  invalidates `WRITINGS_LIBRARY_KEY`, which is the key *this page's* read and
   *  the dictionary read both carry — so the sections recompose under the same
   *  slug, with new hits at the same addresses, while a card sits open over one
   *  of them. Keying on the plans value catches both. */
  dismissOnPlanChange(plans, setPeeked);

  const onPhrase = (tap: Peeked): void => {
    const outcome = phraseTap(peeked(), tap);
    if (outcome._tag === 'navigate') {
      setPeeked(dismissPeek());
      navigate(topicPath(outcome.slug));
      return;
    }
    setPeeked(outcome.state);
  };

  /** The overlay one section hands its items: a pure lookup into that section's
   *  own plan. Never a matcher — see `match-plan.ts`. */
  const overlayFor = (kind: WikiSectionKind): Overlay => ({
    spans: (container) =>
      Option.match(Option.fromNullishOr(plans().get(kind)), {
        onNone: (): readonly PlannedSpan[] => [],
        onSome: (plan) => textUnitSpans(plan, container),
      }),
    peeked: Option.map(peeked(), (current) => current.occurrence),
    onPhrase,
  });

  /** §5's arrival posture, straight off the model. */
  const arrival = createMemo(() => openOnArrival(page().sections));
  /** Which sections the reader has flipped *since* arrival — see `sectionOpen`
   *  for why the toggles are a delta rather than the open set. */
  const [toggled, setToggled] = createSignal<ReadonlySet<WikiSectionKind>>(
    new Set<WikiSectionKind>(),
  );

  /** Arriving is a breadcrumb hop. Recorded from the composed page's own title,
   *  so a crumb reached from a peek card carries the real title rather than the
   *  slug — and re-recorded on every arrival, which `enterTopic` makes
   *  idempotent for the page you are already on. The toggles reset with it: a
   *  new page arrives in *its* posture, not in the last page's. */
  createEffect(
    () => ({ slug: String(page().slug), title: page().title }),
    (identity) => {
      setToggled(new Set<WikiSectionKind>());
      Option.match(crumbFor(identity), { onNone: () => {}, onSome: trail.enter });
    },
  );

  const isOpen = (section: WikiSection): boolean =>
    sectionOpen({ kind: section._tag, arrival: arrival(), toggled: toggled() });

  const onToggle = (section: WikiSection): void => {
    setToggled((current) => toggleSection(current, section._tag));
  };

  /** §6.3's "get this book", resolved from the book code the citation carries to
   *  the publication id the download procedure takes. A code the archive does
   *  not list is a citation into a book nobody can install, which the button
   *  reports rather than silently no-oping. */
  const getBook = (bookCode: string): void => {
    setFailure(Option.none());
    const publication = Option.fromNullishOr(library().find((entry) => entry.code === bookCode));
    if (Option.isNone(publication)) {
      setFailure(Option.some(`${bookCode} is not in the archive.`));
      return;
    }
    setDownloading(Option.some(bookCode));
    void startDownload({
      _tag: 'DownloadPublication',
      publicationId: publication.value.id,
    }).then(
      () => setDownloading(Option.none()),
      (cause: unknown) => {
        Effect.runFork(
          Effect.logError(
            `[wiki] get-book-failed target=${bookCode} category=${failureCategory(cause)}`,
          ),
        );
        setFailure(Option.some(compactFailure(cause)));
        setDownloading(Option.none());
      },
    );
  };

  const missingBooks = (section: WikiSection): readonly WikiMissingBook[] => {
    if (section._tag !== 'egw-statements' && section._tag !== 'pioneer-witnesses') return [];
    return section.missingBooks;
  };

  const handoff = (section: WikiSection): Option.Option<WikiSearchHandoff> => {
    if (section._tag !== 'egw-statements' && section._tag !== 'pioneer-witnesses') {
      return Option.none();
    }
    return section.handoff;
  };

  /** A related topic is a hop. Through the router rather than a bare anchor so
   *  the desktop host's hash history and the web host's path history both work
   *  from one call, and so the arriving page records the crumb — which is what
   *  makes a related-topic tap feed the trail exactly as a peek-card
   *  click-through does. */
  const openRelated = (topic: WikiRelatedTopic): void => {
    navigate(topicPath(String(topic.slug)));
  };

  return (
    <div
      class="bible-wiki-body"
      // §5's "tapping elsewhere dismisses", on the whole topic surface — the
      // same rule and the same predicate the two reading surfaces use, so a tap
      // inside a phrase span (which re-peeks or navigates) and a tap inside the
      // card (which the reader is reaching for) are both excluded by
      // `dismissesPeek` rather than by where the elements happen to sit.
      onClick={(event) => {
        const target = event.target;
        if (target instanceof Element && !dismissesPeek(target)) return;
        setPeeked(dismissPeek());
      }}
    >
      <WikiTrail />
      <header class="bible-reader__heading">
        <p class="bible-reader__eyebrow">Topic · {page().status}</p>
        <h1>{page().title}</h1>
        <Show when={Option.getOrUndefined(page().unavailable)}>
          {(reason) => (
            <p class="bible-form-status" role="status">
              Authored pages unavailable: {reason()}
            </p>
          )}
        </Show>
      </header>
      <Show when={Option.getOrUndefined(page().core)}>
        {(core) => (
          <>
            <div class="bible-wiki-thesis">
              <WikiBlocks blocks={core().thesis} />
            </div>
            <div class="bible-prose">
              <WikiBlocks blocks={core().body} />
            </div>
          </>
        )}
      </Show>
      <Show when={Option.getOrUndefined(page().sectionsUnavailable)}>
        {(reason) => (
          <p class="bible-form-status" role="status">
            Sections unavailable: {reason()}
          </p>
        )}
      </Show>
      <div class="bible-wiki-sections">
        <For each={page().sections}>
          {(section) => (
            <Section section={section} open={isOpen(section)} onToggle={() => onToggle(section)}>
              {/* One list over `sectionItems`, not six per-section branches.
                  The projection is shared with `wiki-page-identity.test.ts`,
                  which walks all six sections of a fully populated page and
                  asserts the identities — a claim a `Match` branch per section
                  made untestable, because a deleted branch left every suite
                  green while the section rendered nothing. */}
              <ul>
                <For each={sectionItems(section)}>
                  {(item) => (
                    <Switch>
                      <Match when={item.kind === 'verse'}>
                        {() => {
                          if (item.kind !== 'verse') return <></>;
                          return (
                            <KeyVerse
                              passage={item.passage}
                              overlay={overlayFor(section._tag)}
                              index={item.index}
                            />
                          );
                        }}
                      </Match>
                      <Match when={item.kind === 'hit'}>
                        {() => {
                          if (item.kind !== 'hit') return <></>;
                          return (
                            <WritingsHit
                              hit={item.hit}
                              overlay={overlayFor(section._tag)}
                              index={item.index}
                            />
                          );
                        }}
                      </Match>
                      <Match when={item.kind === 'commentary'}>
                        {() => {
                          if (item.kind !== 'commentary') return <></>;
                          return (
                            <CommentaryEntry
                              entry={item.entry}
                              overlay={overlayFor(section._tag)}
                              index={item.index}
                            />
                          );
                        }}
                      </Match>
                      <Match when={item.kind === 'reference'}>
                        {() => {
                          if (item.kind !== 'reference') return <></>;
                          return (
                            <CrossReference
                              reference={item.reference}
                              overlay={overlayFor(section._tag)}
                              index={item.index}
                            />
                          );
                        }}
                      </Match>
                      <Match when={item.kind === 'related'}>
                        {() => {
                          if (item.kind !== 'related') return <></>;
                          return <RelatedTopic topic={item.topic} onOpen={openRelated} />;
                        }}
                      </Match>
                    </Switch>
                  )}
                </For>
              </ul>
              {/* §6.3's uninstalled books ride *beside* the ranked hits, never
                  inside them — the model carries them as section metadata for
                  exactly that reason, so the cap and `total` stay rank-only. */}
              <Show when={missingBooks(section).length > 0}>
                <ul class="bible-wiki-missing-list">
                  <For each={missingBooks(section)}>
                    {(book) => (
                      <MissingBook
                        book={book}
                        onGet={getBook}
                        busy={Option.isSome(downloading())}
                      />
                    )}
                  </For>
                </ul>
              </Show>
              <Show when={Option.getOrUndefined(handoff(section))}>
                {(descriptor) => <SearchHandoff handoff={descriptor()} />}
              </Show>
            </Section>
          )}
        </For>
      </div>
      {/* One card for the whole page, as the two reading surfaces mount one for
          the whole chapter or page: §5 allows exactly one peek at a time. */}
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
      <Show when={Option.getOrUndefined(failure())}>
        {(message) => (
          <p class="bible-form-status bible-form-status--error" role="alert">
            {message()}
          </p>
        )}
      </Show>
    </div>
  );
};
