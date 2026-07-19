import { parseBibleQuery } from '@bible/core/bible';
import { TopicId, type TopicReference } from '@bible/core/topics';
import { A, useNavigate } from '@solidjs/router';
import { Errored, For, Loading, Show } from '@solidjs/web';
import { Schema } from 'effect';
import { createMemo, createSignal } from 'solid-js';

import { ReaderFailure, ReaderLoading } from '../reading/index.js';
import { useReadingData } from '../runtime/index.js';
import { Button, Input } from '../ui/index.js';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export interface TopicsProps {
  readonly topicId?: string;
}

const bibleRouteFor = (reference: TopicReference): string | undefined => {
  const first = reference.osis[0];
  if (!first) return undefined;
  const match = first.match(/^([^.]+)\.(\d+)\.(\d+)/);
  const book = match?.[1];
  const chapter = match?.[2];
  const verse = match?.[3];
  if (!book || !chapter || !verse) return undefined;
  const parsed = parseBibleQuery(`${book} ${chapter}:${verse}`);
  if (parsed._tag !== 'single') return undefined;
  return `/bible/${String(parsed.ref.book)}/${String(parsed.ref.chapter)}/${String(parsed.ref.verse)}`;
};

export const Topics = (props: TopicsProps) => {
  const data = useReadingData();
  const navigate = useNavigate();
  const [draft, setDraft] = createSignal('');
  const [query, setQuery] = createSignal('');
  const [letter, setLetter] = createSignal('A');
  const listInput = createMemo(() => {
    const current = query().trim();
    return current.length > 0 ? { query: current } : { letter: letter() };
  });
  const topics = () => data.topics.get(listInput())();
  const topic = () => {
    const id = Schema.decodeUnknownSync(TopicId)(props.topicId ?? 'missing-topic');
    return data.topicDetails.get({ id })();
  };

  return (
    <article class="bible-library bible-topics">
      <header class="bible-reader__heading bible-library__heading">
        <p class="bible-reader__eyebrow">Nave’s Topical Bible</p>
        <h1>{props.topicId ? 'Topic' : 'Topical index'}</h1>
      </header>
      <Errored fallback={(error) => <ReaderFailure error={error()} />}>
        <Loading fallback={<ReaderLoading label="Opening topical index" />}>
          <Show
            when={props.topicId}
            fallback={
              <>
                <form
                  class="bible-search__form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setQuery(draft().trim());
                  }}
                >
                  <Input
                    value={draft()}
                    placeholder="Search topics…"
                    aria-label="Search topics"
                    onInput={(event) => setDraft(event.currentTarget.value)}
                  />
                  <Button type="submit" tone="accent">
                    Search
                  </Button>
                </form>
                <nav class="bible-topic-letters" aria-label="Topic initials">
                  <For each={LETTERS}>
                    {(initial) => (
                      <Button
                        aria-pressed={
                          query().length === 0 && letter() === initial ? 'true' : 'false'
                        }
                        onClick={() => {
                          setQuery('');
                          setDraft('');
                          setLetter(initial);
                        }}
                      >
                        {initial}
                      </Button>
                    )}
                  </For>
                </nav>
                <p class="bible-search__summary">
                  {topics().length} {topics().length === 1 ? 'topic' : 'topics'}
                </p>
                <ul class="bible-library-list">
                  <For each={topics()}>
                    {(item) => (
                      <li>
                        <A href={`/topics/${encodeURIComponent(item.id)}`}>
                          <strong>{item.name}</strong>
                          <Show when={item.alternativeNames[0]}>
                            {(alternative) => <span>{alternative()}</span>}
                          </Show>
                        </A>
                      </li>
                    )}
                  </For>
                </ul>
              </>
            }
          >
            <section class="bible-topic-detail" aria-labelledby="topic-title">
              <Button onClick={() => navigate('/topics')}>All topics</Button>
              <div>
                <Show when={topic().alternativeNames.length > 0}>
                  <p class="bible-reader__eyebrow">{topic().alternativeNames.join(' · ')}</p>
                </Show>
                <h2 id="topic-title">{topic().name}</h2>
              </div>
              <For each={topic().sections}>
                {(section) => (
                  <section>
                    <h3>{section.label}</h3>
                    <ul>
                      <For each={section.references}>
                        {(reference) => {
                          const href = bibleRouteFor(reference);
                          return (
                            <li>{href ? <A href={href}>{reference.raw}</A> : reference.raw}</li>
                          );
                        }}
                      </For>
                    </ul>
                  </section>
                )}
              </For>
            </section>
          </Show>
        </Loading>
      </Errored>
    </article>
  );
};
