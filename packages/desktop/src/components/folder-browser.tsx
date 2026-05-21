import { type Schemas } from '@bible/core/egw';
import { Effect, Fiber, Option, Result, Stream, SubscriptionRef } from 'effect';
import {
  type Component,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from 'solid-js';
import { runtime } from '../runtime.js';
import { EGWData } from '../services/egw-data.js';
import { Prefetcher, type PrefetchStatus } from '../services/prefetcher.js';
import { ReaderState } from '../services/reader-state.js';

// Folder browser — used as the no-book landing canvas AND as the Library
// drawer body when a book is open. Renders a breadcrumb plus the current
// level's subfolders and books.
//
// EGW exposes folders as a recursive tree per language. We fetch the whole
// tree once (cheap, monolithic response, cached) and walk it client-side as
// the user drills in. Books at each level come from /content/books/by_folder
// (also cached per (folder_id, lang)).

const DEFAULT_LANG = 'en';
const idleStatus: PrefetchStatus = { _tag: 'Idle' };

/* Folder card subtitle. Folders at upper levels of the EGW tree hold zero
   books and only subfolders — "0 books" is meaningless there, so fall back
   to the subfolder count instead. */
const folderMeta = (folder: Schemas.Folder): string => {
  if (folder.nbooks > 0) {
    return `${String(folder.nbooks)} ${folder.nbooks === 1 ? 'book' : 'books'}`;
  }
  const childCount = folder.children?.length ?? 0;
  if (childCount > 0) {
    return `${String(childCount)} ${childCount === 1 ? 'folder' : 'folders'}`;
  }
  return '0 books';
};

export interface FolderBrowserProps {
  /**
   * Called when the user opens a book. Parent decides what to do with it —
   * landing-canvas usage just opens the reader; drawer usage also closes
   * both drawers.
   */
  readonly onPickBook: (bookId: number) => void;
}

interface CrumbNode {
  readonly id: number;
  readonly name: string;
  readonly children: ReadonlyArray<Schemas.Folder>;
}

// Walk the folder tree following a path of ids, accumulating crumbs.
// Returns null if the path can't be resolved (e.g. tree changed since the
// path was captured).
const resolvePath = (
  tree: ReadonlyArray<Schemas.Folder>,
  path: ReadonlyArray<number>,
): ReadonlyArray<CrumbNode> | null => {
  const crumbs: CrumbNode[] = [];
  let level: ReadonlyArray<Schemas.Folder> = tree;
  for (const id of path) {
    const found = level.find((f) => f.folder_id === id);
    if (found === undefined) return null;
    const children = found.children ?? [];
    crumbs.push({ id, name: found.name, children });
    level = children;
  }
  return crumbs;
};

export const FolderBrowser: Component<FolderBrowserProps> = (props) => {
  // Path of folder ids from root. Empty = root level (top-level folders only).
  const [path, setPath] = createSignal<ReadonlyArray<number>>([]);

  const [tree] = createResource(() =>
    runtime.runPromise(
      Effect.gen(function* () {
        const data = yield* EGWData;
        return yield* data.listFolders(DEFAULT_LANG);
      }).pipe(Effect.result),
    ),
  );

  // Subfolders to render at the current level.
  const currentLevel = createMemo(
    (): {
      readonly folders: ReadonlyArray<Schemas.Folder>;
      readonly currentFolderId: number | null;
      readonly crumbs: ReadonlyArray<CrumbNode>;
    } => {
      const t = tree();
      if (t === undefined || Result.isFailure(t)) {
        return { folders: [], currentFolderId: null, crumbs: [] };
      }
      const p = path();
      if (p.length === 0) {
        return { folders: t.success, currentFolderId: null, crumbs: [] };
      }
      const crumbs = resolvePath(t.success, p);
      if (crumbs === null) {
        // Path stale (tree changed) — reset to root.
        setPath([]);
        return { folders: t.success, currentFolderId: null, crumbs: [] };
      }
      const last = crumbs[crumbs.length - 1] ?? null;
      return {
        folders: last?.children ?? [],
        currentFolderId: last?.id ?? null,
        crumbs,
      };
    },
  );

  // Books at the current folder (only when drilled in — root shows folders
  // only, not the union of every book).
  const [books] = createResource(
    () => currentLevel().currentFolderId,
    (folderId) =>
      runtime.runPromise(
        Effect.gen(function* () {
          const data = yield* EGWData;
          return yield* data.listBooksByFolder(folderId, DEFAULT_LANG);
        }).pipe(Effect.result),
      ),
  );

  // --- Download badges (mirrors LibraryRail) ------------------------------
  const [status, setStatus] = createSignal<PrefetchStatus>(idleStatus);
  type DownloadCount = { readonly cached: number; readonly expected: number };
  const [downloadStates, setDownloadStates] = createSignal<ReadonlyMap<number, DownloadCount>>(
    new Map(),
  );

  const refreshDownloadState = (bookId: number) => {
    void runtime
      .runPromise(
        Effect.gen(function* () {
          const data = yield* EGWData;
          return yield* data.getDownloadState(bookId);
        }).pipe(Effect.result),
      )
      .then((res) => {
        if (Result.isFailure(res)) return;
        const state = res.success;
        setDownloadStates((prev) => {
          const next = new Map(prev);
          if (Option.isNone(state)) next.delete(bookId);
          else next.set(bookId, state.value);
          return next;
        });
      });
  };

  createEffect(() => {
    const res = books();
    if (res === undefined || Result.isFailure(res)) return;
    for (const book of res.success) refreshDownloadState(book.book_id);
  });

  onMount(() => {
    const fiber = runtime.runFork(
      Effect.gen(function* () {
        const prefetcher = yield* Prefetcher;
        yield* SubscriptionRef.changes(prefetcher.status).pipe(
          Stream.runForEach((s) =>
            Effect.sync(() => {
              setStatus(s);
              if (s._tag === 'Done' && s.mode === 'download') refreshDownloadState(s.bookId);
            }),
          ),
        );
      }),
    );
    onCleanup(() => {
      void runtime.runPromise(Fiber.interrupt(fiber));
    });
  });

  const downloadBook = (bookId: number) => {
    void runtime.runPromise(
      Effect.gen(function* () {
        const prefetcher = yield* Prefetcher;
        yield* prefetcher.download(bookId);
      }).pipe(Effect.result),
    );
  };

  const downloadFor = (bookId: number) => {
    const s = status();
    if (s._tag === 'Running' && s.mode === 'download' && s.bookId === bookId) {
      return { running: true, percent: s.total === 0 ? 0 : (s.completed / s.total) * 100 };
    }
    if (s._tag === 'Done' && s.mode === 'download' && s.bookId === bookId) {
      return { running: false, percent: 100, done: true };
    }
    return null;
  };

  const anyDownloadRunning = () => {
    const s = status();
    return s._tag === 'Running' && s.mode === 'download';
  };

  const isFullyDownloaded = (bookId: number) => {
    const state = downloadStates().get(bookId);
    return state !== undefined && state.expected > 0 && state.cached >= state.expected;
  };

  // --- Navigation ---------------------------------------------------------
  const goRoot = () => setPath([]);
  const goCrumb = (depth: number) => setPath((p) => p.slice(0, depth + 1));
  const drillInto = (folderId: number) => setPath((p) => [...p, folderId]);
  const goUp = () => setPath((p) => p.slice(0, -1));

  const openBook = (bookId: number) => {
    // Hand off to ReaderState first, then notify parent (drawer close etc).
    void runtime.runPromise(
      Effect.gen(function* () {
        const state = yield* ReaderState;
        yield* state.openBook(bookId);
      }),
    );
    props.onPickBook(bookId);
  };

  return (
    // Base layout: padding 24px 32px 48px, gap 20px. Two layout contexts use
    // [.landing_&]: and [.drawer_&]: arbitrary variants to override padding/
    // max-width/gap when this component is mounted inside .landing or .drawer
    // (set by app.tsx). The arbitrary variants generate more specific
    // selectors than the base utilities, so they win regardless of source order.
    <div class="flex flex-col min-h-full pt-6 px-8 pb-12 gap-5 [.landing_&]:max-w-[1080px] [.landing_&]:mx-auto [.landing_&]:w-full [.landing_&]:pt-10 [.landing_&]:px-8 [.landing_&]:pb-20 [.drawer_&]:pt-4 [.drawer_&]:px-4 [.drawer_&]:pb-8 [.drawer_&]:gap-[14px]">
      <nav class="flex flex-wrap items-center gap-1 text-ui-base" aria-label="Folder breadcrumb">
        <button
          type="button"
          class="bg-transparent border-none px-1.5 py-1 rounded text-ui-base text-muted cursor-pointer transition-[background,color] duration-[0.12s] ease-in-out hover:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)] hover:text-fg hover:outline-none focus-visible:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)] focus-visible:text-fg focus-visible:outline-none data-current:text-fg data-current:font-medium"
          data-current={currentLevel().crumbs.length === 0 ? '' : undefined}
          onClick={goRoot}
        >
          Library
        </button>
        <For each={currentLevel().crumbs}>
          {(crumb, idx) => (
            <>
              <span class="text-muted opacity-50 text-ui-sm" aria-hidden="true">
                /
              </span>
              <button
                type="button"
                class="bg-transparent border-none px-1.5 py-1 rounded text-ui-base text-muted cursor-pointer transition-[background,color] duration-[0.12s] ease-in-out hover:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)] hover:text-fg hover:outline-none focus-visible:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)] focus-visible:text-fg focus-visible:outline-none data-current:text-fg data-current:font-medium"
                data-current={idx() === currentLevel().crumbs.length - 1 ? '' : undefined}
                onClick={() => goCrumb(idx())}
              >
                {crumb.name}
              </button>
            </>
          )}
        </For>
      </nav>

      <Show when={tree.loading}>
        <p class="m-0 py-2 text-ui-base text-muted">Loading folders…</p>
      </Show>

      <Show when={tree()} keyed>
        {(res) => (
          <Show
            when={!Result.isFailure(res)}
            fallback={<p class="m-0 py-2 text-ui-base text-[#b3261e]">Failed to load folders.</p>}
          >
            <div class="flex flex-col gap-4">
              <Show when={path().length > 0}>
                <button
                  type="button"
                  class="self-start bg-transparent border border-rule rounded-md px-2.5 py-1 text-ui-sm text-fg cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)] hover:border-accent hover:outline-none focus-visible:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)] focus-visible:border-accent focus-visible:outline-none"
                  onClick={goUp}
                >
                  ← Back
                </button>
              </Show>

              <Show when={currentLevel().folders.length > 0}>
                <h3 class="m-0 text-ui-xs font-semibold tracking-[0.08em] uppercase text-muted">
                  Folders
                </h3>
                {/*
                  Folder grid: 180px min auto-fill columns in the landing context,
                  collapses to a single 1fr column inside the drawer (where
                  horizontal space is tight). Drawer override expressed via the
                  [.drawer_&]: arbitrary variant on grid-template-columns.
                */}
                <ul class="list-none m-0 p-0 grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2 [.drawer_&]:grid-cols-[1fr]">
                  <For each={currentLevel().folders}>
                    {(folder) => (
                      <li>
                        <button
                          type="button"
                          class="w-full text-left bg-transparent border border-rule rounded-lg px-3.5 py-3 flex flex-col gap-1 cursor-pointer text-fg transition-[background,border-color,transform] duration-[0.12s] ease-in-out hover:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)] hover:border-accent hover:outline-none focus-visible:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)] focus-visible:border-accent focus-visible:outline-none active:scale-[0.98]"
                          onClick={() => drillInto(folder.folder_id)}
                        >
                          <span class="text-ui-md font-medium">{folder.name}</span>
                          <span class="text-ui-xs text-muted">{folderMeta(folder)}</span>
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>

              <Show when={currentLevel().currentFolderId !== null}>
                <h3 class="m-0 text-ui-xs font-semibold tracking-[0.08em] uppercase text-muted">
                  Books
                </h3>
                <Show when={books.loading}>
                  <p class="m-0 py-2 text-ui-base text-muted">Loading books…</p>
                </Show>
                <Show when={books()} keyed>
                  {(bookRes) =>
                    Result.isFailure(bookRes) ? (
                      <p class="m-0 py-2 text-ui-base text-[#b3261e]">Failed to load books.</p>
                    ) : bookRes.success.length === 0 ? (
                      <p class="m-0 py-2 text-ui-base text-muted">No books in this folder.</p>
                    ) : (
                      <ul class="list-none m-0 p-0 flex flex-col">
                        <For each={bookRes.success}>
                          {(book) => {
                            const dl = () => downloadFor(book.book_id);
                            return (
                              <li class="relative grid grid-cols-[1fr_auto] items-stretch border-b border-rule last:border-b-0">
                                <button
                                  type="button"
                                  class="w-full text-left bg-transparent border-none px-3.5 py-3 flex flex-col gap-0.5 cursor-pointer text-fg border-l-2 border-l-transparent transition-[background,border-color] duration-[0.12s] ease-in-out hover:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)] hover:outline-none focus-visible:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)] focus-visible:outline-none"
                                  onClick={() => openBook(book.book_id)}
                                >
                                  <span class="text-ui-md leading-[1.3]">{book.title}</span>
                                  <span class="text-ui-xs text-muted">{book.author}</span>
                                </button>
                                <button
                                  type="button"
                                  class="bg-transparent border-none px-3 flex items-center justify-center min-w-[44px] text-muted cursor-pointer text-ui-xs [font-variant-numeric:tabular-nums] border-l border-l-transparent transition-[color,background] duration-[0.12s] ease-in-out enabled:hover:text-accent enabled:hover:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)] enabled:hover:outline-none enabled:focus-visible:text-accent enabled:focus-visible:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)] enabled:focus-visible:outline-none disabled:opacity-30 disabled:cursor-not-allowed data-downloaded:text-accent data-downloaded:text-ui-md"
                                  data-downloaded={isFullyDownloaded(book.book_id) ? '' : undefined}
                                  title={
                                    isFullyDownloaded(book.book_id)
                                      ? 'Downloaded — click to refresh'
                                      : 'Download for offline'
                                  }
                                  aria-label={`Download ${book.title}`}
                                  disabled={anyDownloadRunning() && dl() === null}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    downloadBook(book.book_id);
                                  }}
                                >
                                  <Show
                                    when={dl()}
                                    fallback={
                                      <Show
                                        when={isFullyDownloaded(book.book_id)}
                                        fallback={
                                          <svg
                                            viewBox="0 0 24 24"
                                            width="14"
                                            height="14"
                                            fill="none"
                                            stroke="currentColor"
                                            stroke-width="1.8"
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                          >
                                            <path d="M12 3v12" />
                                            <path d="M7 10l5 5 5-5" />
                                            <path d="M5 21h14" />
                                          </svg>
                                        }
                                      >
                                        ✓
                                      </Show>
                                    }
                                    keyed
                                  >
                                    {(d) => (
                                      <Show when={d.done} fallback={`${Math.round(d.percent)}%`}>
                                        ✓
                                      </Show>
                                    )}
                                  </Show>
                                </button>
                              </li>
                            );
                          }}
                        </For>
                      </ul>
                    )
                  }
                </Show>
              </Show>
            </div>
          </Show>
        )}
      </Show>
    </div>
  );
};
