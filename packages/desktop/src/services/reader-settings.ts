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

const WIDTH_MIN = 40;
const WIDTH_MAX = 120;
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

const decodeSettings = Schema.decodeUnknownEffect(Schema.fromJsonString(ReaderSettingsState));
const encodeSettings = Schema.encodeEffect(Schema.fromJsonString(ReaderSettingsState));

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
}

export class ReaderSettings extends Context.Service<ReaderSettings, ReaderSettingsShape>()(
  'reader/services/ReaderSettings',
) {
  static layer = Layer.effect(
    ReaderSettings,
    Effect.gen(function* () {
      const storage = yield* SettingsStorage;

      const stored = yield* storage.read;
      const loaded = Option.isSome(stored)
        ? yield* decodeSettings(stored.value).pipe(Effect.orElseSucceed(() => initial))
        : initial;

      const ref = yield* Ref.make<ReaderSettingsState>(loaded);
      const pending = yield* Ref.make<Option.Option<Fiber.Fiber<void>>>(Option.none());
      const layerScope = yield* Effect.scope;

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
          ...overrides,
        };
      }),
    );
}
