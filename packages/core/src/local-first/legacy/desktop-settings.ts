import { Option, Schema } from 'effect';

import {
  DEFAULT_READING_PREFERENCES,
  ReadingPreferences,
  type ReaderTypeface,
} from '../../reading-preferences/model.js';
import type { DomainMutationCommand } from '../model.js';
import type { MigrationDiagnostic, MigrationDiagnosticId } from '../legacy-migration.js';

const LegacyTheme = Schema.Literals(['system', 'light', 'sepia', 'dark']);
const LegacyFontFamily = Schema.Literals(['serif', 'sans', 'mono']);
const LegacyFontScale = Schema.Literals(['sm', 'base', 'lg', 'xl', '2xl', '3xl']);
const UiScale = Schema.Literals(['sm', 'md', 'lg', 'xl']);
const StudyTab = Schema.Literals(['notes', 'xrefs', 'words', 'egw']);
const RecentDocuments = Schema.Array(
  Schema.Struct({ path: Schema.String, title: Schema.optionalKey(Schema.String) }),
);
const ProgressByPath = Schema.Record(Schema.String, Schema.Number);

const fontSizes = { sm: 14, base: 18, lg: 20, xl: 22, '2xl': 26, '3xl': 32 } as const;
const typefaces: Record<typeof LegacyFontFamily.Type, ReaderTypeface> = {
  serif: 'crimson-pro',
  sans: 'system-sans',
  mono: 'system-mono',
};

const staleKeys = [
  'readerMode',
  'bibleDrawerStrongs',
  'bibleCommentaryOpen',
  'bibleDrawerWideWidth',
  'inlineCommentary',
] as const;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export interface DesktopDeviceStateProjection {
  readonly uiScale?: typeof UiScale.Type;
  readonly recentDocuments?: typeof RecentDocuments.Type;
  readonly progressByPath?: typeof ProgressByPath.Type;
  readonly debugDumpSegments?: boolean;
  readonly bibleDrawerWidth?: number;
  readonly bibleStudyTab?: typeof StudyTab.Type;
}

export interface DesktopSettingsProjection {
  readonly commands: ReadonlyArray<DomainMutationCommand>;
  readonly diagnostics: ReadonlyArray<MigrationDiagnostic>;
  readonly deviceState: DesktopDeviceStateProjection;
}

export interface DesktopSettingsProjectionOptions {
  readonly nextDiagnosticId: (path: string) => MigrationDiagnosticId;
}

export const projectDesktopSettings = (
  input: unknown,
  options: DesktopSettingsProjectionOptions,
): DesktopSettingsProjection => {
  const diagnostics: Array<MigrationDiagnostic> = [];
  const diagnostic = (
    path: string,
    category: MigrationDiagnostic['category'],
    message: string,
  ): void => {
    diagnostics.push({ id: options.nextDiagnosticId(path), path, category, message });
  };

  if (!isRecord(input)) {
    diagnostic('$', 'malformed', 'desktop settings must decode to an object');
    return { commands: [], diagnostics, deviceState: {} };
  }

  const decodeField = <A>(key: string, schema: Schema.ConstraintDecoder<A>): A | undefined => {
    if (!(key in input)) return undefined;
    const decoded = Schema.decodeUnknownOption(schema)(input[key]);
    if (Option.isSome(decoded)) return decoded.value;
    diagnostic(key, 'malformed', `ignored invalid ${key}`);
    return undefined;
  };

  const colorMode = decodeField('theme', LegacyTheme);
  const legacyFontFamily = decodeField('fontFamily', LegacyFontFamily);
  const legacyFontScale = decodeField('fontSize', LegacyFontScale);
  let fontSizePx: number | undefined;
  if (legacyFontScale !== undefined) fontSizePx = fontSizes[legacyFontScale];
  const rawLineHeight = decodeField('lineHeight', Schema.Number);
  let lineHeightRatio: number | undefined;
  if (rawLineHeight !== undefined) {
    let ratio = rawLineHeight;
    if (rawLineHeight > 4) ratio = rawLineHeight / (fontSizePx ?? 18);
    if (ratio >= 1 && ratio <= 4) lineHeightRatio = ratio;
    else diagnostic('lineHeight', 'out-of-range', 'ignored line height outside 1..4');
  }
  const letterSpacingEm = decodeField('letterSpacing', Schema.Number);
  const measureCh = decodeField('lineWidth', Schema.Int);
  const showStrongs = decodeField('inlineStrongs', Schema.Boolean);
  const showMarginNotes = decodeField('inlineMarginNotes', Schema.Boolean);
  const showCrossReferences = decodeField('inlineCrossRefs', Schema.Boolean);

  const bounded = (path: string, value: number | undefined, minimum: number, maximum: number) => {
    if (value === undefined) return undefined;
    if (value >= minimum && value <= maximum) return value;
    diagnostic(path, 'out-of-range', `ignored ${path} outside ${minimum}..${maximum}`);
    return undefined;
  };

  let readerTypeface = DEFAULT_READING_PREFERENCES.readerTypeface;
  if (legacyFontFamily !== undefined) readerTypeface = typefaces[legacyFontFamily];
  const preferences = new ReadingPreferences({
    colorMode: colorMode ?? DEFAULT_READING_PREFERENCES.colorMode,
    readerTypeface,
    fontSizePx: fontSizePx ?? DEFAULT_READING_PREFERENCES.fontSizePx,
    lineHeightRatio: lineHeightRatio ?? DEFAULT_READING_PREFERENCES.lineHeightRatio,
    letterSpacingEm:
      bounded('letterSpacing', letterSpacingEm, -0.02, 0.1) ??
      DEFAULT_READING_PREFERENCES.letterSpacingEm,
    measureCh: bounded('lineWidth', measureCh, 40, 120) ?? DEFAULT_READING_PREFERENCES.measureCh,
    showStrongs: showStrongs ?? DEFAULT_READING_PREFERENCES.showStrongs,
    showMarginNotes: showMarginNotes ?? DEFAULT_READING_PREFERENCES.showMarginNotes,
    showCrossReferences: showCrossReferences ?? DEFAULT_READING_PREFERENCES.showCrossReferences,
    bibleLayout: DEFAULT_READING_PREFERENCES.bibleLayout,
  });

  for (const key of staleKeys) {
    if (key in input) diagnostic(key, 'discarded', `discarded stale desktop setting ${key}`);
  }

  return {
    commands: [{ _tag: 'SetReadingPreferences', preferences }],
    diagnostics,
    deviceState: {
      uiScale: decodeField('uiScale', UiScale),
      recentDocuments: decodeField('recentDocuments', RecentDocuments),
      progressByPath: decodeField('progressByPath', ProgressByPath),
      debugDumpSegments: decodeField('debugDumpSegments', Schema.Boolean),
      bibleDrawerWidth: decodeField('bibleDrawerWidth', Schema.Number),
      bibleStudyTab: decodeField('bibleStudyTab', StudyTab),
    },
  };
};
