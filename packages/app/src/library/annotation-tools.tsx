import {
  LibraryEntityId,
  type LibraryCollection,
  type ReaderLocation,
} from '@bible/core/library-state';
import { NoteId, type LibraryMutationCommand } from '@bible/core/local-first';
import { Errored, For, Loading, Show } from '@solidjs/web';
import { Effect, Option, Schema } from 'effect';
import { createMemo, createSignal } from 'solid-js';

import { decodeRoute, readerLocationForRoute } from '../route/index.js';
import { failureCategory } from '@bible/core/observability';
import { useReadingData } from '../runtime/index.js';
import { Button, Input, Tabs } from '../ui/index.js';

export interface AnnotationToolsProps {
  readonly location: ReaderLocation;
  readonly label: string;
  readonly expanded?: boolean;
}

const entityId = (kind: string, location: ReaderLocation, suffix = '') =>
  Schema.decodeSync(LibraryEntityId)(
    `${kind}:${location.source}:${location.resourceId}:${location.location}${suffix}`,
  );

const noteId = (location: ReaderLocation) =>
  Schema.decodeSync(NoteId)(`note:${location.source}:${location.resourceId}:${location.location}`);

const compactFailure = (cause: unknown): string => {
  let message = String(cause);
  if (cause instanceof Error) message = cause.message;
  return message.replace(/\s+/g, ' ').trim();
};

export const AnnotationTools = (props: AnnotationToolsProps) => {
  const data = useReadingData();
  const annotations = () => data.annotations.get(props.location)();
  const collections = () => data.collections.get()();
  const [noteDraft, setNoteDraft] = createSignal(Option.none<string>());
  const [referenceDraft, setReferenceDraft] = createSignal('');
  const [collectionName, setCollectionName] = createSignal('');
  const [selectedCollection, setSelectedCollection] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [failure, setFailure] = createSignal(Option.none<string>());
  const bookmark = createMemo(() => annotations().bookmarks[0]);
  const note = createMemo(() => annotations().notes[0]);
  const marker = createMemo(() => annotations().markers[0]);
  const draft = () =>
    Option.getOrElse(
      Option.orElse(noteDraft(), () => Option.fromNullishOr(note()?.content)),
      () => '',
    );
  const annotationCount = () =>
    annotations().bookmarks.length +
    annotations().notes.length +
    annotations().markers.length +
    annotations().crossReferences.length;
  const hasBookmark = () => Option.isSome(Option.fromNullishOr(bookmark()));
  const hasMarker = () => Option.isSome(Option.fromNullishOr(marker()));
  const hasNote = () => Option.isSome(Option.fromNullishOr(note()));
  const bookmarkPressed = (): 'true' | 'false' => {
    if (hasBookmark()) return 'true';
    return 'false';
  };
  const bookmarkLabel = (): string => {
    if (hasBookmark()) return 'Bookmarked';
    return 'Bookmark';
  };
  const markerPressed = (): 'true' | 'false' => {
    if (hasMarker()) return 'true';
    return 'false';
  };
  const markerLabel = (): string => {
    if (hasMarker()) return 'Highlighted';
    return 'Highlight';
  };
  const noteAction = (): string => {
    if (draft().trim().length === 0 && hasNote()) return 'Delete note';
    return 'Save note';
  };

  const mutate = (operation: string, command: LibraryMutationCommand, onSuccess?: () => void) => {
    setBusy(true);
    setFailure(Option.none());
    void data.annotations.mutate(command).then(
      () => {
        setBusy(false);
        onSuccess?.();
      },
      (cause: unknown) => {
        const message = compactFailure(cause);
        Effect.runFork(
          Effect.logError(
            `[annotations] mutation-failed operation=${operation} category=${failureCategory(cause)}`,
          ),
        );
        setFailure(Option.some(message));
        setBusy(false);
      },
    );
  };

  const toggleBookmark = () => {
    const current = bookmark();
    if (current) {
      mutate('delete-bookmark', { _tag: 'DeleteBookmark', id: current.id });
      return;
    }
    mutate('save-bookmark', {
      _tag: 'SaveBookmark',
      id: entityId('bookmark', props.location),
      location: props.location,
      label: props.label,
    });
  };

  const toggleMarker = () => {
    const current = marker();
    if (current) {
      mutate('delete-marker', { _tag: 'DeleteMarker', id: current.id });
      return;
    }
    mutate('save-marker', {
      _tag: 'SaveMarker',
      id: entityId('marker', props.location),
      location: props.location,
      style: 'highlight',
      color: 'ochre',
    });
  };

  const saveNote = (event: SubmitEvent) => {
    event.preventDefault();
    const content = draft().trim();
    const current = note();
    if (content.length === 0 && current) {
      mutate(
        'delete-note',
        { _tag: 'DeleteNote', noteId: Schema.decodeSync(NoteId)(current.id) },
        () => setNoteDraft(Option.none()),
      );
      return;
    }
    if (content.length === 0) return;
    mutate(
      'save-note',
      {
        _tag: 'SaveNote',
        noteId: noteId(props.location),
        source: props.location.source,
        resourceId: props.location.resourceId,
        location: props.location.location,
        content,
      },
      () => setNoteDraft(Option.none()),
    );
  };

  const addReference = (event: SubmitEvent) => {
    event.preventDefault();
    const target = Option.flatMap(decodeRoute(referenceDraft().trim()), readerLocationForRoute);
    if (Option.isNone(target)) {
      setFailure(Option.some('Enter a canonical Bible or Writings route.'));
      return;
    }
    mutate(
      'save-reference',
      {
        _tag: 'SaveUserCrossReference',
        id: entityId('reference', props.location, `:${target.value.location}`),
        from: props.location,
        to: target.value,
        // The local-first wire schema models these absent fields as `null`;
        // produced through Option until core migrates the schema.
        toEnd: Option.getOrNull(Option.none()),
        kind: Option.getOrNull(Option.none()),
        note: Option.getOrNull(Option.none()),
      },
      () => setReferenceDraft(''),
    );
  };

  const createCollection = (event: SubmitEvent) => {
    event.preventDefault();
    const name = collectionName().trim();
    if (name.length === 0) return;
    const id = Schema.decodeSync(LibraryEntityId)(`collection:${name.toLowerCase()}`);
    setBusy(true);
    setFailure(Option.none());
    void data.collections
      .mutate({ _tag: 'SaveCollection', id, name, description: Option.getOrNull(Option.none()) })
      .then(
        () => {
          setBusy(false);
          setCollectionName('');
          setSelectedCollection(id);
        },
        (cause: unknown) => {
          const message = compactFailure(cause);
          Effect.runFork(
            Effect.logError(
              `[collections] mutation-failed operation=save category=${failureCategory(cause)}`,
            ),
          );
          setFailure(Option.some(message));
          setBusy(false);
        },
      );
  };

  const addToCollection = () => {
    const currentBookmark = bookmark();
    const collection = collections().find((candidate) => candidate.id === selectedCollection());
    if (!currentBookmark || !collection) return;
    setBusy(true);
    setFailure(Option.none());
    void data.collections
      .mutate({
        _tag: 'AddCollectionMember',
        collectionId: collection.id,
        memberId: currentBookmark.id,
        memberType: 'bookmark',
        position: collection.members.length,
      })
      .then(
        () => setBusy(false),
        (cause: unknown) => {
          const message = compactFailure(cause);
          Effect.runFork(
            Effect.logError(
              `[collections] mutation-failed operation=add-member category=${failureCategory(cause)}`,
            ),
          );
          setFailure(Option.some(message));
          setBusy(false);
        },
      );
  };

  return (
    <aside class="bible-annotation-tools" aria-label={`Study tools for ${props.label}`}>
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
          <details open={props.expanded}>
            <summary>
              <span>Study</span>
              <Show when={annotationCount() > 0}>
                <span>{annotationCount()}</span>
              </Show>
            </summary>
            <div class="bible-annotation-tools__body">
              <div class="bible-annotation-tools__actions">
                <Button aria-pressed={bookmarkPressed()} onClick={toggleBookmark}>
                  {bookmarkLabel()}
                </Button>
                <Button aria-pressed={markerPressed()} onClick={toggleMarker}>
                  {markerLabel()}
                </Button>
              </div>
              <Tabs
                label="Study tools"
                defaultValue="notes"
                items={[
                  {
                    id: 'notes',
                    label: 'Notes',
                    content: () => (
                      <form onSubmit={saveNote}>
                        <label for="annotation-note">Note</label>
                        <textarea
                          id="annotation-note"
                          value={draft()}
                          placeholder="Write what you notice…"
                          onInput={(event) => setNoteDraft(Option.some(event.currentTarget.value))}
                        />
                        <Button type="submit" tone="accent" disabled={busy()}>
                          {noteAction()}
                        </Button>
                      </form>
                    ),
                  },
                  {
                    id: 'references',
                    label: 'References',
                    content: () => (
                      <section aria-label="Your cross-references">
                        <For each={annotations().crossReferences}>
                          {(reference) => (
                            <div class="bible-annotation-reference">
                              <a href={reference.toLocation}>
                                {reference.toLocation}
                                <Show when={reference.toEndLocation}>
                                  {(end) => `–${end().split('/').at(-1)}`}
                                </Show>
                              </a>
                              <Show when={reference.note}>{(note) => <span>{note()}</span>}</Show>
                              <Button
                                aria-label={`Remove cross-reference to ${reference.toLocation}`}
                                onClick={() =>
                                  mutate('delete-reference', {
                                    _tag: 'DeleteUserCrossReference',
                                    id: reference.id,
                                  })
                                }
                              >
                                Remove
                              </Button>
                            </div>
                          )}
                        </For>
                        <form class="bible-inline-form" onSubmit={addReference}>
                          <Input
                            value={referenceDraft()}
                            placeholder="/bible/43/3/16"
                            aria-label="Canonical reading route"
                            onInput={(event) => setReferenceDraft(event.currentTarget.value)}
                          />
                          <Button type="submit" disabled={busy()}>
                            Add reference
                          </Button>
                        </form>
                      </section>
                    ),
                  },
                  {
                    id: 'collections',
                    label: 'Collections',
                    content: () => (
                      <section aria-label="Collections">
                        <form class="bible-inline-form" onSubmit={createCollection}>
                          <Input
                            value={collectionName()}
                            placeholder="Sabbath study"
                            aria-label="New collection name"
                            onInput={(event) => setCollectionName(event.currentTarget.value)}
                          />
                          <Button type="submit" disabled={busy()}>
                            Create
                          </Button>
                        </form>
                        <div class="bible-inline-form">
                          <select
                            aria-label="Collection"
                            value={selectedCollection()}
                            onChange={(event) => setSelectedCollection(event.currentTarget.value)}
                          >
                            <option value="">Choose a collection</option>
                            <For each={collections()}>
                              {(collection: LibraryCollection) => (
                                <option value={collection.id}>{collection.name}</option>
                              )}
                            </For>
                          </select>
                          <Button
                            disabled={busy() || !bookmark() || selectedCollection().length === 0}
                            onClick={addToCollection}
                          >
                            Add bookmark
                          </Button>
                        </div>
                        <Show when={!bookmark()}>
                          <p>Bookmark this location before adding it to a collection.</p>
                        </Show>
                      </section>
                    ),
                  },
                ]}
              />
              <Show when={busy()}>
                <p class="bible-form-status" role="status">
                  Saving…
                </p>
              </Show>
              <Show when={Option.getOrUndefined(failure())}>
                {(message) => (
                  <p class="bible-form-status bible-form-status--error" role="alert">
                    {message()}
                  </p>
                )}
              </Show>
            </div>
          </details>
        </Loading>
      </Errored>
    </aside>
  );
};
