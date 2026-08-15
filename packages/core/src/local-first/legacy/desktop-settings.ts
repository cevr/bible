import { Option, Predicate, Schema } from 'effect';

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
const ProgressByPath = Schema.Record(Schema.String, Schema.Finite);

const fontSizes = { sm: 14, base: 18, lg: 20, xl: 22, '2xl': 26, '3xl': 32 };
const typefaces = {
  serif: 'crimson-pro',
  sans: 'system-sans',
  mono: 'system-mono',
} satisfies Record<typeof LegacyFontFamily.Type, ReaderTypeface>;

const staleKeys = [
  'readerMode',
  'bibleDrawerStrongs',
  'bibleCommentaryOpen',
  'bibleDrawerWideWidth',
  'inlineCommentary',
];

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
  // oxlint-disable-next-line effect/noUnknownParameters -- legacy snapshot I/O boundary: raw JSON is decoded field-by-field with schemas below
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

  if (!Predicate.isObject(input)) {
    diagnostic('$', 'malformed', 'desktop settings must decode to an object');
    return { commands: [], diagnostics, deviceState: {} };
  }

  const decodeField = <A>(key: string, schema: Schema.ConstraintDecoder<A>): Option.Option<A> => {
    if (!(key in input)) return Option.none();
    const decoded = Schema.decodeUnknownOption(schema)(input[key]);
    if (Option.isSome(decoded)) return decoded;
    diagnostic(key, 'malformed', `ignored invalid ${key}`);
    return Option.none();
  };

  const colorMode = decodeField('theme', LegacyTheme);
  const legacyFontFamily = decodeField('fontFamily', LegacyFontFamily);
  const legacyFontScale = decodeField('fontSize', LegacyFontScale);
  const fontSizePx = Option.map(legacyFontScale, (scale) => fontSizes[scale]);
  const rawLineHeight = decodeField('lineHeight', Schema.Finite);
  let lineHeightRatio = Option.none<number>();
  if (Option.isSome(rawLineHeight)) {
    let ratio = rawLineHeight.value;
    if (ratio > 4) ratio = ratio / Option.getOrElse(fontSizePx, () => 18);
    if (ratio >= 1 && ratio <= 4) lineHeightRatio = Option.some(ratio);
    else diagnostic('lineHeight', 'out-of-range', 'ignored line height outside 1..4');
  }
  const letterSpacingEm = decodeField('letterSpacing', Schema.Finite);
  const measureCh = decodeField('lineWidth', Schema.Int);
  const showStrongs = decodeField('inlineStrongs', Schema.Boolean);
  const showMarginNotes = decodeField('inlineMarginNotes', Schema.Boolean);
  const showCrossReferences = decodeField('inlineCrossRefs', Schema.Boolean);

  const bounded = (
    path: string,
    value: Option.Option<number>,
    minimum: number,
    maximum: number,
  ): Option.Option<number> => {
    if (Option.isNone(value)) return Option.none();
    if (value.value >= minimum && value.value <= maximum) return value;
    diagnostic(path, 'out-of-range', `ignored ${path} outside ${minimum}..${maximum}`);
    return Option.none();
  };

  let readerTypeface = DEFAULT_READING_PREFERENCES.readerTypeface;
  if (Option.isSome(legacyFontFamily)) readerTypeface = typefaces[legacyFontFamily.value];
  const preferences = ReadingPreferences.make({
    colorMode: Option.getOrElse(colorMode, () => DEFAULT_READING_PREFERENCES.colorMode),
    readerTypeface,
    fontSizePx: Option.getOrElse(fontSizePx, () => DEFAULT_READING_PREFERENCES.fontSizePx),
    lineHeightRatio: Option.getOrElse(
      lineHeightRatio,
      () => DEFAULT_READING_PREFERENCES.lineHeightRatio,
    ),
    letterSpacingEm: Option.getOrElse(
      bounded('letterSpacing', letterSpacingEm, -0.02, 0.1),
      () => DEFAULT_READING_PREFERENCES.letterSpacingEm,
    ),
    measureCh: Option.getOrElse(
      bounded('lineWidth', measureCh, 40, 120),
      () => DEFAULT_READING_PREFERENCES.measureCh,
    ),
    showStrongs: Option.getOrElse(showStrongs, () => DEFAULT_READING_PREFERENCES.showStrongs),
    showMarginNotes: Option.getOrElse(
      showMarginNotes,
      () => DEFAULT_READING_PREFERENCES.showMarginNotes,
    ),
    showCrossReferences: Option.getOrElse(
      showCrossReferences,
      () => DEFAULT_READING_PREFERENCES.showCrossReferences,
    ),
    bibleLayout: DEFAULT_READING_PREFERENCES.bibleLayout,
  });

  for (const key of staleKeys) {
    if (key in input) diagnostic(key, 'discarded', `discarded stale desktop setting ${key}`);
  }

  return {
    commands: [{ _tag: 'SetReadingPreferences', preferences }],
    diagnostics,
    deviceState: {
      uiScale: Option.getOrUndefined(decodeField('uiScale', UiScale)),
      recentDocuments: Option.getOrUndefined(decodeField('recentDocuments', RecentDocuments)),
      progressByPath: Option.getOrUndefined(decodeField('progressByPath', ProgressByPath)),
      debugDumpSegments: Option.getOrUndefined(decodeField('debugDumpSegments', Schema.Boolean)),
      bibleDrawerWidth: Option.getOrUndefined(decodeField('bibleDrawerWidth', Schema.Finite)),
      bibleStudyTab: Option.getOrUndefined(decodeField('bibleStudyTab', StudyTab)),
    },
  };
};
