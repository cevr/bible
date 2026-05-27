import { Suspense, useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import { useOverlay } from '@/providers/overlay-context';
import { usePreferences, type Preferences } from '@/providers/state-provider';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FONT_FALLBACKS, fontFamilyValue } from '@/data/fonts';

const FONT_FAMILIES = Object.keys(FONT_FALLBACKS);

type FontPrefs = Pick<Preferences, 'fontFamily' | 'fontSize' | 'lineHeight' | 'letterSpacing'>;

const DEFAULTS: FontPrefs = {
  fontFamily: 'Crimson Pro',
  fontSize: 18,
  lineHeight: 1.8,
  letterSpacing: 0.01,
};

function SettingsPanelInner() {
  const { overlay, closeOverlay, openOverlay } = useOverlay();
  const { preferences, set } = usePreferences();

  const isOpen = overlay === 'settings';

  // Draft state — initialized from persisted preferences when the panel opens
  const [draft, setDraft] = useState<FontPrefs>(() => ({
    fontFamily: preferences.fontFamily,
    fontSize: preferences.fontSize,
    lineHeight: preferences.lineHeight,
    letterSpacing: preferences.letterSpacing,
  }));

  // Reset draft when panel opens (preferences may have changed externally)
  useEffect(() => {
    if (isOpen) {
      setDraft({
        fontFamily: preferences.fontFamily,
        fontSize: preferences.fontSize,
        lineHeight: preferences.lineHeight,
        letterSpacing: preferences.letterSpacing,
      });
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps -- only sync on open

  const update = (patch: Partial<FontPrefs>) => {
    setDraft((d) => ({ ...d, ...patch }));
  };

  const save = () => {
    void set(draft);
    closeOverlay();
  };

  const cancel = () => {
    closeOverlay();
  };

  const resetDefaults = () => {
    setDraft(DEFAULTS);
  };

  const isDirty =
    draft.fontFamily !== preferences.fontFamily ||
    draft.fontSize !== preferences.fontSize ||
    draft.lineHeight !== preferences.lineHeight ||
    draft.letterSpacing !== preferences.letterSpacing;

  const isDefault =
    draft.fontFamily === DEFAULTS.fontFamily &&
    draft.fontSize === DEFAULTS.fontSize &&
    draft.lineHeight === DEFAULTS.lineHeight &&
    draft.letterSpacing === DEFAULTS.letterSpacing;

  // Preview style — uses draft values directly instead of CSS vars
  const previewStyle = {
    fontFamily: fontFamilyValue(draft.fontFamily),
    fontSize: `${draft.fontSize}px`,
    lineHeight: draft.lineHeight,
    letterSpacing: `${draft.letterSpacing}em`,
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && cancel()}>
      <DialogContent
        className="top-1/4 translate-y-0 p-0 gap-0 w-full max-w-lg rounded-xl bg-background border border-border overflow-hidden max-h-[70vh] flex flex-col"
        showCloseButton={false}
      >
        <div className="px-4 pt-4 pb-2 border-b border-border shrink-0 flex items-center justify-between">
          <h2 className="font-sans text-lg font-semibold text-foreground">Reading Settings</h2>
          {!isDefault && (
            <button
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={resetDefaults}
            >
              Reset defaults
            </button>
          )}
        </div>

        <div className="p-4 space-y-5">
          {/* Font family */}
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Font
            </label>
            <div className="flex flex-wrap gap-1.5">
              {FONT_FAMILIES.map((font) => (
                <button
                  key={font}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                    draft.fontFamily === font
                      ? 'border-primary bg-primary/10 text-foreground font-medium'
                      : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/20'
                  }`}
                  style={{ fontFamily: font === 'Georgia' ? 'Georgia, serif' : `'${font}'` }}
                  onClick={() => update({ fontFamily: font })}
                >
                  {font}
                </button>
              ))}
            </div>
          </div>

          {/* Font size */}
          <SliderSetting
            label="Font size"
            value={draft.fontSize}
            min={14}
            max={24}
            step={1}
            format={(v) => `${v}px`}
            onChange={(v) => update({ fontSize: v })}
          />

          {/* Line height */}
          <SliderSetting
            label="Line height"
            value={draft.lineHeight}
            min={1.4}
            max={2.2}
            step={0.1}
            format={(v) => v.toFixed(1)}
            onChange={(v) => update({ lineHeight: v })}
          />

          {/* Letter spacing */}
          <SliderSetting
            label="Letter spacing"
            value={draft.letterSpacing}
            min={-0.02}
            max={0.05}
            step={0.01}
            format={(v) => `${v.toFixed(2)}em`}
            onChange={(v) => update({ letterSpacing: v })}
          />

          {/* Preview */}
          <div className="pt-2 border-t border-border">
            <p className="text-muted-foreground text-xs mb-2 font-sans">Preview</p>
            <p className="text-foreground" style={previewStyle}>
              In the beginning God created the heaven and the earth.
            </p>
          </div>
        </div>

        <div className="border-t border-border px-4 py-3 flex items-center justify-between shrink-0">
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
            onClick={() => {
              closeOverlay();
              // Small delay to let settings close before opening export
              requestAnimationFrame(() => openOverlay('export'));
            }}
          >
            <Download className="size-3.5" />
            Export/Import
          </button>
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
              onClick={cancel}
            >
              Cancel
            </button>
            <button
              className="px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded transition-colors disabled:opacity-50 disabled:pointer-events-none"
              onClick={save}
              disabled={!isDirty}
            >
              Save
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SliderSetting({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </label>
        <span className="text-xs tabular-nums text-muted-foreground">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-border rounded-full appearance-none cursor-pointer accent-primary"
      />
    </div>
  );
}

export function SettingsPanel() {
  const { overlay } = useOverlay();
  if (overlay !== 'settings') return null;
  return (
    <Suspense fallback={null}>
      <SettingsPanelInner />
    </Suspense>
  );
}
