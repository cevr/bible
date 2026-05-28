import { type Component, For, Show } from 'solid-js';
import { animateProperty } from '../../motion/internals/driver.js';
import { defaultEase, Motion, Presence, useDrag } from '../../motion/index.js';
import {
  FONT_FAMILIES,
  FONT_FAMILY_VAR,
  formatLineHeight,
  isReaderFontScale,
  isUiScale,
  READER_FONT_PX,
  READER_FONT_SCALES,
  THEMES,
  UI_SCALE_VALUE,
  UI_SCALES,
  useReaderSettingsCtx,
} from './reader-settings-provider.js';

// Threshold below which a release snaps the sheet back to rest; above it the
// sheet closes. Matches the value that previously lived inline in app.tsx.
const DRAG_CLOSE_THRESHOLD_PX = 120;

interface SettingsSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

// Bottom-anchored settings sheet with drag-to-close. The sheet itself reads
// typography state directly via `useReaderSettingsCtx`, so app.tsx hands it
// only the open/close pair — adding a new typography control becomes a sheet
// change, not a prop-graph change in the shell.
export const SettingsSheet: Component<SettingsSheetProps> = (props) => {
  const settings = useReaderSettingsCtx();

  // Drag-to-close. We write `translate` directly on the sheet element during
  // drag (bypassing Motion so each pointer move doesn't spawn a new WAAPI
  // animation), then either close (Motion's exit plays) or animate back to
  // rest via animateProperty on release.
  let sheetEl: HTMLElement | undefined;
  const sheetDrag = useDrag({
    axis: 'y',
    constraints: { top: 0 },
    onDrag: ({ offset }) => {
      if (sheetEl !== undefined) sheetEl.style.translate = `0 ${String(offset.y)}px`;
    },
    onDragEnd: ({ offset }) => {
      if (offset.y > DRAG_CLOSE_THRESHOLD_PX) {
        props.onClose();
        return;
      }
      if (sheetEl !== undefined) {
        animateProperty(sheetEl, 'y', 0, { duration: 0.18, ease: defaultEase });
      }
    },
  });

  return (
    <>
      <Presence>
        <Show when={props.open}>
          <Motion.div
            class="fixed inset-0 bg-[color-mix(in_srgb,#000_25%,transparent)] z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: defaultEase }}
            onClick={props.onClose}
          />
        </Show>
      </Presence>

      <Presence>
        <Show when={props.open}>
          <Motion.div
            ref={(el) => {
              sheetEl = el;
            }}
            class="fixed left-0 right-0 bottom-0 z-[60] bg-bg border-t border-rule rounded-t-2xl shadow-[0_-12px_40px_color-mix(in_srgb,#000_18%,transparent)] max-w-[720px] mx-auto touch-none"
            initial={{ y: 480 }}
            animate={{ y: 0 }}
            exit={{ y: 480 }}
            transition={{ duration: 0.22, ease: defaultEase }}
          >
            <div
              class="flex justify-center pt-2.5 pb-1.5 cursor-grab touch-none active:cursor-grabbing"
              onPointerDown={sheetDrag.onPointerDown}
            >
              <div class="w-10 h-1 rounded-sm bg-rule" />
            </div>
            <div class="px-5 pt-2 pb-6 flex flex-col gap-3.5">
              <div class="grid grid-cols-[80px_1fr_auto] items-center gap-3.5 text-ui-base text-muted">
                <span class="font-medium">Theme</span>
                <div class="flex gap-1.5">
                  <For each={THEMES}>
                    {(t) => {
                      const swatchBg =
                        t === 'light'
                          ? 'bg-[#fafaf7]'
                          : t === 'sepia'
                            ? 'bg-[#f6ecd9]'
                            : 'bg-[#1a1a1c]';
                      return (
                        <button
                          type="button"
                          class={`w-[22px] h-[22px] rounded-full border-[1.5px] border-rule cursor-pointer p-0 ${swatchBg} data-active:border-accent`}
                          data-active={settings.theme() === t ? '' : undefined}
                          onClick={() => settings.setTheme(t)}
                          title={t}
                          aria-label={t}
                        />
                      );
                    }}
                  </For>
                </div>
                <span class="[font-variant-numeric:tabular-nums] text-ui-sm min-w-[56px] text-right">
                  {settings.theme()}
                </span>
              </div>

              <div class="grid grid-cols-[80px_1fr_auto] items-center gap-3.5 text-ui-base text-muted">
                <span class="font-medium">Font</span>
                <div class="flex gap-1">
                  <For each={FONT_FAMILIES}>
                    {(f) => (
                      <button
                        type="button"
                        class="w-8 h-7 rounded-md border border-rule bg-bg text-fg cursor-pointer p-0 text-ui-base leading-none data-active:border-accent data-active:bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)]"
                        data-active={settings.fontFamily() === f ? '' : undefined}
                        style={{ 'font-family': FONT_FAMILY_VAR[f] }}
                        onClick={() => settings.setFontFamily(f)}
                        title={f}
                      >
                        Aa
                      </button>
                    )}
                  </For>
                </div>
                <span class="[font-variant-numeric:tabular-nums] text-ui-sm min-w-[56px] text-right">
                  {settings.fontFamily()}
                </span>
              </div>

              <div class="grid grid-cols-[80px_1fr_auto] items-center gap-3.5 text-ui-base text-muted">
                <span class="font-medium">Size</span>
                <select
                  class="w-full h-[calc(28px*var(--ui-scale))] px-2 rounded-md border border-rule bg-bg text-fg text-ui-base font-[inherit] cursor-pointer outline-none transition-[border-color] duration-[0.12s] ease-in-out focus:border-accent"
                  value={settings.fontSize()}
                  onInput={(e) => {
                    const v = e.currentTarget.value;
                    if (isReaderFontScale(v)) settings.setFontSize(v);
                  }}
                >
                  <For each={READER_FONT_SCALES}>
                    {(scale) => (
                      <option value={scale}>
                        {scale} · {String(READER_FONT_PX[scale])}px
                      </option>
                    )}
                  </For>
                </select>
                <span class="[font-variant-numeric:tabular-nums] text-ui-sm min-w-[56px] text-right">
                  {READER_FONT_PX[settings.fontSize()]}px
                </span>
              </div>

              <div class="grid grid-cols-[80px_1fr_auto] items-center gap-3.5 text-ui-base text-muted">
                <span class="font-medium">UI</span>
                <select
                  class="w-full h-[calc(28px*var(--ui-scale))] px-2 rounded-md border border-rule bg-bg text-fg text-ui-base font-[inherit] cursor-pointer outline-none transition-[border-color] duration-[0.12s] ease-in-out focus:border-accent"
                  value={settings.uiScale()}
                  onInput={(e) => {
                    const v = e.currentTarget.value;
                    if (isUiScale(v)) settings.setUiScale(v);
                  }}
                >
                  <For each={UI_SCALES}>{(scale) => <option value={scale}>{scale}</option>}</For>
                </select>
                <span class="[font-variant-numeric:tabular-nums] text-ui-sm min-w-[56px] text-right">
                  {Math.round(UI_SCALE_VALUE[settings.uiScale()] * 100)}%
                </span>
              </div>

              <div class="grid grid-cols-[80px_1fr_auto] items-center gap-3.5 text-ui-base text-muted">
                <span class="font-medium">Width</span>
                <input
                  type="range"
                  class="w-full [accent-color:var(--color-accent)]"
                  min="40"
                  max="120"
                  step="1"
                  value={settings.lineWidth()}
                  onInput={(e) => settings.setLineWidth(Number(e.currentTarget.value))}
                />
                <span class="[font-variant-numeric:tabular-nums] text-ui-sm min-w-[56px] text-right">
                  {settings.lineWidth()}ch
                </span>
              </div>

              <div class="grid grid-cols-[80px_1fr_auto] items-center gap-3.5 text-ui-base text-muted">
                <span class="font-medium">Leading</span>
                <input
                  type="range"
                  class="w-full [accent-color:var(--color-accent)]"
                  min="1"
                  max="60"
                  step="0.05"
                  value={settings.lineHeight()}
                  onInput={(e) => settings.setLineHeight(Number(e.currentTarget.value))}
                />
                <span class="[font-variant-numeric:tabular-nums] text-ui-sm min-w-[56px] text-right">
                  {formatLineHeight(settings.lineHeight())}
                </span>
              </div>

              <div class="grid grid-cols-[80px_1fr_auto] items-center gap-3.5 text-ui-base text-muted">
                <span class="font-medium">Tracking</span>
                <input
                  type="range"
                  class="w-full [accent-color:var(--color-accent)]"
                  min="-0.02"
                  max="0.1"
                  step="0.005"
                  value={settings.letterSpacing()}
                  onInput={(e) => settings.setLetterSpacing(Number(e.currentTarget.value))}
                />
                <span class="[font-variant-numeric:tabular-nums] text-ui-sm min-w-[56px] text-right">
                  {settings.letterSpacing().toFixed(3)}em
                </span>
              </div>
            </div>
          </Motion.div>
        </Show>
      </Presence>
    </>
  );
};
