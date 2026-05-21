/* Right-edge progress indicator for the reader. Shows two percentages:
   chapter (scroll within the current chapter) and book (chapter index
   weighted by chapter scroll fraction over total navigable chapters).

   The percentages are computed by BookFeed (which owns the virtualizer +
   per-chapter pixel ranges) and passed in as signals. The ruler is purely
   presentational — it doesn't touch the scroll container itself. */
import { type Accessor, type Component, Show } from 'solid-js';

export interface ReaderRulerProps {
  /** 0..1 scroll fraction within the currently-visible chapter. */
  readonly chapterFraction: Accessor<number>;
  /** 0-based index of the chapter currently at the top of the viewport,
      or -1 when no chapter is in view (e.g. before mount). */
  readonly currentIndex: Accessor<number>;
  /** Total number of navigable chapters in the book. */
  readonly totalChapters: Accessor<number>;
}

export const ReaderRuler: Component<ReaderRulerProps> = (props) => {
  const chapterPct = (): number => Math.round(props.chapterFraction() * 100);

  /* Book progress: completed chapters + this chapter's scroll fraction,
     divided by total. When the current chapter isn't in nav we just show
     the chapter %. */
  const bookPct = (): number | undefined => {
    const idx = props.currentIndex();
    const total = props.totalChapters();
    if (idx < 0 || total <= 0) return undefined;
    return Math.round(((idx + props.chapterFraction()) / total) * 100);
  };

  return (
    <aside
      class="pointer-events-none fixed right-4 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-1 rounded-lg border border-rule bg-[color-mix(in_srgb,var(--color-bg)_80%,transparent)] px-2.5 py-2 font-sans text-[11px] [font-variant-numeric:tabular-nums] text-muted select-none"
      aria-label="Reading progress"
    >
      <div class="flex min-w-[70px] items-baseline justify-between gap-2.5">
        <span class="text-[10px] uppercase tracking-[0.06em] opacity-70">Chapter</span>
        <span class="font-medium text-fg">{chapterPct()}%</span>
      </div>
      <Show when={bookPct() !== undefined}>
        <div class="flex min-w-[70px] items-baseline justify-between gap-2.5">
          <span class="text-[10px] uppercase tracking-[0.06em] opacity-70">Book</span>
          <span class="font-medium text-fg">{bookPct()}%</span>
        </div>
      </Show>
    </aside>
  );
};
