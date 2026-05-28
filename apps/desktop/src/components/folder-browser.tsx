import { type Schemas } from '@bible/core/egw';
import { Effect, Fiber, Option, Stream, SubscriptionRef } from 'effect';
import {
  type Component,
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  Suspense,
} from 'solid-js';
import { ipc, runtime, signalFromStream } from '../runtime.js';
import { EGWData } from '../services/egw-data.js';
import { openBookAtFirstChapter } from '../services/open-book.js';
import { Prefetcher, type PrefetchStatus } from '../services/prefetcher.js';

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

type DownloadState =
  | { readonly _tag: 'idle' }
  | { readonly _tag: 'running'; readonly percent: number }
  | { readonly _tag: 'done' };

// Module-level memo of resolved book → folder-path chains. Hit on subsequent
// drawer opens for books we've seeded before in this session, so we skip the
// listBooks lookup + tree DFS. Doesn't survive app restart by design — the
// underlying sqlite caches do, and a stale chain just falls through resolvePath
// back to root.
const folderPathByBook = new Map<number, ReadonlyArray<number>>();

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
  /**
   * When set, the browser tries to seed its initial path to the folder
   * containing this book — so opening the library drawer for an open book
   * lands the user in context instead of dumping them at root. Resolves by
   * (1) reading `book.folder_id` from the cached `listBooks(lang)` result,
   * then (2) finding the folder's ancestor chain in the cached folder tree.
   * Best-effort: any failure (book not in `listBooks`, folder not in tree,
   * tree still loading) silently falls back to root.
   *
   * Only honored at mount — the user's subsequent navigation is theirs to
   * keep. We don't re-seed when the prop changes, so jumping between books
   * via search doesn't yank the drawer out from under them.
   */
  readonly initialBookId?: number | null;
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
    crumbs.push({ id, name: found.name, children: found.children ?? [] });
    level = found.children ?? [];
  }
  return crumbs;
};

// DFS for `folderId` in the tree. Returns the chain of folder ids from root
// down to (and including) the target, or null when the folder isn't in the
// tree. Used to seed the browser path when opening the drawer with a book
// already in view.
//
// Prefers `parent_id` when present — EGW's schema declares it optional and
// our real payloads omit it, but if the upstream API ever starts emitting
// it we'd rather hop straight up the chain than re-traverse from root for
// every level.
const findFolderPath = (
  tree: ReadonlyArray<Schemas.Folder>,
  folderId: number,
): ReadonlyArray<number> | null => {
  const direct = tryParentIdChain(tree, folderId);
  if (direct !== null) return direct;
  return dfsFolderPath(tree, folderId);
};

const dfsFolderPath = (
  tree: ReadonlyArray<Schemas.Folder>,
  folderId: number,
): ReadonlyArray<number> | null => {
  for (const f of tree) {
    if (f.folder_id === folderId) return [f.folder_id];
    const children = f.children ?? [];
    if (children.length === 0) continue;
    const sub = dfsFolderPath(children, folderId);
    if (sub !== null) return [f.folder_id, ...sub];
  }
  return null;
};

// Walk every folder once, indexing by id; if parent_id is present, follow it
// up to root. Returns null if any link in the chain is missing — caller falls
// back to the DFS path.
const tryParentIdChain = (
  tree: ReadonlyArray<Schemas.Folder>,
  folderId: number,
): ReadonlyArray<number> | null => {
  const index = new Map<number, Schemas.Folder>();
  const walk = (level: ReadonlyArray<Schemas.Folder>): void => {
    for (const f of level) {
      index.set(f.folder_id, f);
      if (f.children !== undefined) walk(f.children);
    }
  };
  walk(tree);
  const target = index.get(folderId);
  if (target === undefined || target.parent_id === undefined) return null;
  const chain: number[] = [folderId];
  let cursor: Schemas.Folder | undefined = target;
  // Cap at index.size to defend against a malformed payload with a parent_id cycle.
  for (let i = 0; i < index.size; i++) {
    const parentId = cursor.parent_id;
    if (parentId === undefined) return chain;
    const parent = index.get(parentId);
    if (parent === undefined) return null;
    chain.unshift(parentId);
    cursor = parent;
  }
  return null;
};

export const FolderBrowser: Component<FolderBrowserProps> = (props) => {
  // Path of folder ids from root. Empty = root level (top-level folders only).
  const [path, setPath] = createSignal<ReadonlyArray<number>>([]);
  // Captured at mount — `props.initialBookId` is only honored once. After
  // that the user owns the path. Keeping a snapshot avoids the effect re-firing
  // when the parent re-renders with a new book id (e.g. search jump). Latching
  // also doubles as the "user touched the path" sentinel: once we've seeded
  // (or chosen not to), nothing else automatically rewrites `path`.
  const seedBookId = props.initialBookId ?? null;
  let seeded = seedBookId === null;

  const tree = ipc.egw.listFolders.query(() => ({ lang: DEFAULT_LANG }));

  // Seed the path to the open book's folder on first mount. Fires once when
  // the tree resource resolves; afterwards `seeded = true` makes it a no-op.
  // Best-effort: any failure (book not in listBooks, folder not in tree)
  // leaves the user at root. No error surfacing — falling back to root is
  // the existing UX and it's fine.
  //
  // The listBooks lookup runs as a tracked fiber so an unmount mid-flight
  // (or the user drilling in before it resolves) interrupts the seed before
  // its callback can snap them back to the seeded folder.
  createEffect(() => {
    if (seeded) return;
    const folders = tree();
    if (folders === undefined) return;
    const bookId = seedBookId;
    if (bookId === null) {
      seeded = true;
      return;
    }
    seeded = true;

    // Memo hit — synchronously seed without listBooks/DFS. If the chain is
    // stale (folder deleted/renamed), resolvePath returns null and currentLevel
    // resets to root + drops the cache entry on next render.
    const cached = folderPathByBook.get(bookId);
    if (cached !== undefined) {
      if (path().length === 0) setPath(cached);
      return;
    }

    const seedFiber = runtime.runFork(
      Effect.gen(function* () {
        const data = yield* EGWData;
        const books = yield* data.listBooks(DEFAULT_LANG);
        const book = books.find((b) => b.book_id === bookId);
        if (book === undefined) return;
        const chain = findFolderPath(folders, book.folder_id);
        if (chain === null) return;
        folderPathByBook.set(bookId, chain);
        // Guard against the user having drilled in during the lookup —
        // listBooks is cached but not synchronous on a cold cache.
        if (path().length !== 0) return;
        setPath(chain);
      }).pipe(Effect.ignore),
    );
    onCleanup(() => {
      void runtime.runPromise(Fiber.interrupt(seedFiber));
    });
  });

  // Subfolders to render at the current level.
  const currentLevel = createMemo(
    (): {
      readonly folders: ReadonlyArray<Schemas.Folder>;
      readonly currentFolderId: number | null;
      readonly crumbs: ReadonlyArray<CrumbNode>;
    } => {
      const t = tree();
      if (t === undefined) {
        return { folders: [], currentFolderId: null, crumbs: [] };
      }
      const p = path();
      if (p.length === 0) {
        return { folders: t, currentFolderId: null, crumbs: [] };
      }
      const crumbs = resolvePath(t, p);
      if (crumbs === null) {
        // Path stale (tree changed) — reset to root and evict any cached chain
        // that matches it, so a re-open doesn't re-seed the same broken path.
        setPath([]);
        if (seedBookId !== null) {
          const stale = folderPathByBook.get(seedBookId);
          if (
            stale !== undefined &&
            stale.length === p.length &&
            stale.every((id, i) => id === p[i])
          ) {
            folderPathByBook.delete(seedBookId);
          }
        }
        return { folders: t, currentFolderId: null, crumbs: [] };
      }
      const last = crumbs[crumbs.length - 1] ?? null;
      return {
        folders: last?.children ?? [],
        currentFolderId: last?.id ?? null,
        crumbs,
      };
    },
  );

  // --- Download badges (mirrors LibraryRail) ------------------------------
  // `status` mirrors the Prefetcher's SubscriptionRef directly via `signalFromStream`,
  // so the renderer fiber lifecycle is owned by the helper. The side-effect
  // (`refreshDownloadState` on Done) is kept on a separate onMount fiber below
  // — keeps the mirror pure derive, and the side-effect explicit.
  const status = signalFromStream(
    Effect.gen(function* () {
      const prefetcher = yield* Prefetcher;
      return SubscriptionRef.changes(prefetcher.status);
    }),
    idleStatus as PrefetchStatus,
  );
  type DownloadCount = { readonly cached: number; readonly expected: number };
  const [downloadStates, setDownloadStates] = createSignal<ReadonlyMap<number, DownloadCount>>(
    new Map(),
  );

  // Tracked refresh fibers keyed by bookId. A new event for the same book
  // interrupts the previous in-flight refresh so a slow `getDownloadState`
  // can't land after a newer status snapshot and write a stale count. The
  // global cleanup interrupts everything still in flight when we unmount.
  const refreshFibers = new Map<number, Fiber.Fiber<void>>();
  const refreshDownloadState = (bookId: number) => {
    const prev = refreshFibers.get(bookId);
    if (prev !== undefined) void runtime.runPromise(Fiber.interrupt(prev));
    const fiber = runtime.runFork(
      Effect.gen(function* () {
        const data = yield* EGWData;
        const state = yield* data.getDownloadState(bookId);
        setDownloadStates((prevStates) => {
          const next = new Map(prevStates);
          if (Option.isNone(state)) next.delete(bookId);
          else next.set(bookId, state.value);
          return next;
        });
      }).pipe(
        Effect.ignore,
        Effect.ensuring(
          Effect.sync(() => {
            refreshFibers.delete(bookId);
          }),
        ),
      ),
    );
    refreshFibers.set(bookId, fiber);
  };

  onMount(() => {
    const fiber = runtime.runFork(
      Effect.gen(function* () {
        const prefetcher = yield* Prefetcher;
        yield* SubscriptionRef.changes(prefetcher.status).pipe(
          Stream.runForEach((s) =>
            Effect.sync(() => {
              if (s._tag === 'Done' && s.mode === 'download') refreshDownloadState(s.bookId);
            }),
          ),
        );
      }),
    );
    onCleanup(() => {
      void runtime.runPromise(Fiber.interrupt(fiber));
      for (const f of refreshFibers.values()) {
        void runtime.runPromise(Fiber.interrupt(f));
      }
      refreshFibers.clear();
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

  const downloadFor = (bookId: number): DownloadState => {
    const s = status();
    if (s._tag === 'Running' && s.mode === 'download' && s.bookId === bookId) {
      return {
        _tag: 'running',
        percent: s.total === 0 ? 0 : (s.completed / s.total) * 100,
      };
    }
    if (s._tag === 'Done' && s.mode === 'download' && s.bookId === bookId) {
      return { _tag: 'done' };
    }
    return { _tag: 'idle' };
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

  // Single-slot open-book fiber. A subsequent openBook (or unmount) interrupts
  // the previous chain so two rapid clicks can't both finish resolving to a
  // first chapter and race state updates.
  let openBookFiber: Fiber.Fiber<unknown> | undefined;
  onCleanup(() => {
    if (openBookFiber !== undefined) {
      void runtime.runPromise(Fiber.interrupt(openBookFiber));
      openBookFiber = undefined;
    }
  });
  const openBook = (bookId: number) => {
    if (openBookFiber !== undefined) {
      void runtime.runPromise(Fiber.interrupt(openBookFiber));
    }
    const fiber: Fiber.Fiber<unknown> = runtime.runFork(
      openBookAtFirstChapter(bookId).pipe(
        Effect.ignore,
        Effect.ensuring(
          Effect.sync(() => {
            if (openBookFiber === fiber) openBookFiber = undefined;
          }),
        ),
      ),
    );
    openBookFiber = fiber;
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

        {/*
          Books panel is gated on having a real folderId — `<Show keyed>` keys
          the child on the id, so BooksList remounts (and re-runs its query)
          when the user drills between folders rather than the resource
          tracking a reactive null. That keeps the ipc proxy's input
          monotonically non-null and avoids spurious empty-array branches.
        */}
        <Show when={currentLevel().currentFolderId} keyed>
          {(folderId) => {
            const books = ipc.egw.listBooksByFolder.query(() => ({
              folderId,
              lang: DEFAULT_LANG,
            }));
            // Fan out a fresh download-state read per book as soon as the list
            // resolves. Lives at the parent rather than inside `BooksList` so
            // the books resource has one owner — no callback-in-effect from
            // the child back up to the parent's `refreshDownloadState`.
            createEffect(() => {
              const list = books();
              if (list === undefined) return;
              for (const b of list) refreshDownloadState(b.book_id);
            });
            return (
              <>
                <h3 class="m-0 text-ui-xs font-semibold tracking-[0.08em] uppercase text-muted">
                  Books
                </h3>
                <Suspense fallback={<p class="m-0 py-2 text-ui-base text-muted">Loading books…</p>}>
                  <BooksList
                    books={books}
                    onOpenBook={openBook}
                    downloadFor={downloadFor}
                    anyDownloadRunning={anyDownloadRunning}
                    isFullyDownloaded={isFullyDownloaded}
                    onDownloadBook={downloadBook}
                  />
                </Suspense>
              </>
            );
          }}
        </Show>
      </div>
    </div>
  );
};

interface BooksListProps {
  readonly books: () => readonly Schemas.Book[] | undefined;
  readonly onOpenBook: (bookId: number) => void;
  readonly downloadFor: (bookId: number) => DownloadState;
  readonly anyDownloadRunning: () => boolean;
  readonly isFullyDownloaded: (bookId: number) => boolean;
  readonly onDownloadBook: (bookId: number) => void;
}

const BooksList: Component<BooksListProps> = (props) => {
  const books = props.books;
  return (
    <Show
      when={(books() ?? []).length > 0}
      fallback={<p class="m-0 py-2 text-ui-base text-muted">No books in this folder.</p>}
    >
      <ul class="list-none m-0 p-0 flex flex-col">
        <For each={books() ?? []}>
          {(book) => {
            const dl = () => props.downloadFor(book.book_id);
            return (
              <li class="relative grid grid-cols-[1fr_auto] items-stretch border-b border-rule last:border-b-0">
                <button
                  type="button"
                  class="w-full text-left bg-transparent border-none px-3.5 py-3 flex flex-col gap-0.5 cursor-pointer text-fg border-l-2 border-l-transparent transition-[background,border-color] duration-[0.12s] ease-in-out hover:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)] hover:outline-none focus-visible:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)] focus-visible:outline-none"
                  onClick={() => props.onOpenBook(book.book_id)}
                >
                  <span class="text-ui-md leading-[1.3]">{book.title}</span>
                  <span class="text-ui-xs text-muted">{book.author}</span>
                </button>
                <button
                  type="button"
                  class="bg-transparent border-none px-3 flex items-center justify-center min-w-[44px] text-muted cursor-pointer text-ui-xs [font-variant-numeric:tabular-nums] border-l border-l-transparent transition-[color,background] duration-[0.12s] ease-in-out enabled:hover:text-accent enabled:hover:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)] enabled:hover:outline-none enabled:focus-visible:text-accent enabled:focus-visible:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)] enabled:focus-visible:outline-none disabled:opacity-30 disabled:cursor-not-allowed data-downloaded:text-accent data-downloaded:text-ui-md"
                  data-downloaded={props.isFullyDownloaded(book.book_id) ? '' : undefined}
                  title={
                    props.isFullyDownloaded(book.book_id)
                      ? 'Downloaded — click to refresh'
                      : 'Download for offline'
                  }
                  aria-label={`Download ${book.title}`}
                  disabled={props.anyDownloadRunning() && dl()._tag === 'idle'}
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onDownloadBook(book.book_id);
                  }}
                >
                  <Show
                    when={(() => {
                      const d = dl();
                      return d._tag === 'idle' ? null : d;
                    })()}
                    fallback={
                      <Show
                        when={props.isFullyDownloaded(book.book_id)}
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
                    {(d) => (d._tag === 'done' ? '✓' : <>{`${Math.round(d.percent)}%`}</>)}
                  </Show>
                </button>
              </li>
            );
          }}
        </For>
      </ul>
    </Show>
  );
};
