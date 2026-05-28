import { Effect } from 'effect';
import { type Component, createMemo } from 'solid-js';
import { runtime, signalFromStream } from '../runtime.js';
import {
  INITIAL_READER_SETTINGS,
  ReaderSettings,
  type ReaderSettingsShape,
} from '../services/reader-settings.js';

// Floating toolbar pinned to the top center of the chapter canvas. Reads
// the inline-overlay flags directly from ReaderSettings.changes and fires
// the three `inline*Toggled` events back through the same service — no
// prop drill from app.tsx through canvas.
//
// Mounted by the caller only when a chapter is selected (caller decides
// the mount condition). Mirrors ChapterNavButtons at the bottom of the
// reader column for a matched pill-chrome bookend.
export const BibleReaderToolbar: Component = () => {
  const settings = signalFromStream(
    Effect.gen(function* () {
      const s = yield* ReaderSettings;
      return s.changes;
    }),
    INITIAL_READER_SETTINGS,
  );
  const inlineStrongs = createMemo(() => settings().inlineStrongs);
  const inlineMarginNotes = createMemo(() => settings().inlineMarginNotes);
  const inlineCrossRefs = createMemo(() => settings().inlineCrossRefs);

  const dispatch = (toggle: (s: ReaderSettingsShape) => Effect.Effect<void>): void => {
    runtime.runFork(
      Effect.gen(function* () {
        const s = yield* ReaderSettings;
        yield* toggle(s);
      }),
    );
  };

  return (
    <div class="sticky top-3 z-10 flex justify-center pointer-events-none">
      <div class="inline-flex items-center gap-px rounded-full border border-rule bg-bg/85 backdrop-blur px-1.5 py-1 shadow-sm pointer-events-auto">
        <ToolbarToggle
          label="Strong's"
          title="Toggle inline Strong's annotations"
          pressed={inlineStrongs()}
          onClick={() => dispatch((s) => s.inlineStrongsToggled)}
        />
        <ToolbarToggle
          label="Notes"
          title="Toggle inline margin-note markers"
          pressed={inlineMarginNotes()}
          onClick={() => dispatch((s) => s.inlineMarginNotesToggled)}
        />
        <ToolbarToggle
          label="Xrefs"
          title="Toggle inline cross-reference markers"
          pressed={inlineCrossRefs()}
          onClick={() => dispatch((s) => s.inlineCrossRefsToggled)}
        />
      </div>
    </div>
  );
};

const ToolbarToggle: Component<{
  readonly label: string;
  readonly title: string;
  readonly pressed: boolean;
  readonly onClick: () => void;
}> = (props) => (
  <button
    type="button"
    class="inline-flex items-center h-7 px-3 rounded-full bg-transparent border-0 text-ui-xs text-muted cursor-pointer transition-[background,color] duration-[0.12s] ease-in-out hover:bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)] hover:text-fg focus-visible:bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)] focus-visible:text-fg focus-visible:outline-none data-pressed:bg-accent-soft data-pressed:text-accent"
    data-pressed={props.pressed ? '' : undefined}
    title={props.title}
    aria-pressed={props.pressed}
    onClick={props.onClick}
  >
    {props.label}
  </button>
);
