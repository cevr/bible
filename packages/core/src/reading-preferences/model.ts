import { Schema } from 'effect';

export const ColorMode = Schema.Literals(['system', 'light', 'sepia', 'dark']);
export type ColorMode = typeof ColorMode.Type;

export const ReaderTypeface = Schema.Literals([
  'crimson-pro',
  'lora',
  'literata',
  'eb-garamond',
  'source-sans-3',
  'georgia',
  'system-serif',
  'system-sans',
  'system-mono',
]);
export type ReaderTypeface = typeof ReaderTypeface.Type;

export const FontSizePx = Schema.Number.pipe(
  Schema.check(Schema.isFinite(), Schema.isBetween({ minimum: 14, maximum: 32 })),
);
export const LineHeightRatio = Schema.Number.pipe(
  Schema.check(Schema.isFinite(), Schema.isBetween({ minimum: 1, maximum: 4 })),
);
export const LetterSpacingEm = Schema.Number.pipe(
  Schema.check(Schema.isFinite(), Schema.isBetween({ minimum: -0.02, maximum: 0.1 })),
);
export const MeasureCh = Schema.Number.pipe(
  Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 40, maximum: 120 })),
);
export const BibleLayout = Schema.Literals(['verse', 'paragraph']);

export class ReadingPreferences extends Schema.Class<ReadingPreferences>('ReadingPreferences')({
  colorMode: ColorMode,
  readerTypeface: ReaderTypeface,
  fontSizePx: FontSizePx,
  lineHeightRatio: LineHeightRatio,
  letterSpacingEm: LetterSpacingEm,
  measureCh: MeasureCh,
  bibleLayout: BibleLayout,
  showStrongs: Schema.Boolean,
  showMarginNotes: Schema.Boolean,
  showCrossReferences: Schema.Boolean,
}) {}

const patchFields = {
  colorMode: Schema.optional(ColorMode),
  readerTypeface: Schema.optional(ReaderTypeface),
  fontSizePx: Schema.optional(FontSizePx),
  lineHeightRatio: Schema.optional(LineHeightRatio),
  letterSpacingEm: Schema.optional(LetterSpacingEm),
  measureCh: Schema.optional(MeasureCh),
  bibleLayout: Schema.optional(BibleLayout),
  showStrongs: Schema.optional(Schema.Boolean),
  showMarginNotes: Schema.optional(Schema.Boolean),
  showCrossReferences: Schema.optional(Schema.Boolean),
} as const;

export const ReadingPreferencesPatch = Schema.Struct(patchFields).pipe(
  Schema.check(
    Schema.makeFilter((patch) =>
      Object.values(patch).some((value) => value !== undefined)
        ? undefined
        : 'a reading preferences patch must set at least one field',
    ),
  ),
);
export type ReadingPreferencesPatch = typeof ReadingPreferencesPatch.Type;

export const PatchReadingPreferences = Schema.TaggedStruct('PatchReadingPreferences', {
  patch: ReadingPreferencesPatch,
});
export type PatchReadingPreferences = typeof PatchReadingPreferences.Type;

export const DEFAULT_READING_PREFERENCES = new ReadingPreferences({
  colorMode: 'system',
  readerTypeface: 'crimson-pro',
  fontSizePx: 18,
  lineHeightRatio: 1.8,
  letterSpacingEm: 0,
  measureCh: 68,
  bibleLayout: 'verse',
  showStrongs: true,
  showMarginNotes: true,
  showCrossReferences: true,
});
