import { Context, Effect, Fiber, Layer, Option, Ref, Schema } from 'effect';
import { SettingsStorage } from './settings-storage.js';

export const Theme = Schema.Literals(['light', 'sepia', 'dark']);
export type Theme = typeof Theme.Type;

export const FontFamily = Schema.Literals(['serif', 'sans', 'mono']);
export type FontFamily = typeof FontFamily.Type;

export const UiScale = Schema.Literals(['sm', 'md', 'lg', 'xl']);
export type UiScale = typeof UiScale.Type;

/** Reader text size as a discrete scale (tailwind-ish: sm, base, lg, xl, 2xl, 3xl). */
export const ReaderFontScale = Schema.Literals(['sm', 'base', 'lg', 'xl', '2xl', '3xl']);
export type ReaderFontScale = typeof ReaderFontScale.Type;

/** Top-level reader mode. `egw` = EGW books are the main canvas (Bible drawer
 *  on the right); `bible` = Bible chapters are the main canvas. Persisted
 *  across launches. */
export const ReaderMode = Schema.Literals(['egw', 'bible']);
export type ReaderMode = typeof ReaderMode.Type;

/** Active tab in the right-side study drawer. Restored on launch so the user
 *  lands on whichever surface they were last studying with. */
export const BibleStudyTab = Schema.Literals(['notes', 'xrefs', 'words', 'egw']);
export type BibleStudyTab = typeof BibleStudyTab.Type;

const WIDTH_MIN = 40;
const WIDTH_MAX = 120;
const BIBLE_DRAWER_WIDTH_MIN = 320;
const BIBLE_DRAWER_WIDTH_MAX = 720;
const BIBLE_DRAWER_WIDTH_DEFAULT = 420;
// Line-height interpretation switches on magnitude (CSS convention):
//   [0, 2]  → unitless multiplier (relative to font-size)
//   (2, _]  → px value (absolute)
// The slider walks both ranges, and the CSS-var emitter picks the unit.
const LINE_HEIGHT_MIN = 1.0;
const LINE_HEIGHT_MAX = 60;
const LETTER_SPACING_MIN = -0.02;
const LETTER_SPACING_MAX = 0.1;
const RECENT_DOCS_CAP = 8;

export const RecentDocument = Schema.Struct({
  path: Schema.String,
  title: Schema.optionalKey(Schema.String),
});
export type RecentDocument = typeof RecentDocument.Type;

export const ReaderSettingsState = Schema.Struct({
  theme: Theme,
  fontFamily: FontFamily,
  fontSize: ReaderFontScale,
  lineHeight: Schema.Number.check(
    Schema.isBetween({ minimum: LINE_HEIGHT_MIN, maximum: LINE_HEIGHT_MAX }),
  ),
  letterSpacing: Schema.Number.check(
    Schema.isBetween({ minimum: LETTER_SPACING_MIN, maximum: LETTER_SPACING_MAX }),
  ),
  lineWidth: Schema.Number.check(Schema.isBetween({ minimum: WIDTH_MIN, maximum: WIDTH_MAX })),
  uiScale: Schema.optional(UiScale),
  recentDocuments: Schema.Array(RecentDocument),
  /** Reading progress per path: a fraction in [0, 1]. Stored as percent so it
   *  stays meaningful across font/width changes — pixel Y would point at a
   *  different paragraph after re-flowing. */
  progressByPath: Schema.Record(Schema.String, Schema.Number),
  debugDumpSegments: Schema.Boolean,
  /** Width of the right-side Bible drawer in px. User-resizable via the drag
   *  handle on the drawer's left edge. */
  bibleDrawerWidth: Schema.optional(
    Schema.Number.check(
      Schema.isBetween({ minimum: BIBLE_DRAWER_WIDTH_MIN, maximum: BIBLE_DRAWER_WIDTH_MAX }),
    ),
  ),
  /** Last-used tab in the right-side study drawer. Restored on launch so the
   *  user lands on the same surface they were last studying with. */
  bibleStudyTab: Schema.optional(BibleStudyTab),
  /** Last-used reader mode. Restored on launch so the user lands in the same
   *  mode they left in. */
  readerMode: Schema.optional(ReaderMode),
  /** Per-overlay toggle state for the floating Bible reader toolbar. Each
   *  flag drives whether the chapter renderer paints its inline marker /
   *  annotation layer. All optional so a fresh launch (no stored settings)
   *  falls back to the defaults seeded in app.tsx. */
  inlineStrongs: Schema.optional(Schema.Boolean),
  inlineMarginNotes: Schema.optional(Schema.Boolean),
  inlineCrossRefs: Schema.optional(Schema.Boolean),
});
export type ReaderSettingsState = typeof ReaderSettingsState.Type;

const initial: ReaderSettingsState = {
  theme: 'light',
  fontFamily: 'serif',
  fontSize: 'base',
  lineHeight: 1.55,
  letterSpacing: 0,
  lineWidth: 68,
  uiScale: 'md',
  recentDocuments: [],
  progressByPath: {},
  debugDumpSegments: false,
};

const PERSIST_DEBOUNCE_MS = 250;

const clamp = (min: number, max: number) => (n: number) => Math.max(min, Math.min(max, n));
const clampWidth = clamp(WIDTH_MIN, WIDTH_MAX);
const clampLineHeight = clamp(LINE_HEIGHT_MIN, LINE_HEIGHT_MAX);
const clampLetterSpacing = clamp(LETTER_SPACING_MIN, LETTER_SPACING_MAX);
const clampPercent = clamp(0, 1);
const clampBibleDrawerWidth = clamp(BIBLE_DRAWER_WIDTH_MIN, BIBLE_DRAWER_WIDTH_MAX);

export const BIBLE_DRAWER_WIDTH_BOUNDS = {
  min: BIBLE_DRAWER_WIDTH_MIN,
  max: BIBLE_DRAWER_WIDTH_MAX,
  default: BIBLE_DRAWER_WIDTH_DEFAULT,
} as const;

const decodeSettings = Schema.decodeUnknownEffect(Schema.fromJsonString(ReaderSettingsState));
const encodeSettings = Schema.encodeEffect(Schema.fromJsonString(ReaderSettingsState));

// Keys that lived on `ReaderSettingsState` in earlier builds and are now gone.
// Effect Schema strips unknown keys silently on decode, so a user upgrading
// from the old build would never know their stale state was discarded. We
// strip them explicitly *before* decode, then log once so the migration is
// visible in dev tools / log capture.
const STALE_SETTINGS_KEYS = [
  'bibleDrawerStrongs',
  'bibleCommentaryOpen',
  'bibleDrawerWideWidth',
  'inlineCommentary',
] as const;

interface MigratedSettings {
  readonly cleaned: string;
  readonly dropped: ReadonlyArray<string>;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const migrateStaleKeys = (raw: string): MigratedSettings => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { cleaned: raw, dropped: [] };
  }
  if (!isPlainObject(parsed)) {
    return { cleaned: raw, dropped: [] };
  }
  const dropped: string[] = [];
  for (const key of STALE_SETTINGS_KEYS) {
    if (key in parsed) {
      delete parsed[key];
      dropped.push(key);
    }
  }
  if (dropped.length === 0) return { cleaned: raw, dropped: [] };
  return { cleaned: JSON.stringify(parsed), dropped };
};

const pushRecent = (
  recents: ReadonlyArray<RecentDocument>,
  path: string,
  title: string | undefined,
): ReadonlyArray<RecentDocument> => {
  const deduped = recents.filter((r) => r.path !== path);
  // Preserve a previously-known title if the new touch doesn't carry one.
  const previousTitle = recents.find((r) => r.path === path)?.title;
  const entry: RecentDocument = {
    path,
    ...((title ?? previousTitle) !== undefined ? { title: title ?? previousTitle } : {}),
  };
  return [entry, ...deduped].slice(0, RECENT_DOCS_CAP);
};

const dropRecent = (
  recents: ReadonlyArray<RecentDocument>,
  path: string,
): ReadonlyArray<RecentDocument> => recents.filter((r) => r.path !== path);

const withoutKey = (map: Readonly<Record<string, number>>, key: string): Record<string, number> => {
  const { [key]: _omit, ...rest } = map;
  return rest;
};

export interface ReaderSettingsShape {
  readonly get: Effect.Effect<ReaderSettingsState>;
  readonly setTheme: (theme: Theme) => Effect.Effect<void>;
  readonly setFontFamily: (family: FontFamily) => Effect.Effect<void>;
  readonly setFontSize: (scale: ReaderFontScale) => Effect.Effect<void>;
  readonly setLineHeight: (n: number) => Effect.Effect<void>;
  readonly setLetterSpacing: (em: number) => Effect.Effect<void>;
  readonly setLineWidth: (chars: number) => Effect.Effect<void>;
  readonly setUiScale: (scale: UiScale) => Effect.Effect<void>;
  /** Promote a path to the front of the recent-documents list (cap 8).
   *  Pass `title` when known so the recents list can show it instead of the
   *  filename. Re-touching without a title preserves the previously-known one. */
  readonly touchRecentDocument: (path: string, title?: string) => Effect.Effect<void>;
  /** Remove a path from recents AND wipe its stored reading progress. */
  readonly forgetDocument: (path: string) => Effect.Effect<void>;
  readonly setProgressForPath: (path: string, fraction: number) => Effect.Effect<void>;
  readonly setDebugDumpSegments: (enabled: boolean) => Effect.Effect<void>;
  readonly setBibleDrawerWidth: (px: number) => Effect.Effect<void>;
  readonly setBibleStudyTab: (tab: BibleStudyTab) => Effect.Effect<void>;
  readonly setReaderMode: (mode: ReaderMode) => Effect.Effect<void>;
  readonly setInlineStrongs: (enabled: boolean) => Effect.Effect<void>;
  readonly setInlineMarginNotes: (enabled: boolean) => Effect.Effect<void>;
  readonly setInlineCrossRefs: (enabled: boolean) => Effect.Effect<void>;
}

export class ReaderSettings extends Context.Service<ReaderSettings, ReaderSettingsShape>()(
  'reader/services/ReaderSettings',
) {
  static layer = Layer.effect(
    ReaderSettings,
    Effect.gen(function* () {
      const storage = yield* SettingsStorage;

      const stored = yield* storage.read;
      const migration = Option.isSome(stored)
        ? migrateStaleKeys(stored.value)
        : { cleaned: '', dropped: [] as ReadonlyArray<string> };
      const loaded = Option.isSome(stored)
        ? yield* decodeSettings(migration.cleaned).pipe(Effect.orElseSucceed(() => initial))
        : initial;
      const migrationDropped = migration.dropped;

      const ref = yield* Ref.make<ReaderSettingsState>(loaded);
      const pending = yield* Ref.make<Option.Option<Fiber.Fiber<void>>>(Option.none());
      const layerScope = yield* Effect.scope;

      if (migrationDropped.length > 0) {
        yield* Effect.logInfo(
          `[ReaderSettings] dropped stale keys: ${migrationDropped.join(', ')}`,
        );
        // Re-persist immediately so the migration doesn't replay on every
        // launch. Bypasses the debounce since there's no incoming user input
        // to coalesce with.
        const json = yield* encodeSettings(loaded).pipe(Effect.orElseSucceed(() => ''));
        if (json !== '') yield* storage.write(json);
      }

      const schedulePersist = Effect.gen(function* () {
        const prev = yield* Ref.getAndSet(pending, Option.none<Fiber.Fiber<void>>());
        if (Option.isSome(prev)) yield* Fiber.interrupt(prev.value);
        const fiber = yield* Effect.gen(function* () {
          yield* Effect.sleep(`${PERSIST_DEBOUNCE_MS} millis`);
          const snapshot = yield* Ref.get(ref);
          const json = yield* encodeSettings(snapshot).pipe(Effect.orElseSucceed(() => ''));
          if (json !== '') yield* storage.write(json);
        }).pipe(Effect.forkIn(layerScope));
        yield* Ref.set(pending, Option.some(fiber));
      });

      const update = (f: (s: ReaderSettingsState) => ReaderSettingsState) =>
        Ref.update(ref, f).pipe(Effect.andThen(schedulePersist));

      return {
        get: Ref.get(ref),
        setTheme: (theme) => update((s) => ({ ...s, theme })),
        setFontFamily: (fontFamily) => update((s) => ({ ...s, fontFamily })),
        setFontSize: (fontSize) => update((s) => ({ ...s, fontSize })),
        setLineHeight: (n) => update((s) => ({ ...s, lineHeight: clampLineHeight(n) })),
        setLetterSpacing: (em) => update((s) => ({ ...s, letterSpacing: clampLetterSpacing(em) })),
        setLineWidth: (chars) => update((s) => ({ ...s, lineWidth: clampWidth(chars) })),
        setUiScale: (uiScale) => update((s) => ({ ...s, uiScale })),
        touchRecentDocument: (path, title) =>
          update((s) => ({ ...s, recentDocuments: pushRecent(s.recentDocuments, path, title) })),
        forgetDocument: (path) =>
          update((s) => ({
            ...s,
            recentDocuments: dropRecent(s.recentDocuments, path),
            progressByPath: withoutKey(s.progressByPath, path),
          })),
        setProgressForPath: (path, fraction) =>
          update((s) => ({
            ...s,
            progressByPath: { ...s.progressByPath, [path]: clampPercent(fraction) },
          })),
        setDebugDumpSegments: (enabled) => update((s) => ({ ...s, debugDumpSegments: enabled })),
        setBibleDrawerWidth: (px) =>
          update((s) => ({ ...s, bibleDrawerWidth: clampBibleDrawerWidth(px) })),
        setBibleStudyTab: (bibleStudyTab) => update((s) => ({ ...s, bibleStudyTab })),
        setReaderMode: (readerMode) => update((s) => ({ ...s, readerMode })),
        setInlineStrongs: (enabled) => update((s) => ({ ...s, inlineStrongs: enabled })),
        setInlineMarginNotes: (enabled) => update((s) => ({ ...s, inlineMarginNotes: enabled })),
        setInlineCrossRefs: (enabled) => update((s) => ({ ...s, inlineCrossRefs: enabled })),
      };
    }),
  );

  /**
   * In-memory test layer. Uses a real Ref so round-trip semantics match the
   * production layer; skips disk I/O. Pass overrides to stub specific methods.
   */
  static layerTest = (overrides: Partial<ReaderSettingsShape> = {}) =>
    Layer.effect(
      ReaderSettings,
      Effect.gen(function* () {
        const ref = yield* Ref.make<ReaderSettingsState>(initial);
        const update = (f: (s: ReaderSettingsState) => ReaderSettingsState) => Ref.update(ref, f);
        return {
          get: Ref.get(ref),
          setTheme: (theme) => update((s) => ({ ...s, theme })),
          setFontFamily: (fontFamily) => update((s) => ({ ...s, fontFamily })),
          setFontSize: (fontSize) => update((s) => ({ ...s, fontSize })),
          setLineHeight: (n) => update((s) => ({ ...s, lineHeight: clampLineHeight(n) })),
          setLetterSpacing: (em) =>
            update((s) => ({ ...s, letterSpacing: clampLetterSpacing(em) })),
          setLineWidth: (chars) => update((s) => ({ ...s, lineWidth: clampWidth(chars) })),
          setUiScale: (uiScale) => update((s) => ({ ...s, uiScale })),
          touchRecentDocument: (path, title) =>
            update((s) => ({ ...s, recentDocuments: pushRecent(s.recentDocuments, path, title) })),
          forgetDocument: (path) =>
            update((s) => ({
              ...s,
              recentDocuments: dropRecent(s.recentDocuments, path),
              progressByPath: withoutKey(s.progressByPath, path),
            })),
          setProgressForPath: (path, fraction) =>
            update((s) => ({
              ...s,
              progressByPath: { ...s.progressByPath, [path]: clampPercent(fraction) },
            })),
          setDebugDumpSegments: (enabled) => update((s) => ({ ...s, debugDumpSegments: enabled })),
          setBibleDrawerWidth: (px) =>
            update((s) => ({ ...s, bibleDrawerWidth: clampBibleDrawerWidth(px) })),
          setBibleStudyTab: (bibleStudyTab) => update((s) => ({ ...s, bibleStudyTab })),
          setReaderMode: (readerMode) => update((s) => ({ ...s, readerMode })),
          setInlineStrongs: (enabled) => update((s) => ({ ...s, inlineStrongs: enabled })),
          setInlineMarginNotes: (enabled) => update((s) => ({ ...s, inlineMarginNotes: enabled })),
          setInlineCrossRefs: (enabled) => update((s) => ({ ...s, inlineCrossRefs: enabled })),
          ...overrides,
        };
      }),
    );
}
