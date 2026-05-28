import { nodesToText, type Schemas } from '@bible/core/egw';
import { Effect, Fiber, Option, Stream } from 'effect';
import {
  type Component,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  Suspense,
} from 'solid-js';
import { ipc, runtime } from '../runtime.js';
import { ReaderState } from '../services/reader-state.js';

// TOC sidebar — middle pane. Shows the table of contents for the currently
// open book and lets the user navigate between chapters.
//
// TocItem.level is the hierarchy depth (front matter sections, parts, chapters,
// subsections). Items without a para_id are pure headings — no chapter to
// open, so they render as labels. Items with a para_id become click targets
// that call ReaderState.openChapter(bookId, para_id).
//
// A chapter row can be expanded via the chevron button on the right to show
// the chapter's paragraphs (the EGW equivalent of "verses"). Clicking a
// paragraph jumps to the chapter and scrolls/flashes that paragraph.
// Expanding is opt-in to keep the default chapter list scannable — the
// chapter click itself still opens the whole chapter.
//
// Active-chapter highlighting subscribes to ReaderState.changes the same way
// app.tsx does — keeps the sidebar in sync when navigation comes from any
// source (prev/next buttons, deep links, etc.) without prop drilling.

export interface TocSidebarProps {
  readonly bookId: number;
}

const INDENT_PER_LEVEL_PX = 16;

export const TocSidebar: Component<TocSidebarProps> = (props) => {
  const toc = ipc.egw.getToc.query(() => ({ bookId: props.bookId }));

  const [activeParaId, setActiveParaId] = createSignal<Option.Option<string>>(Option.none());
  const [expandedParaId, setExpandedParaId] = createSignal<Option.Option<string>>(Option.none());

  onMount(() => {
    const fiber = runtime.runFork(
      Effect.gen(function* () {
        const state = yield* ReaderState;
        yield* state.changes.pipe(
          Stream.runForEach((sel) =>
            Effect.sync(() => {
              if (Option.isNone(sel)) {
                setActiveParaId(Option.none());
                return;
              }
              setActiveParaId(sel.value.chapterParaId);
            }),
          ),
        );
      }),
    );
    onCleanup(() => {
      void runtime.runPromise(Fiber.interrupt(fiber));
    });
  });

  const openChapter = (paraId: string): void => {
    void runtime.runPromise(
      Effect.gen(function* () {
        const state = yield* ReaderState;
        yield* state.openChapter(props.bookId, paraId);
      }),
    );
  };

  const openParagraph = (chapterParaId: string, paragraphParaId: string): void => {
    void runtime.runPromise(
      Effect.gen(function* () {
        const state = yield* ReaderState;
        yield* state.openChapterAt(props.bookId, chapterParaId, paragraphParaId);
      }),
    );
  };

  const toggleExpand = (paraId: string): void => {
    setExpandedParaId((curr) =>
      Option.isSome(curr) && curr.value === paraId ? Option.none() : Option.some(paraId),
    );
  };

  // Bare read — caller wraps this in <Suspense>. Errors bubble to the nearest
  // <ErrorBoundary>. The cache dedupes across siblings keyed on bookId.
  return (
    <div class="flex flex-col h-full min-h-0">
      <ul class="list-none m-0 px-2 pt-2 pb-6 flex flex-col gap-px">
        <For each={toc()}>
          {(item) => (
            <TocRow
              bookId={props.bookId}
              item={item}
              active={
                item.para_id !== null &&
                item.para_id !== undefined &&
                Option.contains(activeParaId(), item.para_id)
              }
              expanded={
                item.para_id !== null &&
                item.para_id !== undefined &&
                Option.contains(expandedParaId(), item.para_id)
              }
              onSelect={openChapter}
              onToggleExpand={toggleExpand}
              onPickParagraph={openParagraph}
            />
          )}
        </For>
      </ul>
    </div>
  );
};

interface TocRowProps {
  readonly bookId: number;
  readonly item: Schemas.TocItem;
  readonly active: boolean;
  readonly expanded: boolean;
  readonly onSelect: (paraId: string) => void;
  readonly onToggleExpand: (paraId: string) => void;
  readonly onPickParagraph: (chapterParaId: string, paragraphParaId: string) => void;
}

const TocRow: Component<TocRowProps> = (props) => {
  const indent = () => ({ 'padding-left': `${String(props.item.level * INDENT_PER_LEVEL_PX)}px` });
  const label = () => props.item.title ?? props.item.refcode_short ?? '(untitled)';
  const paraId = () => props.item.para_id ?? null;

  return (
    // Headings = group labels with no chapter. Visually distinct from clickable
    // rows so the user knows they're not interactive. Tight top spacer creates
    // group separation without a divider line. The first heading in the list
    // gets a tighter top padding via the [li:first-child_>_&]:pt-1 variant on
    // the heading div, mirroring the original `.toc-list > li:first-child .toc-heading`.
    <li>
      <Show
        when={paraId()}
        keyed
        fallback={
          <div
            class="w-full text-left block text-ui-xs leading-[1.4] text-muted rounded-md font-semibold tracking-[0.08em] uppercase pt-[14px] pr-3 pb-1 pl-3 [li:first-child_>_&]:pt-1"
            style={indent()}
          >
            {label()}
          </div>
        }
      >
        {(pid) => (
          <>
            <div class="flex items-stretch gap-px" style={indent()}>
              <button
                type="button"
                class="flex-1 min-w-0 text-left block text-ui-base leading-[1.4] text-fg rounded-md bg-transparent border-none border-l-2 border-l-transparent cursor-pointer py-[7px] pr-3 pl-[14px] ml-0 transition-[background,border-color,color] duration-[0.12s] ease-in-out hover:bg-[color-mix(in_srgb,var(--color-accent)_7%,transparent)] hover:outline-none focus-visible:bg-[color-mix(in_srgb,var(--color-accent)_7%,transparent)] focus-visible:outline-none data-active:border-l-accent data-active:bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] data-active:text-accent data-active:font-medium"
                data-active={props.active ? '' : undefined}
                onClick={() => props.onSelect(pid)}
              >
                {label()}
              </button>
              <button
                type="button"
                class="flex items-center justify-center w-7 shrink-0 text-muted rounded-md cursor-pointer bg-transparent border-none transition-[background,color] duration-[0.12s] ease-in-out hover:bg-[color-mix(in_srgb,var(--color-accent)_7%,transparent)] hover:text-fg focus-visible:bg-[color-mix(in_srgb,var(--color-accent)_7%,transparent)] focus-visible:outline-none data-[expanded=true]:text-accent"
                data-expanded={props.expanded ? 'true' : undefined}
                title={props.expanded ? 'Hide paragraphs' : 'Show paragraphs'}
                aria-label={props.expanded ? 'Hide paragraphs' : 'Show paragraphs'}
                aria-expanded={props.expanded}
                onClick={() => props.onToggleExpand(pid)}
              >
                <span class="text-ui-xs leading-none">{props.expanded ? '▾' : '▸'}</span>
              </button>
            </div>
            <Show when={props.expanded}>
              <Suspense
                fallback={
                  <p
                    class="text-ui-xs text-muted m-0 px-3 py-2"
                    style={{
                      'padding-left': `${String(props.item.level * INDENT_PER_LEVEL_PX + 28)}px`,
                    }}
                  >
                    Loading paragraphs…
                  </p>
                }
              >
                <ParagraphList
                  bookId={props.bookId}
                  chapterParaId={pid}
                  indentPx={props.item.level * INDENT_PER_LEVEL_PX + 28}
                  onPickParagraph={(paragraphParaId) => props.onPickParagraph(pid, paragraphParaId)}
                />
              </Suspense>
            </Show>
          </>
        )}
      </Show>
    </li>
  );
};

const ParagraphList: Component<{
  readonly bookId: number;
  readonly chapterParaId: string;
  readonly indentPx: number;
  readonly onPickParagraph: (paragraphParaId: string) => void;
}> = (props) => {
  const paragraphs = ipc.egw.getChapterByParaId.query(() => ({
    bookId: props.bookId,
    paraId: props.chapterParaId,
  }));
  // Only paragraphs with a non-empty para_id are navigable — the chapter
  // header itself often has no para_id, and we don't want those listed twice.
  const navigable = createMemo<readonly Schemas.Paragraph[]>(() => {
    const rows = paragraphs();
    if (rows === undefined) return [];
    return rows.filter((p) => p.para_id !== undefined && p.para_id !== null && p.para_id !== '');
  });

  return (
    <Show
      when={navigable().length > 0}
      fallback={
        <p
          class="text-ui-xs text-muted m-0 px-3 py-1"
          style={{ 'padding-left': `${String(props.indentPx)}px` }}
        >
          No paragraphs.
        </p>
      }
    >
      <ul class="list-none m-0 p-0 flex flex-col gap-px">
        <For each={navigable()}>
          {(p) => (
            <ParagraphRow
              paragraph={p}
              indentPx={props.indentPx}
              onPick={() => {
                const pid = p.para_id;
                if (pid === undefined || pid === null || pid === '') return;
                props.onPickParagraph(pid);
              }}
            />
          )}
        </For>
      </ul>
    </Show>
  );
};

const ParagraphRow: Component<{
  readonly paragraph: Schemas.Paragraph;
  readonly indentPx: number;
  readonly onPick: () => void;
}> = (props) => {
  // Best-effort label: prefer refcode_short ("PP 5.1"), fall back to the first
  // few words of the rendered text so the row isn't empty for paragraphs
  // without a refcode.
  const label = createMemo<string>(() => {
    const ref = props.paragraph.refcode_short;
    if (ref !== undefined && ref !== null && ref !== '') return ref;
    const snippet = paragraphSnippet(props.paragraph);
    return snippet === '' ? '(paragraph)' : snippet;
  });

  return (
    <li>
      <button
        type="button"
        class="w-full text-left block text-ui-sm leading-[1.35] text-muted rounded-md bg-transparent border-none cursor-pointer py-[5px] pr-3 transition-[background,color] duration-[0.12s] ease-in-out hover:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)] hover:text-fg focus-visible:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)] focus-visible:text-fg focus-visible:outline-none"
        style={{ 'padding-left': `${String(props.indentPx)}px` }}
        onClick={props.onPick}
      >
        <span class="line-clamp-1">{label()}</span>
      </button>
    </li>
  );
};

const SNIPPET_MAX = 60;

// Short preview string for the picker row when no refcode_short is present.
// Reuses the AST→text flattener from core so we don't have to re-walk the
// node union here.
const paragraphSnippet = (p: Schemas.Paragraph): string => {
  const trimmed = nodesToText(p.nodes).trim().replace(/\s+/g, ' ');
  return trimmed.length > SNIPPET_MAX ? `${trimmed.slice(0, SNIPPET_MAX - 1)}…` : trimmed;
};
