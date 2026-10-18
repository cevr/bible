// A cast sheet try's critique (`film concept critique`): each view the
// record holds to a kept concept, cut from the try at 1:1 beside the
// concept's crop, shown to a fresh model with the measure's flags on that
// view (`Critic.critiqueSheet`). The owner's rule (2026-10-18): a figure is
// critiqued before it is put to him, and every finding is fixed or answered.
// A view no concept faces is said, never critiqued against another's. Each
// view goes with what the layout asks of it (its numbered clause, after the
// words its group shares), so the critic holds its angle and gesture to the
// layout, not the concept. The crops and each view's findings land in
// `out/<film>/cast/<member>/critique/<kind>-<n>/`, its answers kept by their
// hash in `critique/` beside it.

import { Array as Arr, Effect, FileSystem, Option, Path, Result, Schema } from 'effect';
import { castKindPlan, CastSheetJson } from '../core/cast-record.ts';
import { measureSheet, type SheetKind, type SheetMeasure } from '../core/cast-sheet.ts';
import { cropRaster } from '../core/raster.ts';
import { turnaroundLayout } from './cast-sheet-brief.ts';
import { conceptsOf } from './cast-sheet-make.ts';
import { Critic, type CritiqueTaken } from './critique.ts';
import { FileInvalid } from './errors.ts';
import { decodePng, encodePng } from './png.ts';

/** A try the record does not hold, or whose image does not read as its sheet. */
class CastTryUnknown extends Schema.TaggedError<CastTryUnknown>()('CastTryUnknown', {
  member: Schema.String,
  kind: Schema.String,
  n: Schema.Int,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.member}'s ${this.kind} try ${this.n} cannot be critiqued: ${this.reason}`;
  }
}

/** A layout's numbered clauses ("…: one, …; two, …"), by the view they name. */
const ORDINALS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'] as const;

/** A sentence's head that names a group of views ("One to three are turned …"), whose words each of its clauses shares. */
const GROUP = new RegExp(
  `^(?:${ORDINALS.join('|')})\\s+(?:to|and)\\s+(?:${ORDINALS.join('|')})\\b`,
  'i',
);

/** The words a clause at `at` shares with its group: the head of its sentence, up to the colon, when that head names a group of views; else none. */
const groupOf = (layout: string, at: number): string => {
  const head =
    layout
      .slice(layout.lastIndexOf('. ', at) + 1, at)
      .split(':')[0]
      ?.trim() ?? '';
  return (GROUP.test(head) && `${head}: `) || '';
};

/** What `layout` asks of `view`: its numbered clause after the words its group shares, or the whole layout when it numbers none for it. */
const askedOf = (layout: string, view: number): string =>
  Option.getOrElse(
    Option.flatMap(Arr.get(ORDINALS, view - 1), (word) =>
      Option.flatMap(
        Option.fromNullishOr(
          new RegExp(`(?:^|[:;]\\s*)${word},\\s*([^;]*?)\\s*(?=;|\\.(?:\\s|$))`, 'i').exec(layout),
        ),
        (found) =>
          Option.map(
            Option.fromUndefinedOr(found[1]),
            (clause) => groupOf(layout, found.index) + clause,
          ),
      ),
    ),
    () => `the sheet's whole layout, which numbers no clause for it: ${layout}`,
  );

/** The measure's flags on one view, as its lines say them. */
const flaggedOn = (m: SheetMeasure, view: number): ReadonlyArray<string> =>
  m.flags
    .filter((f) => f.views.includes(view))
    .map((f) => `${f.check} (views ${f.views.join(', ')}): ${f.note}`);

/** What a critique of a try answers: its taken findings, and each view no concept faces. */
interface CastCritique {
  readonly taken: CritiqueTaken;
  readonly unpaired: ReadonlyArray<number>;
}

/** Critique try `n` of the member's `kind` sheet: each view a kept concept faces, against that concept. */
export const critiqueCastTry = Effect.fn('Cast.critique')(function* (
  place: { readonly folder: string; readonly out: string },
  kind: SheetKind,
  n: number,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const text = yield* fs.readFileString(path.join(place.folder, 'cast-sheet.json'));
  const record = yield* Effect.fromResult(
    Result.mapError(Schema.decodeResult(CastSheetJson)(text), (e) =>
      FileInvalid.make({ file: 'cast-sheet.json', reason: e.message }),
    ),
  );
  const unknown = (reason: string) =>
    CastTryUnknown.make({ member: record.member, kind, n, reason });
  const plan = yield* Effect.fromResult(castKindPlan(record, kind));
  const tried = yield* Effect.fromOption(
    Arr.findFirst(record.sheets[kind]?.tries ?? [], (t) => t.n === n),
  ).pipe(Effect.mapError(() => unknown('the record holds no such try')));
  const sheet = yield* Effect.fromResult(
    decodePng(yield* fs.readFile(path.join(place.out, tried.file))),
  );
  const options = { ...plan.options, concepts: yield* conceptsOf(place, plan) };
  const m = yield* Effect.fromResult(
    Result.mapError(measureSheet(sheet, options), (e) => unknown(e.message)),
  );
  const layout = Option.getOrElse(plan.layout, () => turnaroundLayout(record.who));
  const dir = path.join(place.out, 'critique', `${kind}-${n}`);
  yield* fs.makeDirectory(dir, { recursive: true });
  const views = yield* Effect.forEach(m.views, (v) =>
    Option.match(
      Arr.findFirst(plan.concepts, (c) => c.views.includes(v.view)),
      {
        onNone: () => Effect.succeedNone,
        onSome: (c) =>
          Effect.gen(function* () {
            const stem = path.join(dir, `view-${v.view}`);
            const concept = yield* Effect.fromResult(
              decodePng(yield* fs.readFile(path.join(place.folder, c.file))),
            );
            yield* fs.writeFile(`${stem}.concept.png`, encodePng(cropRaster(concept, c.box)));
            yield* fs.writeFile(`${stem}.sheet.png`, encodePng(cropRaster(sheet, v.box)));
            return Option.some({
              figure: `view-${v.view}`,
              concept: `${stem}.concept.png`,
              sheet: `${stem}.sheet.png`,
              flagged: flaggedOn(m, v.view),
              file: `${stem}.critique.md`,
              layout: Option.some(askedOf(layout, v.view)),
            });
          }),
      },
    ),
  );
  const taken = yield* (yield* Critic).critiqueSheet({
    place: `${record.member}'s ${kind} sheet, try ${n}`,
    kept: path.join(place.out, 'critique', 'answers'),
    views: Arr.getSomes(views),
  });
  const unpaired = m.views
    .filter((_, k) => Option.isNone(views[k] ?? Option.none()))
    .map((v) => v.view);
  return { taken, unpaired } satisfies CastCritique;
});
