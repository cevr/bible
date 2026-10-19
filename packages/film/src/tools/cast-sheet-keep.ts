// A cast sheet kept (`film concept keep`), on the owner's answer: the try
// he chose copied into the member's folder as `kept/<kind>.png`, each view
// cut from it at 1:1 as `views/<name>.png` (the source a rig view is traced
// from and its match held to), cut on white as the measure reads the sheet
// (the trace and the match read colour, and a sheet painted with no paper is
// transparent round the figures; `kept/<kind>.png` keeps the try's bytes as
// drawn), and the keep recorded in `cast-sheet.json`
// with his why and the ask he answered. Both folders are committed beside the
// record: a lock's source survives a clean checkout. A kind already kept is
// refused (`SheetKept`): a kept sheet sets the member's look for every film
// that draws him, so it is never drawn again; a missing view is an addition.

import { Effect, FileSystem, Option, Path, Result, Schema } from 'effect';
import {
  castKindPlan,
  type CastKept,
  CastSheetJson,
  type CastSheetRecord,
  viewName,
  withCastKept,
} from '../core/cast-record.ts';
import { measureSheet, SheetKind } from '../core/cast-sheet.ts';
import { opaqueOf } from '../core/cast-sheet-pixels.ts';
import { cropRaster } from '../core/raster.ts';
import { Segment } from '../core/segment.ts';
import { ContentStore } from './content-store.ts';
import { decodePng, encodePng } from './png.ts';

/** A kind kept already, or a try the record does not hold, or one whose image no longer reads as its sheet. */
class SheetKept extends Schema.TaggedError<SheetKept>()('SheetKept', {
  member: Schema.String,
  kind: SheetKind,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.member}'s ${this.kind} sheet is not kept: ${this.reason}`;
  }
}

/** What the owner chose: the kind, the try, his why and the ask he answered it on. */
interface CastKeep {
  readonly kind: SheetKind;
  readonly n: number;
  readonly why: string;
  readonly ask: Option.Option<string>;
}

/** Keep try `keep.n` of the member's `keep.kind` sheet: its image and views into the folder, the keep into the record. */
export const keepCastSheet = Effect.fn('Cast.keep')(function* (
  place: { readonly folder: string; readonly out: string },
  keep: CastKeep,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const store = yield* ContentStore;
  const file = path.join(place.folder, 'cast-sheet.json');
  return yield* store.transact({ file, codec: CastSheetJson, empty: emptyRecord }, (record) =>
    Effect.gen(function* () {
      const refused = (reason: string) =>
        SheetKept.make({ member: record.member, kind: keep.kind, reason });
      if (Option.isSome(Option.fromUndefinedOr(record.kept?.[keep.kind])))
        return yield* refused(
          'it is kept already: a kept sheet is never drawn again; draw a missing view as an addition',
        );
      const plan = yield* Effect.fromResult(castKindPlan(record, keep.kind));
      const tried = yield* Effect.fromOption(
        Option.fromUndefinedOr(record.sheets[keep.kind]?.tries.find((t) => t.n === keep.n)),
      ).pipe(Effect.mapError(() => refused(`the record holds no try ${keep.n}`)));
      const bytes = yield* fs.readFile(path.join(place.out, tried.file));
      const sheet = yield* Effect.fromResult(decodePng(bytes));
      const opaque = opaqueOf(sheet);
      const m = yield* Effect.fromResult(
        Result.mapError(measureSheet(sheet, plan.options), (e) => refused(e.message)),
      );
      const views = m.views.map((v) => ({
        view: v.view,
        name: viewName(keep.kind, v.view),
        box: v.box,
      }));
      yield* fs.makeDirectory(path.join(place.folder, 'kept'), { recursive: true });
      yield* fs.makeDirectory(path.join(place.folder, 'views'), { recursive: true });
      yield* fs.writeFile(path.join(place.folder, 'kept', `${keep.kind}.png`), bytes);
      yield* Effect.forEach(views, (v) =>
        fs.writeFile(
          path.join(place.folder, 'views', `${v.name}.png`),
          encodePng(cropRaster(opaque, v.box)),
        ),
      );
      const kept: CastKept = {
        try: keep.n,
        why: keep.why,
        ...Option.match(keep.ask, { onNone: () => ({}), onSome: (ask) => ({ ask }) }),
        views,
      };
      return [kept, withCastKept(record, keep.kind, kept)] as const;
    }),
  );
});

/** A missing record reads as one with no sheets, so its keep is refused before anything is written. */
const emptyRecord: CastSheetRecord = {
  member: Segment.make('unrecorded'),
  scope: 'film',
  who: '',
  refs: [],
  sheets: {},
};
