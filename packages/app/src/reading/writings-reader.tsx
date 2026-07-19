import type {
  Page,
  PageReference,
  ParagraphReference,
  PublicationReference,
} from '@bible/core/writings';
import { A } from '@solidjs/router';
import { Errored, For, Loading, Show } from '@solidjs/web';
import { Option } from 'effect';

import { AnnotationTools } from '../library/annotation-tools.js';
import { useReadingData } from '../runtime/index.js';
import { ScrollViewport } from '../ui/index.js';
import { ParagraphNodes } from './paragraph-nodes.js';
import { ReaderFailure, ReaderLoading } from './bible-reader.js';

export interface WritingsPageReaderProps {
  readonly reference: PageReference;
  readonly selected?: ParagraphReference;
}

export const WritingsPageReader = (props: WritingsPageReaderProps) => {
  const data = useReadingData();
  const page = () => data.writingsPages.get(props.reference)();

  return <WritingsPageContent page={page} selected={props.selected} />;
};

export const WritingsPublicationReader = (props: { readonly reference: PublicationReference }) => {
  const data = useReadingData();
  const page = () => data.writingsPublications.get(props.reference)();

  return <WritingsPageContent page={page} />;
};

const WritingsPageContent = (props: {
  readonly page: () => Page;
  readonly selected?: ParagraphReference;
}) => {
  const page = props.page;

  return (
    <article class="bible-reader bible-writings-reader">
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
            <div class="bible-prose">
              <For each={page().paragraphs}>
                {(paragraph) => (
                  <p
                    id={`paragraph-${paragraph.reference.paragraphId}`}
                    data-active={
                      props.selected?.paragraphId === paragraph.reference.paragraphId
                        ? ''
                        : undefined
                    }
                  >
                    <ParagraphNodes nodes={paragraph.nodes} />
                    <Show when={Option.getOrUndefined(paragraph.refcode)}>
                      {(refcode) => <span class="bible-refcode">{refcode()}</span>}
                    </Show>
                  </p>
                )}
              </For>
            </div>
          </ScrollViewport>
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
                <A
                  href={`/writings/${String(previous().publicationId)}/page/${String(previous().page)}`}
                >
                  Previous page
                </A>
              )}
            </Show>
            <Show when={Option.getOrUndefined(page().next)}>
              {(next) => (
                <A href={`/writings/${String(next().publicationId)}/page/${String(next().page)}`}>
                  Next page
                </A>
              )}
            </Show>
          </nav>
        </Loading>
      </Errored>
    </article>
  );
};

export const WritingsParagraphReader = (props: { readonly reference: ParagraphReference }) => {
  const data = useReadingData();
  const paragraph = () => data.writingsParagraphs.get(props.reference)();

  return (
    <article class="bible-reader bible-writings-reader">
      <Errored fallback={(error) => <ReaderFailure error={error()} />}>
        <Loading fallback={<ReaderLoading label="Locating paragraph" />}>
          <header class="bible-reader__heading">
            <p class="bible-reader__eyebrow">Writings</p>
            <h1>{Option.getOrElse(paragraph().refcode, () => paragraph().publicationCode)}</h1>
          </header>
          <div class="bible-prose">
            <p>
              <ParagraphNodes nodes={paragraph().nodes} />
              <Show when={Option.getOrUndefined(paragraph().refcode)}>
                {(refcode) => <span class="bible-refcode">{refcode()}</span>}
              </Show>
            </p>
          </div>
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
  const data = useReadingData();
  const catalog = data.writingsCatalog.get();
  return (
    <article class="bible-library">
      <header class="bible-reader__heading">
        <p class="bible-reader__eyebrow">Library</p>
        <h1>Writings</h1>
        <p>Read quietly across the complete local collection.</p>
      </header>
      <Errored fallback={(error) => <ReaderFailure error={error()} />}>
        <Loading fallback={<ReaderLoading label="Opening library" />}>
          <ul class="bible-library__list">
            <For each={catalog()}>
              {(publication) => (
                <li>
                  <A href={`/writings/${String(publication.id)}`}>
                    <span>{publication.title}</span>
                    <small>{publication.code}</small>
                  </A>
                </li>
              )}
            </For>
          </ul>
        </Loading>
      </Errored>
    </article>
  );
};
