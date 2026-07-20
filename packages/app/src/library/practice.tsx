import {
  LibraryEntityId,
  PracticeRating,
  type LibraryStateCommand,
  type MemoryVerse,
} from '@bible/core/library-state';
import { A, useNavigate } from '@solidjs/router';
import { Errored, For, Loading, Show } from '@solidjs/web';
import { DateTime, Effect, Schema } from 'effect';
import { createSignal } from 'solid-js';

import { ReaderFailure, ReaderLoading } from '../reading/index.js';
import { useCapabilities } from '../application/capabilities-context.js';
import { failureCategory, useReadingData } from '../runtime/index.js';
import { Button, Input } from '../ui/index.js';

export interface PracticeProps {
  readonly memoryVerseId?: string;
}

const ratingLabels = ['Again', 'Hard', 'Uncertain', 'Good', 'Easy', 'Known'] as const;

const intervalForRating = (rating: typeof PracticeRating.Type): number => {
  if (rating <= 1) return 1;
  if (rating === 2) return 2;
  if (rating === 3) return 4;
  if (rating === 4) return 7;
  return 14;
};

const failureMessage = (cause: unknown): string => {
  let message = String(cause);
  if (cause instanceof Error) message = cause.message;
  return message.replace(/\s+/g, ' ').trim();
};

const practiceHeading = (memoryVerseId: string | undefined): string => {
  if (memoryVerseId !== undefined) return 'Memory practice';
  return 'Practice';
};

const nextReviewLabel = (nextPracticeAt: string | null): string => {
  if (nextPracticeAt !== null) {
    return `Next review ${DateTime.format(DateTime.makeUnsafe(nextPracticeAt))}`;
  }
  return 'Ready to review';
};

const nextPracticeDate = (practicedAt: string, intervalDays: number): string => {
  const next = DateTime.add(DateTime.makeUnsafe(practicedAt), { days: intervalDays });
  return DateTime.formatIso(next);
};

const nowIso = (): string => DateTime.formatIso(Effect.runSync(DateTime.now));

export const Practice = (props: PracticeProps) => {
  const data = useReadingData();
  const capabilities = useCapabilities();
  const navigate = useNavigate();
  const practice = () => data.memoryPractice.get()();
  const selectedVerse = () => practice().verses.find((verse) => verse.id === props.memoryVerseId);
  const selectedHistory = () =>
    practice()
      .history.filter((record) => record.memoryVerseId === props.memoryVerseId)
      .toSorted((left, right) => right.practicedAt.localeCompare(left.practicedAt));
  const [resourceId, setResourceId] = createSignal('');
  const [location, setLocation] = createSignal('');
  const [prompt, setPrompt] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [failure, setFailure] = createSignal<string>();

  const mutate = (
    operation: 'save' | 'delete' | 'record',
    command: LibraryStateCommand,
    onSuccess?: () => void,
  ) => {
    setBusy(true);
    setFailure(undefined);
    void data.memoryPractice.mutate(command).then(
      () => {
        setBusy(false);
        onSuccess?.();
      },
      (cause: unknown) => {
        const message = failureMessage(cause);
        Effect.runFork(
          Effect.logError(
            `[practice] mutation-failed operation=${operation} category=${failureCategory(cause)}`,
          ),
        );
        setFailure(message);
        setBusy(false);
      },
    );
  };

  const addVerse = (event: SubmitEvent) => {
    event.preventDefault();
    const requestedResource = resourceId().trim();
    const requestedLocation = location().trim();
    if (requestedResource.length === 0 || requestedLocation.length === 0) return;
    const identity = capabilities.identity;
    if (identity === undefined) {
      setFailure('This platform cannot create memory verses because identity is unavailable.');
      return;
    }

    const id = Schema.decodeUnknownSync(LibraryEntityId)(identity.randomUuid());
    mutate(
      'save',
      {
        _tag: 'SaveMemoryVerse',
        id,
        resourceId: requestedResource,
        location: requestedLocation,
        prompt: prompt().trim() || null,
        nextPracticeAt: nowIso(),
        intervalDays: 0,
      },
      () => {
        setResourceId('');
        setLocation('');
        setPrompt('');
        navigate(`/practice/${encodeURIComponent(id)}`);
      },
    );
  };

  const removeVerse = (verse: MemoryVerse) =>
    mutate('delete', { _tag: 'DeleteMemoryVerse', id: verse.id }, () => navigate('/practice'));

  const recordPractice = (verse: MemoryVerse, ratingInput: number) => {
    const identity = capabilities.identity;
    if (identity === undefined) {
      setFailure('This platform cannot record practice because identity is unavailable.');
      return;
    }
    const rating = Schema.decodeUnknownSync(PracticeRating)(ratingInput);
    const practicedAt = nowIso();
    const intervalDays = intervalForRating(rating);
    mutate('record', {
      _tag: 'RecordMemoryPractice',
      id: Schema.decodeUnknownSync(LibraryEntityId)(identity.randomUuid()),
      memoryVerseId: verse.id,
      rating,
      practicedAt,
      nextPracticeAt: nextPracticeDate(practicedAt, intervalDays),
      intervalDays,
    });
  };

  return (
    <article class="bible-library bible-practice">
      <header class="bible-reader__heading bible-library__heading">
        <p class="bible-reader__eyebrow">Keep Scripture close</p>
        <h1>{practiceHeading(props.memoryVerseId)}</h1>
      </header>
      <Errored fallback={(error) => <ReaderFailure error={error()} />}>
        <Loading fallback={<ReaderLoading label="Loading memory practice" />}>
          <Show
            when={props.memoryVerseId}
            fallback={
              <>
                <Show
                  when={practice().verses.length > 0}
                  fallback={
                    <section class="bible-library__empty" aria-labelledby="practice-empty-title">
                      <p class="bible-reader__eyebrow">Begin with one verse</p>
                      <h2 id="practice-empty-title">Your practice list is empty</h2>
                      <p>Add a Bible verse below. Short, regular review is enough.</p>
                    </section>
                  }
                >
                  <section aria-labelledby="practice-list-title">
                    <h2 id="practice-list-title">Verses to remember</h2>
                    <ul class="bible-library-list">
                      <For each={practice().verses}>
                        {(verse) => (
                          <li>
                            <A href={`/practice/${encodeURIComponent(verse.id)}`}>
                              <strong>{verse.location}</strong>
                              <span>{nextReviewLabel(verse.nextPracticeAt)}</span>
                            </A>
                          </li>
                        )}
                      </For>
                    </ul>
                  </section>
                </Show>
                <PracticeForm
                  resourceId={resourceId()}
                  location={location()}
                  prompt={prompt()}
                  busy={busy()}
                  setResourceId={setResourceId}
                  setLocation={setLocation}
                  setPrompt={setPrompt}
                  submit={addVerse}
                />
              </>
            }
          >
            <Show
              when={selectedVerse()}
              fallback={
                <section class="bible-library__empty" role="status">
                  <p class="bible-reader__eyebrow">Verse not found</p>
                  <h2>This memory verse is no longer in your library.</h2>
                  <A href="/practice">Return to practice</A>
                </section>
              }
            >
              {(verse) => (
                <section class="bible-library-detail" aria-labelledby="memory-verse-title">
                  <A href="/practice">All memory verses</A>
                  <div>
                    <p class="bible-reader__eyebrow">Bible · {verse().resourceId}</p>
                    <h2 id="memory-verse-title">{verse().location}</h2>
                    <Show when={verse().prompt}>{(value) => <p>{value()}</p>}</Show>
                  </div>
                  <fieldset class="bible-practice-ratings" disabled={busy()}>
                    <legend>How clearly did you remember it?</legend>
                    <p>Ratings schedule the next review in 1, 1, 2, 4, 7, or 14 days.</p>
                    <div>
                      <For each={ratingLabels}>
                        {(label, index) => (
                          <Button onClick={() => recordPractice(verse(), index())}>
                            <span>{index()}</span> {label}
                          </Button>
                        )}
                      </For>
                    </div>
                  </fieldset>
                  <section aria-labelledby="practice-history-title">
                    <h3 id="practice-history-title">Recent practice</h3>
                    <Show
                      when={selectedHistory().length > 0}
                      fallback={<p>No reviews recorded yet.</p>}
                    >
                      <ol class="bible-practice-history">
                        <For each={selectedHistory()}>
                          {(record) => (
                            <li>
                              <time datetime={record.practicedAt}>
                                {DateTime.format(DateTime.makeUnsafe(record.practicedAt))}
                              </time>
                              <span>Rating {record.rating} of 5</span>
                            </li>
                          )}
                        </For>
                      </ol>
                    </Show>
                  </section>
                  <Button disabled={busy()} onClick={() => removeVerse(verse())}>
                    Delete memory verse
                  </Button>
                </section>
              )}
            </Show>
          </Show>
          <MutationStatus busy={busy()} failure={failure()} />
        </Loading>
      </Errored>
    </article>
  );
};

const PracticeForm = (props: {
  readonly resourceId: string;
  readonly location: string;
  readonly prompt: string;
  readonly busy: boolean;
  readonly setResourceId: (value: string) => void;
  readonly setLocation: (value: string) => void;
  readonly setPrompt: (value: string) => void;
  readonly submit: (event: SubmitEvent) => void;
}) => (
  <section class="bible-library-form" aria-labelledby="new-memory-verse-title">
    <p class="bible-reader__eyebrow">New memory verse</p>
    <h2 id="new-memory-verse-title">Add a verse</h2>
    <form onSubmit={props.submit}>
      <label>
        <span>Bible resource</span>
        <Input
          required
          value={props.resourceId}
          placeholder="KJV"
          onInput={(event) => props.setResourceId(event.currentTarget.value)}
        />
      </label>
      <label>
        <span>Location</span>
        <Input
          required
          value={props.location}
          placeholder="John 3:16"
          onInput={(event) => props.setLocation(event.currentTarget.value)}
        />
      </label>
      <label>
        <span>
          Prompt <small>(optional)</small>
        </span>
        <Input
          value={props.prompt}
          placeholder="For God so loved…"
          onInput={(event) => props.setPrompt(event.currentTarget.value)}
        />
      </label>
      <Button type="submit" tone="accent" disabled={props.busy}>
        Add verse
      </Button>
    </form>
  </section>
);

const MutationStatus = (props: { readonly busy: boolean; readonly failure?: string }) => (
  <>
    <Show when={props.busy}>
      <p class="bible-form-status" role="status">
        Saving…
      </p>
    </Show>
    <Show when={props.failure}>
      {(message) => (
        <p class="bible-form-status bible-form-status--error" role="alert">
          {message()}
        </p>
      )}
    </Show>
  </>
);
