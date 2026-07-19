import type { ChapterReference, VerseReference } from '@bible/core/bible';
import { A } from '@solidjs/router';
import { Errored, For, Loading, Show } from '@solidjs/web';
import { Option } from 'effect';

import { useReadingData } from '../runtime/index.js';
import { ScrollViewport } from '../ui/index.js';
import { AnnotationTools } from '../library/annotation-tools.js';

export interface BibleReaderProps {
  readonly reference: ChapterReference | VerseReference;
}

export const BibleReader = (props: BibleReaderProps) => {
  const data = useReadingData();
  const chapter = () =>
    data.bibleChapters.get({ book: props.reference.book, chapter: props.reference.chapter })();

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
          <ScrollViewport label={`${chapter().book.name} ${String(chapter().reference.chapter)}`}>
            <div class="bible-scripture" role="list">
              <For each={chapter().verses}>
                {(verse) => (
                  <p
                    id={`verse-${String(verse.reference.verse)}`}
                    role="listitem"
                    data-active={
                      props.reference._tag === 'verse' &&
                      props.reference.verse === verse.reference.verse
                        ? ''
                        : undefined
                    }
                  >
                    <A
                      class="bible-verse-number"
                      href={`/bible/${String(verse.reference.book)}/${String(verse.reference.chapter)}/${String(verse.reference.verse)}`}
                      aria-label={`Verse ${String(verse.reference.verse)}`}
                    >
                      {verse.reference.verse}
                    </A>
                    {verse.text}
                  </p>
                )}
              </For>
            </div>
          </ScrollViewport>
          <Show when={props.reference._tag === 'verse'}>
            <AnnotationTools
              location={{
                source: 'bible',
                resourceId: 'KJV',
                location: `/bible/${String(props.reference.book)}/${String(props.reference.chapter)}/${String(props.reference._tag === 'verse' ? props.reference.verse : 1)}`,
              }}
              label={`${chapter().book.name} ${String(props.reference.chapter)}:${String(props.reference._tag === 'verse' ? props.reference.verse : 1)}`}
            />
          </Show>
          <nav class="bible-reader__pagination" aria-label="Chapter navigation">
            <Show when={Option.getOrUndefined(chapter().previous)}>
              {(previous) => (
                <A href={`/bible/${String(previous().book)}/${String(previous().chapter)}`}>
                  Previous chapter
                </A>
              )}
            </Show>
            <Show when={Option.getOrUndefined(chapter().next)}>
              {(next) => (
                <A href={`/bible/${String(next().book)}/${String(next().chapter)}`}>Next chapter</A>
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

export const ReaderFailure = (props: { readonly error: unknown }) => (
  <div class="bible-reader-state bible-reader-state--error" role="alert">
    <strong>This passage could not be opened.</strong>
    <span>{props.error instanceof Error ? props.error.message : String(props.error)}</span>
  </div>
);
