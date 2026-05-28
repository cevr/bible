import { type Component, For, Show } from 'solid-js';
import type { KjvStrongsWord } from '../../services/kjv-bible.js';

// Render a single verse worth of Strong's-annotated words. Each `<word>+
// <sup>code</sup>` pair is a click target — clicking opens the lexicon on
// that specific code (instead of a comma-joined token the lexicon can't
// resolve).
//
// Shared by the Bible drawer's Strong's-aware chapter render and the main
// Bible canvas' inline-Strong's overlay so the affordance looks the same in
// both surfaces.
export const StrongsVerse: Component<{
  readonly words: readonly KjvStrongsWord[];
  readonly onCodeSelected: (code: string) => void;
}> = (props) => (
  <>
    <For each={props.words}>
      {(w, i) => {
        const codes = (): readonly string[] => w.strongs ?? [];
        return (
          <>
            <Show when={i() > 0}> </Show>
            <Show when={codes().length > 0} fallback={w.text}>
              <span class="group/strong relative inline">
                {w.text}
                <For each={codes()}>
                  {(code, ci) => (
                    <>
                      <Show when={ci() > 0}>
                        <span class="text-[0.62em] text-accent opacity-70 select-none">,</span>
                      </Show>
                      <button
                        type="button"
                        class="ml-px cursor-pointer bg-transparent border-0 p-0 align-baseline text-[0.62em] font-medium text-accent opacity-70 group-hover/strong:opacity-100 hover:underline [font-variant-numeric:tabular-nums] select-none"
                        title={`Open ${code}`}
                        onClick={() => props.onCodeSelected(code)}
                      >
                        <sup>{code}</sup>
                      </button>
                    </>
                  )}
                </For>
              </span>
            </Show>
          </>
        );
      }}
    </For>
  </>
);
