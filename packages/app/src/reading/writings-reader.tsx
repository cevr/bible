import type {
  Page,
  PageReference,
  ParagraphReference,
  PublicationReference,
} from '@bible/core/writings';
import { A } from '@solidjs/router';
import { Errored, For, Loading, Show } from '@solidjs/web';
import { Option } from 'effect';
import { createSignal } from 'solid-js';

import { AnnotationTools } from '../library/annotation-tools.js';
import { failureCategory, useReadingData } from '../runtime/index.js';
import { writingsDownloadLabel } from '../runtime/writings-cache.js';
import { Button, ScrollViewport } from '../ui/index.js';
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
  const library = data.writingsLibrary.get();
  const [downloading, setDownloading] = createSignal<string>();
  const [failedTarget, setFailedTarget] = createSignal<string>();
  const [failure, setFailure] = createSignal<string>();

  const download = (command: Parameters<typeof data.writingsLibrary.mutate>[0], key: string) => {
    setDownloading(key);
    setFailedTarget(undefined);
    setFailure(undefined);
    void data.writingsLibrary.mutate(command).then(
      () => setDownloading(undefined),
      (cause: unknown) => {
        const message = (cause instanceof Error ? cause.message : String(cause))
          .replace(/\s+/g, ' ')
          .trim();
        console.error(
          `[writings] download-failed target=${key} category=${failureCategory(cause)}`,
        );
        setFailure(message);
        setFailedTarget(key);
        setDownloading(undefined);
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
                disabled={downloading() !== undefined}
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
                      <A href={`/writings/${String(publication.id)}`}>{publication.title}</A>
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
                        publication.status === 'failed' || failedTarget() === publication.code
                          ? 'Retry'
                          : 'Download',
                        publication.title,
                        publication.code,
                      )}
                      disabled={downloading() !== undefined}
                      onClick={() =>
                        download(
                          { _tag: 'DownloadPublication', publicationId: publication.id },
                          publication.code,
                        )
                      }
                    >
                      {publication.status === 'failed' || failedTarget() === publication.code
                        ? 'Retry'
                        : 'Download'}
                    </Button>
                  </Show>
                </li>
              )}
            </For>
          </ul>
          <Show when={downloading()}>
            <p class="bible-form-status" role="status">
              Downloading…
            </p>
          </Show>
          <Show when={failure()}>
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
