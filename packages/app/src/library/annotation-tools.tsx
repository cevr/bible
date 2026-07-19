import {
  LibraryEntityId,
  type LibraryCollection,
  type ReaderLocation,
} from '@bible/core/library-state';
import { NoteId, type LibraryMutationCommand } from '@bible/core/local-first';
import { A } from '@solidjs/router';
import { Errored, For, Loading, Show } from '@solidjs/web';
import { Schema } from 'effect';
import { createMemo, createSignal } from 'solid-js';

import { decodeRoute, readerLocationForRoute } from '../route/index.js';
import { useReadingData } from '../runtime/index.js';
import { Button, Input, Tabs } from '../ui/index.js';

export interface AnnotationToolsProps {
  readonly location: ReaderLocation;
  readonly label: string;
  readonly expanded?: boolean;
}

const entityId = (kind: string, location: ReaderLocation, suffix = '') =>
  Schema.decodeUnknownSync(LibraryEntityId)(
    `${kind}:${location.source}:${location.resourceId}:${location.location}${suffix}`,
  );

const noteId = (location: ReaderLocation) =>
  Schema.decodeUnknownSync(NoteId)(
    `note:${location.source}:${location.resourceId}:${location.location}`,
  );

const compactFailure = (cause: unknown): string =>
  (cause instanceof Error ? cause.message : String(cause)).replace(/\s+/g, ' ').trim();

export const AnnotationTools = (props: AnnotationToolsProps) => {
  const data = useReadingData();
  const annotations = () => data.annotations.get(props.location)();
  const collections = () => data.collections.get()();
  const [noteDraft, setNoteDraft] = createSignal<string>();
  const [referenceDraft, setReferenceDraft] = createSignal('');
  const [collectionName, setCollectionName] = createSignal('');
  const [selectedCollection, setSelectedCollection] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [failure, setFailure] = createSignal<string>();
  const bookmark = createMemo(() => annotations().bookmarks[0]);
  const note = createMemo(() => annotations().notes[0]);
  const marker = createMemo(() => annotations().markers[0]);
  const draft = () => noteDraft() ?? note()?.content ?? '';
  const annotationCount = () =>
    annotations().bookmarks.length +
    annotations().notes.length +
    annotations().markers.length +
    annotations().crossReferences.length;

  const mutate = (operation: string, command: LibraryMutationCommand, onSuccess?: () => void) => {
    setBusy(true);
    setFailure(undefined);
    void data.annotations.mutate(command).then(
      () => {
        setBusy(false);
        onSuccess?.();
      },
      (cause: unknown) => {
        const message = compactFailure(cause);
        console.error(`[annotations] mutation-failed operation=${operation} cause=${message}`);
        setFailure(message);
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
        { _tag: 'DeleteNote', noteId: Schema.decodeUnknownSync(NoteId)(current.id) },
        () => setNoteDraft(undefined),
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
      () => setNoteDraft(undefined),
    );
  };

  const addReference = (event: SubmitEvent) => {
    event.preventDefault();
    const route = decodeRoute(referenceDraft().trim());
    const target = route ? readerLocationForRoute(route) : undefined;
    if (!target) {
      setFailure('Enter a canonical Bible or Writings route.');
      return;
    }
    mutate(
      'save-reference',
      {
        _tag: 'SaveUserCrossReference',
        id: entityId('reference', props.location, `:${target.location}`),
        from: props.location,
        to: target,
        toEnd: null,
        kind: null,
        note: null,
      },
      () => setReferenceDraft(''),
    );
  };

  const createCollection = (event: SubmitEvent) => {
    event.preventDefault();
    const name = collectionName().trim();
    if (name.length === 0) return;
    const id = Schema.decodeUnknownSync(LibraryEntityId)(`collection:${name.toLowerCase()}`);
    setBusy(true);
    setFailure(undefined);
    void data.collections.mutate({ _tag: 'SaveCollection', id, name, description: null }).then(
      () => {
        setBusy(false);
        setCollectionName('');
        setSelectedCollection(id);
      },
      (cause: unknown) => {
        const message = compactFailure(cause);
        console.error(`[collections] mutation-failed operation=save cause=${message}`);
        setFailure(message);
        setBusy(false);
      },
    );
  };

  const addToCollection = () => {
    const currentBookmark = bookmark();
    const collection = collections().find((candidate) => candidate.id === selectedCollection());
    if (!currentBookmark || !collection) return;
    setBusy(true);
    setFailure(undefined);
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
          console.error(`[collections] mutation-failed operation=add-member cause=${message}`);
          setFailure(message);
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
                <Button aria-pressed={bookmark() ? 'true' : 'false'} onClick={toggleBookmark}>
                  {bookmark() ? 'Bookmarked' : 'Bookmark'}
                </Button>
                <Button aria-pressed={marker() ? 'true' : 'false'} onClick={toggleMarker}>
                  {marker() ? 'Highlighted' : 'Highlight'}
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
                          onInput={(event) => setNoteDraft(event.currentTarget.value)}
                        />
                        <Button type="submit" tone="accent" disabled={busy()}>
                          {draft().trim().length === 0 && note() ? 'Delete note' : 'Save note'}
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
                              <A href={reference.toLocation}>
                                {reference.toLocation}
                                <Show when={reference.toEndLocation}>
                                  {(end) => `–${end().split('/').at(-1)}`}
                                </Show>
                              </A>
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
              <Show when={failure()}>
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
