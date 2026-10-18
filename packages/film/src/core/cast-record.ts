// A cast member's sheet record (`cast-sheet.json`): what its sheets are
// painted from and every try made of them. The author writes the member's
// pronoun, its scope (the library's, for a person every film shares, or one
// film's own role), the reference images and what each is for, and per kind
// the anchor view and, for poses and heads, the layout and each view's slot;
// the look paragraph is `look.md` beside it. `film concept cast` adds each
// try as it lands: its file, the prompt and references it was drawn from,
// whether the underlay rode along, and what the measure flagged. There is no
// height anywhere in it: a sheet never sets a member's height (the cast
// band does). Pure.

import { Array as Arr, Option, Predicate, Result, Schema } from 'effect';
import { SheetCheck, SheetKind, type SheetOptions, Slot, TURNAROUND_SLOTS } from './cast-sheet.ts';
import { repoJson } from './schema.ts';
import { Segment } from './segment.ts';

/** Where a member's sheet lives: the library (a person every film shares) or one film (its own role). */
const CastScope = Schema.Literals(['library', 'film']);

/** A reference image, by its file in the sheet's folder, and what it is for. */
const CastRef = Schema.Struct({ file: Schema.String, why: Schema.String });

/** A flag as the record keeps it: the check and the views. */
const CastFlag = Schema.Struct({ check: SheetCheck, views: Schema.Array(Schema.Int) });

/** One try of a sheet: its number, its file under the film's `out/`, how it was drawn and what the measure flagged. */
const CastTry = Schema.Struct({
  n: Schema.Int,
  file: Schema.String,
  prompt: Schema.String,
  /** The references it was drawn from, each as the sheet's folder reaches it. */
  refs: Schema.Array(Schema.String),
  /** Whether the underlay rode along as the last reference. */
  underlay: Schema.Boolean,
  /** The try this one draws again, its drift named in the prompt. */
  retryOf: Schema.optionalKey(Schema.Int),
  flags: Schema.Array(CastFlag),
  /** The anchor's squash to the canon, in percent, where it reads. */
  squash: Schema.optionalKey(Schema.Finite),
  at: Schema.String,
});
export type CastTry = typeof CastTry.Type;

/** One kind of sheet of the member: its anchor view, and for poses and heads the layout and the slots. */
const CastSheetOf = Schema.Struct({
  /** The view the rest are held to, 1-based: the one that faces as the kept concept does. */
  anchor: Schema.Int,
  /** The poses or heads, left to right, in words (a turnaround's are the house's six). */
  layout: Schema.optionalKey(Schema.String),
  slots: Schema.optionalKey(Schema.Array(Slot)),
  /** The views whose height is held to the anchor's (a turnaround: all of them). */
  standing: Schema.optionalKey(Schema.Array(Schema.Int)),
  tries: Schema.Array(CastTry),
});
type CastSheetOf = typeof CastSheetOf.Type;

export const CastSheetRecord = Schema.Struct({
  member: Segment,
  scope: CastScope,
  /** How the brief names the member: "Him", "her". */
  who: Schema.String,
  /** A headcloth or a veil: the head is read as its face opening. */
  headgear: Schema.optionalKey(Schema.Boolean),
  refs: Schema.Array(CastRef),
  sheets: Schema.Struct({
    turnaround: Schema.optionalKey(CastSheetOf),
    poses: Schema.optionalKey(CastSheetOf),
    heads: Schema.optionalKey(CastSheetOf),
  }),
});
export type CastSheetRecord = typeof CastSheetRecord.Type;

/** The record as `cast-sheet.json` holds it. */
export const CastSheetJson = repoJson(CastSheetRecord);

/** A kind the record does not set up as asked: no entry, or poses and heads with no layout or slots, or an anchor off the sheet. */
class CastKindUnset extends Schema.TaggedError<CastKindUnset>()('CastKindUnset', {
  member: Schema.String,
  kind: SheetKind,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.member}'s ${this.kind} sheet is not set up: ${this.reason} (cast-sheet.json, sheets.${this.kind})`;
  }
}

/** What one kind of the member's sheet is drawn and measured by: its layout in words and the measure's options. */
export interface CastKindPlan {
  readonly layout: Option.Option<string>;
  readonly options: SheetOptions;
}

/** The kind's plan: a turnaround's six house slots, or a poses or heads sheet's own. */
export const castKindPlan = (
  record: CastSheetRecord,
  kind: SheetKind,
): Result.Result<CastKindPlan, CastKindUnset> => {
  const unset = (reason: string) => CastKindUnset.make({ member: record.member, kind, reason });
  const sheet: Option.Option<CastSheetOf> = Option.fromUndefinedOr(record.sheets[kind]);
  if (Option.isNone(sheet)) return Result.fail(unset('the record has no entry for it'));
  const { anchor, layout, slots, standing } = sheet.value;
  const turnaround = kind === 'turnaround';
  const viewSlots = Option.getOrElse(
    Option.fromUndefinedOr(slots),
    () => (turnaround && TURNAROUND_SLOTS) || [],
  );
  if (!turnaround && (Option.isNone(Option.fromUndefinedOr(layout)) || viewSlots.length === 0))
    return Result.fail(unset("poses and heads name their layout and each view's slot"));
  if (anchor < 1 || anchor > viewSlots.length)
    return Result.fail(unset(`the anchor ${anchor} is not one of its ${viewSlots.length} views`));
  return Result.succeed({
    layout: Option.fromUndefinedOr(layout),
    options: {
      kind,
      count: viewSlots.length,
      anchor,
      slots: viewSlots,
      ...((Predicate.isNotUndefined(standing) && { standing }) || {}),
      headgear: record.headgear === true,
    },
  });
};

/** The number the kind's next try takes. */
export const nextCastTry = (record: CastSheetRecord, kind: SheetKind): number =>
  Option.match(Option.fromUndefinedOr(record.sheets[kind]), {
    onNone: () => 1,
    onSome: (sheet) => Arr.reduce(sheet.tries, 0, (n, t) => Math.max(n, t.n)) + 1,
  });

/** The record with `tried` added to the kind's tries. */
export const withCastTry = (
  record: CastSheetRecord,
  kind: SheetKind,
  tried: CastTry,
): CastSheetRecord =>
  Option.match(Option.fromUndefinedOr(record.sheets[kind]), {
    onNone: () => record,
    onSome: (sheet) => ({
      ...record,
      sheets: { ...record.sheets, [kind]: { ...sheet, tries: [...sheet.tries, tried] } },
    }),
  });
