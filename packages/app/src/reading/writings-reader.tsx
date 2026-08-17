import type {
  Page,
  PageReference,
  ParagraphReference,
  PublicationReference,
} from '@bible/core/writings';
import { useNavigate } from '@solidjs/router';
import { Errored, For, Loading, Show } from '@solidjs/web';
import { Effect, Option } from 'effect';
import { createMemo, createSignal } from 'solid-js';

import { AnnotationTools } from '../library/annotation-tools.js';
import { failureCategory } from '@bible/core/observability';
import {
  useWikiDictionary,
  useWritingsDownload,
  useWritingsLibrary,
  useWritingsPage,
  useWritingsParagraph,
  useWritingsPublication,
  type WritingsLibraryCommand,
} from '../runtime/index.js';
import { Button, ScrollViewport } from '../ui/index.js';
import { ParagraphNodes, type ParagraphOverlay } from './paragraph-nodes.js';
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
import {
  buildWritingsPlan,
  paragraphPlan,
  usePhraseSource,
  writingsPageKey,
  writingsParagraphKey,
  type WritingsParagraphInput,
  type WritingsPlan,
} from './match-plan.js';
import { ReaderFailure, ReaderLoading } from './bible-reader.js';
import { noContext, SelectionLookupPanel, useSelectionLookup } from './selection-lookup.js';
import { writingsDownloadLabel } from './writings-download-label.js';

export interface WritingsPageReaderProps {
  readonly reference: PageReference;
  readonly selected?: ParagraphReference;
}

const activeParagraph = (selected: Option.Option<ParagraphReference>, paragraphId: string) => {
  let marker = Option.none<''>();
  if (Option.isSome(selected) && selected.value.paragraphId === paragraphId) {
    marker = Option.some('');
  }
  return Option.getOrUndefined(marker);
};

const compactFailure = (cause: unknown): string => {
  let message = String(cause);
  if (cause instanceof Error) message = cause.message;
  return message.replace(/\s+/g, ' ').trim();
};

const downloadAction = (status: string, failedTarget: Option.Option<string>, code: string) => {
  if (status === 'failed' || Option.contains(failedTarget, code)) return 'Retry';
  return 'Download';
};

/** The wiki phrase overlay for one writings surface (§4.5, §4.6).
 *
 *  §4.5's table makes the section for EGW text "the chapter or reading unit **as
 *  rendered**", which on this surface is the page — so one `SectionMatchState`
 *  per rendered page, spent in one pass over every paragraph in it, and a fresh
 *  one when the reader turns the page.
 *
 *  A **plan**, not a matcher. The previous version handed `ParagraphNodes` a
 *  live `matchNodes` call in a JSX prop; Solid compiles that prop into a getter,
 *  so the first read claimed every phrase's §4.5 slot and every later read
 *  returned nothing. See `match-plan.ts`.
 *
 *  Shared by the three writings readers rather than written out three times:
 *  they render the same paragraphs through the same `ParagraphNodes`, and a peek
 *  state that behaved differently on the paragraph route than on the page route
 *  would be a difference no reader could explain. */
const useWritingsPhrases = (input: {
  readonly sectionKey: () => string;
  readonly paragraphs: () => readonly WritingsParagraphInput[];
}) => {
  const navigate = useNavigate();
  const source = usePhraseSource(useWikiDictionary());
  const plan = createMemo(() =>
    buildWritingsPlan({
      key: input.sectionKey(),
      source: source(),
      paragraphs: input.paragraphs(),
    }),
  );
  const [peeked, setPeeked] = createSignal(noPeek);

  /** A new plan closes the card — same rule as `bible-reader.tsx`, and for the
   *  same reason: occurrence ids are positions inside one plan, so a plan that
   *  has been replaced can no longer vouch for an id that was minted under the
   *  old one. Turning the page is the visible case; a dictionary refresh under
   *  the same page is the one keying on `plan().key` missed. */
  dismissOnPlanChange(plan, setPeeked);

  const onPhrase = (tap: Peeked): void => {
    const outcome = phraseTap(peeked(), tap);
    if (outcome._tag === 'navigate') {
      setPeeked(dismissPeek());
      navigate(topicPath(outcome.slug));
      return;
    }
    setPeeked(outcome.state);
  };

  return {
    plan: (): WritingsPlan => plan(),
    peeked,
    dismiss: () => setPeeked(dismissPeek()),
    onPhrase,
    open: (crumb: { readonly slug: string }) => {
      setPeeked(dismissPeek());
      navigate(topicPath(crumb.slug));
    },
    peekedOccurrence: (): Option.Option<PhraseOccurrenceId> =>
      Option.map(peeked(), (current) => current.occurrence),
  };
};

/** The overlay one paragraph hands `ParagraphNodes`: a pure lookup into the
 *  page's plan. Built here rather than inline at the two call sites, so the page
 *  route and the paragraph route cannot supply it differently. */
const paragraphOverlay = (input: {
  readonly phrases: ReturnType<typeof useWritingsPhrases>;
  readonly paragraphId: string;
}): Option.Option<ParagraphOverlay> =>
  Option.some({
    plan: paragraphPlan(input.phrases.plan(), input.paragraphId),
    peeked: input.phrases.peekedOccurrence(),
    onPhrase: input.phrases.onPhrase,
  });

/** The card, mounted once per surface. See `bible-reader.tsx` for why one and
 *  not one per phrase. */
const WritingsPeek = (props: { readonly phrases: ReturnType<typeof useWritingsPhrases> }) => (
  <Show when={Option.getOrUndefined(props.phrases.peeked())}>
    {(current) => (
      <PeekCard
        slug={current().slug}
        phrase={current().phrase}
        onDismiss={props.phrases.dismiss}
        onOpen={props.phrases.open}
      />
    )}
  </Show>
);

export const WritingsPageReader = (props: WritingsPageReaderProps) => {
  const page = useWritingsPage(() => props.reference);

  return <WritingsPageContent page={page} selected={props.selected} />;
};

export const WritingsPublicationReader = (props: { readonly reference: PublicationReference }) => {
  const page = useWritingsPublication(() => props.reference);

  return <WritingsPageContent page={page} />;
};

const WritingsPageContent = (props: {
  readonly page: () => Page;
  readonly selected?: ParagraphReference;
}) => {
  const page = props.page;
  /** §7's "any text selection can be looked up on demand", on this surface too.
   *  `noContext` because no verse holds writings prose — the Strong's group is
   *  empty here and the other four answer. */
  const lookup = useSelectionLookup();
  const phrases = useWritingsPhrases({
    sectionKey: () =>
      writingsPageKey({
        publicationId: Number(page().publication.id),
        page: Number(page().reference.page),
      }),
    paragraphs: () =>
      page().paragraphs.map((paragraph) => ({
        paragraphId: paragraph.reference.paragraphId,
        nodes: paragraph.nodes,
      })),
  });

  return (
    <article
      class="bible-reader bible-writings-reader"
      // §5's "tapping elsewhere dismisses", on the whole reading surface — see
      // `bible-reader.tsx` for why this is the article and not the prose block
      // it used to be, and not the document.
      onClick={(event) => {
        const target = event.target;
        if (target instanceof Element && !dismissesPeek(target)) return;
        phrases.dismiss();
      }}
    >
      <Errored fallback={(error) => <ReaderFailure error={error()} />}>
        <Loading fallback={<ReaderLoading label="Opening page" />}>
          <header class="bible-reader__heading">
            <p class="bible-reader__eyebrow">{page().publication.author}</p>
            <h1>{Option.getOrElse(page().heading, () => page().publication.title)}</h1>
            <p class="bible-reader__folio">
              {page().publication.code} · page {page().reference.page}
            </p>
          </header>
          <ScrollViewport
            label={`${page().publication.title}, page ${String(page().reference.page)}`}
          >
            <div
              class="bible-prose"
              // The gesture is the selection itself (§7). `mouseup` ends a drag
              // and `keyup` ends a shift-arrow selection, the same pair the
              // Bible reader listens for and through the same builder.
              onMouseUp={() => lookup.select(noContext)}
              onKeyUp={() => lookup.select(noContext)}
            >
              <For each={page().paragraphs}>
                {(paragraph) => (
                  <p
                    id={`paragraph-${paragraph.reference.paragraphId}`}
                    data-active={activeParagraph(
                      Option.fromNullishOr(props.selected),
                      paragraph.reference.paragraphId,
                    )}
                  >
                    <ParagraphNodes
                      nodes={paragraph.nodes}
                      phrases={paragraphOverlay({
                        phrases,
                        paragraphId: paragraph.reference.paragraphId,
                      })}
                    />
                    <Show when={Option.getOrUndefined(paragraph.refcode)}>
                      {(refcode) => <span class="bible-refcode">{refcode()}</span>}
                    </Show>
                  </p>
                )}
              </For>
            </div>
            <WritingsPeek phrases={phrases} />
          </ScrollViewport>
          <SelectionLookupPanel lookup={lookup} />
          <AnnotationTools
            location={{
              source: 'egw',
              resourceId: String(page().publication.id),
              location: `/writings/${String(page().publication.id)}/page/${String(page().reference.page)}`,
            }}
            label={`${page().publication.code} ${String(page().reference.page)}`}
          />
          <nav class="bible-reader__pagination" aria-label="Page navigation">
            <Show when={Option.getOrUndefined(page().previous)}>
              {(previous) => (
                <a
                  href={`/writings/${String(previous().publicationId)}/page/${String(previous().page)}`}
                >
                  Previous page
                </a>
              )}
            </Show>
            <Show when={Option.getOrUndefined(page().next)}>
              {(next) => (
                <a href={`/writings/${String(next().publicationId)}/page/${String(next().page)}`}>
                  Next page
                </a>
              )}
            </Show>
          </nav>
        </Loading>
      </Errored>
    </article>
  );
};

export const WritingsParagraphReader = (props: { readonly reference: ParagraphReference }) => {
  const paragraph = useWritingsParagraph(() => props.reference);
  /** §7's selection lookup, as on the page route. */
  const lookup = useSelectionLookup();
  // One paragraph is the whole rendered reading unit here, so it is the §4.5
  // section — the same rule the page route applies, at the size this route
  // renders, through the same planner.
  //
  // Keyed by **publication and paragraph** — see `writingsParagraphKey` for why
  // the paragraph id alone was not an identity.
  const phrases = useWritingsPhrases({
    sectionKey: () =>
      writingsParagraphKey({
        publicationId: Number(props.reference.publicationId),
        paragraphId: props.reference.paragraphId,
      }),
    paragraphs: () => [
      {
        paragraphId: paragraph().reference.paragraphId,
        nodes: paragraph().nodes,
      },
    ],
  });

  return (
    <article
      class="bible-reader bible-writings-reader"
      // As the page route above: the whole reading surface is "elsewhere".
      onClick={(event) => {
        const target = event.target;
        if (target instanceof Element && !dismissesPeek(target)) return;
        phrases.dismiss();
      }}
    >
      <Errored fallback={(error) => <ReaderFailure error={error()} />}>
        <Loading fallback={<ReaderLoading label="Locating paragraph" />}>
          <header class="bible-reader__heading">
            <p class="bible-reader__eyebrow">Writings</p>
            <h1>{Option.getOrElse(paragraph().refcode, () => paragraph().publicationCode)}</h1>
          </header>
          <div
            class="bible-prose"
            onMouseUp={() => lookup.select(noContext)}
            onKeyUp={() => lookup.select(noContext)}
          >
            <p>
              <ParagraphNodes
                nodes={paragraph().nodes}
                phrases={paragraphOverlay({
                  phrases,
                  paragraphId: paragraph().reference.paragraphId,
                })}
              />
              <Show when={Option.getOrUndefined(paragraph().refcode)}>
                {(refcode) => <span class="bible-refcode">{refcode()}</span>}
              </Show>
            </p>
          </div>
          <WritingsPeek phrases={phrases} />
          <SelectionLookupPanel lookup={lookup} />
          <AnnotationTools
            location={{
              source: 'egw',
              resourceId: String(paragraph().reference.publicationId),
              location: `/writings/${String(paragraph().reference.publicationId)}/p/${encodeURIComponent(paragraph().reference.paragraphId)}`,
            }}
            label={Option.getOrElse(paragraph().refcode, () => paragraph().publicationCode)}
          />
        </Loading>
      </Errored>
    </article>
  );
};

export const WritingsCatalog = () => {
  const library = useWritingsLibrary();
  const startDownload = useWritingsDownload();
  const [downloading, setDownloading] = createSignal(Option.none<string>());
  const [failedTarget, setFailedTarget] = createSignal(Option.none<string>());
  const [failure, setFailure] = createSignal(Option.none<string>());

  const download = (command: WritingsLibraryCommand, key: string) => {
    setDownloading(Option.some(key));
    setFailedTarget(Option.none());
    setFailure(Option.none());
    void startDownload(command).then(
      () => setDownloading(Option.none()),
      (cause: unknown) => {
        const message = compactFailure(cause);
        Effect.runFork(
          Effect.logError(
            `[writings] download-failed target=${key} category=${failureCategory(cause)}`,
          ),
        );
        setFailure(Option.some(message));
        setFailedTarget(Option.some(key));
        setDownloading(Option.none());
      },
    );
  };
  return (
    <article class="bible-library">
      <header class="bible-reader__heading">
        <p class="bible-reader__eyebrow">Library</p>
        <h1>Writings</h1>
        <p>Keep the books you read available on this device.</p>
      </header>
      <Errored fallback={(error) => <ReaderFailure error={error()} />}>
        <Loading fallback={<ReaderLoading label="Opening library" />}>
          <Show when={library().some((publication) => publication.status !== 'success')}>
            <div class="bible-library__actions">
              <Button
                disabled={Option.isSome(downloading())}
                onClick={() => download({ _tag: 'DownloadAll' }, 'all')}
              >
                Download all
              </Button>
            </div>
          </Show>
          <ul class="bible-library__list">
            <For each={library()}>
              {(publication) => (
                <li>
                  <div>
                    <Show
                      when={publication.status === 'success'}
                      fallback={<strong>{publication.title}</strong>}
                    >
                      <a href={`/writings/${String(publication.id)}`}>{publication.title}</a>
                    </Show>
                    <small>
                      {publication.code} · {publication.paragraphCount.toLocaleString()} paragraphs
                    </small>
                    <Show when={publication.error}>
                      {(error) => <span role="status">Download failed: {error()}</span>}
                    </Show>
                  </div>
                  <Show when={publication.status !== 'success'}>
                    <Button
                      aria-label={writingsDownloadLabel(
                        downloadAction(publication.status, failedTarget(), publication.code),
                        publication.title,
                        publication.code,
                      )}
                      disabled={Option.isSome(downloading())}
                      onClick={() =>
                        download(
                          { _tag: 'DownloadPublication', publicationId: publication.id },
                          publication.code,
                        )
                      }
                    >
                      {downloadAction(publication.status, failedTarget(), publication.code)}
                    </Button>
                  </Show>
                </li>
              )}
            </For>
          </ul>
          <Show when={Option.isSome(downloading())}>
            <p class="bible-form-status" role="status">
              Downloading…
            </p>
          </Show>
          <Show when={Option.getOrUndefined(failure())}>
            {(message) => (
              <p class="bible-form-status bible-form-status--error" role="alert">
                {message()}
              </p>
            )}
          </Show>
        </Loading>
      </Errored>
    </article>
  );
};
