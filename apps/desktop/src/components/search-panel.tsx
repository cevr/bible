import { Effect, Fiber, Option } from 'effect';
import {
  type Accessor,
  type Component,
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  onCleanup,
  onMount,
  Show,
  Suspense,
} from 'solid-js';
import { ipc, runtime } from '../runtime.js';
import { EGWData } from '../services/egw-data.js';
import { ReaderState } from '../services/reader-state.js';
import type { SearchResult } from '../services/search-service.js';

// Floating result list rendered below the header search input.
//
// Two query paths:
//   • Refcode (e.g. "PP 351.1") — exact lookup on the local index, instant.
//   • Free text — debounced 200ms, SearchService.byText handles local-first
//     with remote fallback when local is empty.
//
// Result clicks for *local* hits route through ReaderState.openChapterAt so
// the reader scrolls + flashes the matched paragraph (search-jump from #71).
// Remote hits are non-clickable: their bookId is null (the EGW API returns
// pub_code, not the internal id) — we render them as informational so the
// user can see results from books they haven't downloaded yet.

const DEBOUNCE_MS = 200;

// Refcode detector: a token (book code letters/digits), whitespace, then a
// chapter or chapter.paragraph number. Picks up "PP 351.1", "DA 12.4",
// "1T 200.2", "DAR 62", "GC". A bare book code with no numeric suffix also
// routes to refcode search so users can pull up "GC" → first paragraph.
const REFCODE_PATTERN = /^[A-Za-z0-9]+(?:\s+\d+(?:\.\d+)?)?$/;
const looksLikeRefcode = (q: string): boolean => REFCODE_PATTERN.test(q.trim());

export interface SearchPanelProps {
  readonly query: Accessor<string>;
  readonly anchorEl: Accessor<HTMLElement | undefined>;
  readonly onClose: () => void;
}

export const SearchPanel: Component<SearchPanelProps> = (props) => {
  // Debounced + trimmed query. Empty → no fetch, panel renders a hint.
  const [activeQuery, setActiveQuery] = createSignal('');
  createEffect(
    on(props.query, (q) => {
      const trimmed = q.trim();
      if (trimmed === '') {
        setActiveQuery('');
        return;
      }
      const timer = window.setTimeout(() => setActiveQuery(trimmed), DEBOUNCE_MS);
      onCleanup(() => window.clearTimeout(timer));
    }),
  );

  // Two parallel queries — the active one is the one whose input shape
  // matches the query string. The inactive one isn't subscribed (we only
  // read whichever accessor matches), so the ipc registry won't keep an
  // entry for the unused path.
  const [hits, setHits] = createSignal<readonly SearchResult[] | undefined>(undefined);

  // Position the panel directly under the input element. Anchored on every
  // open by reading getBoundingClientRect off the input ref.
  const position = createMemo(() => {
    const el = props.anchorEl();
    if (el === undefined) return { top: 56, left: 0, width: 420 };
    const rect = el.getBoundingClientRect();
    return { top: rect.bottom + 6, left: rect.left, width: rect.width };
  });

  // Keyboard nav within the result list. The user keeps focus on the search
  // input — we listen at window level and only act when the panel is mounted
  // (Show in app.tsx unmounts us on close) and the focused element is the
  // search input itself, so global ArrowUp/Down elsewhere keeps working.
  const [activeIndex, setActiveIndex] = createSignal(0);
  // Reset to first row whenever the result set changes.
  createEffect(
    on(hits, () => {
      setActiveIndex(0);
    }),
  );
  const clickableHits = createMemo<readonly SearchResult[]>(() =>
    (hits() ?? []).filter((h) => h.source === 'local'),
  );
  let listEl: HTMLUListElement | undefined;
  const scrollActiveIntoView = (): void => {
    if (listEl === undefined) return;
    const row = listEl.querySelector<HTMLElement>(`[data-result-index="${String(activeIndex())}"]`);
    if (row) row.scrollIntoView({ block: 'nearest' });
  };
  createEffect(
    on(activeIndex, () => {
      queueMicrotask(scrollActiveIntoView);
    }),
  );

  onMount(() => {
    const handler = (e: KeyboardEvent): void => {
      const target = e.target;
      const isSearchInput =
        target instanceof HTMLInputElement && target.getAttribute('type') === 'search';
      if (!isSearchInput) return;
      const list = clickableHits();
      if (list.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % list.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + list.length) % list.length);
      } else if (e.key === 'Enter') {
        const idx = activeIndex();
        const hit = list[idx];
        if (hit !== undefined) {
          e.preventDefault();
          onPickLocal(hit);
        }
      }
    };
    window.addEventListener('keydown', handler);
    onCleanup(() => window.removeEventListener('keydown', handler));
  });

  // In-flight navigation fibers from pick clicks. The panel unmounts as soon
  // as we call onClose, so we track each launch in this set and interrupt
  // any survivors in onCleanup — keeps a stale openChapterAt from firing
  // after the user already closed the panel.
  const pickFibers = new Set<Fiber.Fiber<void>>();
  onCleanup(() => {
    for (const f of pickFibers) {
      void runtime.runPromise(Fiber.interrupt(f));
    }
    pickFibers.clear();
  });

  const onPickLocal = (hit: SearchResult): void => {
    if (hit.source !== 'local') return;
    const fiber = runtime.runFork(
      Effect.gen(function* () {
        const data = yield* EGWData;
        // Search hits are paragraphs; the reader needs the *chapter* paraId.
        // findContainingChapter walks the cached TOC and returns the navigable
        // item whose puborder is the greatest <= the paragraph's puborder.
        const chapter = yield* data.findContainingChapter(hit.bookId, hit.puborder);
        if (Option.isNone(chapter)) return;
        const chapterParaId = chapter.value.para_id;
        if (chapterParaId === undefined || chapterParaId === null || chapterParaId === '') return;
        const state = yield* ReaderState;
        yield* state.openChapterAt(hit.bookId, chapterParaId, hit.paraId);
      }).pipe(
        Effect.ignore,
        Effect.ensuring(
          Effect.sync(() => {
            pickFibers.delete(fiber);
          }),
        ),
      ),
    );
    pickFibers.add(fiber);
    props.onClose();
  };

  return (
    <div
      class="fixed z-40 rounded-lg border border-rule bg-bg shadow-[0_12px_32px_color-mix(in_srgb,#000_22%,transparent)] overflow-hidden flex flex-col max-h-[60vh]"
      style={{
        top: `${String(position().top)}px`,
        left: `${String(position().left)}px`,
        width: `${String(position().width)}px`,
      }}
      role="dialog"
      aria-label="Search results"
    >
      <Show
        when={props.query().trim() !== '' && activeQuery() !== ''}
        fallback={
          <Show
            when={props.query().trim() === ''}
            fallback={<div class="px-4 py-6 text-ui-sm text-muted">Searching…</div>}
          >
            <div class="px-4 py-6 text-ui-sm text-muted">
              Start typing to search. Try a refcode like <code class="text-fg">PP 351.1</code>.
            </div>
          </Show>
        }
      >
        <Suspense fallback={<div class="px-4 py-6 text-ui-sm text-muted">Searching…</div>}>
          <SearchResults
            query={activeQuery}
            onHits={setHits}
            activeIndex={activeIndex}
            clickableHits={clickableHits}
            listRef={(el) => {
              listEl = el;
            }}
            onPickLocal={onPickLocal}
          />
        </Suspense>
      </Show>
    </div>
  );
};

const SearchResults: Component<{
  readonly query: () => string;
  readonly onHits: (hits: readonly SearchResult[]) => void;
  readonly activeIndex: () => number;
  readonly clickableHits: () => readonly SearchResult[];
  readonly listRef: (el: HTMLUListElement) => void;
  readonly onPickLocal: (hit: SearchResult) => void;
}> = (props) => {
  // Pick the query mode each time the input changes. The unused branch is
  // never subscribed to, so the registry doesn't pin an entry for it.
  const refcodeHits = ipc.search.byRefcode.query(() => ({ refcode: props.query() }));
  const textHits = ipc.search.byText.query(() => ({ query: props.query() }));

  const results = createMemo<readonly SearchResult[]>(() => {
    const list = looksLikeRefcode(props.query()) ? refcodeHits() : textHits();
    return list ?? [];
  });

  createEffect(() => {
    props.onHits(results());
  });

  return (
    <Show
      when={results().length > 0}
      fallback={
        <div class="px-4 py-6 text-ui-sm text-muted">
          No results for <span class="text-fg">{props.query()}</span>.
        </div>
      }
    >
      <ul class="m-0 list-none overflow-y-auto py-1" ref={props.listRef}>
        <For each={results()}>
          {(hit) => {
            const clickableIdx = createMemo(() => {
              if (hit.source !== 'local') return -1;
              return props.clickableHits().indexOf(hit);
            });
            return (
              <ResultRow
                hit={hit}
                active={() => clickableIdx() === props.activeIndex() && clickableIdx() !== -1}
                dataIndex={clickableIdx}
                onPick={() => props.onPickLocal(hit)}
              />
            );
          }}
        </For>
      </ul>
    </Show>
  );
};

const ResultRow: Component<{
  readonly hit: SearchResult;
  readonly active: () => boolean;
  readonly dataIndex: () => number;
  readonly onPick: () => void;
}> = (props) => {
  const isClickable = () => props.hit.source === 'local';
  return (
    <li class="m-0">
      <button
        type="button"
        data-result-index={props.dataIndex() >= 0 ? String(props.dataIndex()) : undefined}
        data-active={props.active() ? 'true' : undefined}
        class="w-full px-4 py-2.5 flex flex-col gap-1 items-start text-left bg-transparent border-0 cursor-pointer transition-[background] duration-[0.08s] hover:bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)] focus-visible:bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)] focus-visible:outline-none disabled:cursor-default disabled:hover:bg-transparent data-[active=true]:bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)]"
        onClick={() => {
          if (isClickable()) props.onPick();
        }}
        disabled={!isClickable()}
        aria-disabled={!isClickable()}
      >
        <div class="flex items-center gap-2 w-full text-ui-xs text-muted">
          <span class="font-semibold tracking-[0.04em] uppercase">{props.hit.bookCode}</span>
          <Show when={Option.getOrNull(props.hit.refcodeShort)} keyed>
            {(refcode) => (
              <>
                <span class="opacity-70">·</span>
                <span>{refcode}</span>
              </>
            )}
          </Show>
          <span class="flex-1" />
          <Show when={props.hit.source === 'remote'}>
            <span class="px-1.5 py-0.5 rounded-sm bg-[color-mix(in_srgb,var(--color-fg)_8%,transparent)] text-[0.65rem] uppercase tracking-[0.05em]">
              remote
            </span>
          </Show>
        </div>
        <div class="text-ui-sm text-fg truncate w-full">{props.hit.bookTitle}</div>
        <Show
          when={Option.flatMap(props.hit.snippet, (s) =>
            s === '' ? Option.none() : Option.some(s),
          ).pipe(Option.getOrNull)}
          keyed
        >
          {(snippet) => (
            /* Snippet may contain FTS5 <b> highlighting from server search; we
                strip it for safety here and render plain text. */
            <div class="text-ui-sm text-muted leading-snug line-clamp-2">{stripTags(snippet)}</div>
          )}
        </Show>
      </button>
    </li>
  );
};

const stripTags = (s: string): string => s.replace(/<[^>]*>/g, '');
