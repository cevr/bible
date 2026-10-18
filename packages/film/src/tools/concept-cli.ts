// `film concept`: a cast member's sheet, briefed and measured (the concept
// stage's cast sheets, the film skill's Concept step).
//
//   film concept brief --look <file> --references <file>
//       (--turnaround <who> | --layout <file>) [--house <file>]
//     print the prompt one try of the sheet is painted from: the house block
//     made a sheet's, the references' note, the member's look, the layout and
//     the sheet rules (`cast-sheet-brief.ts`). The house block is read from
//     `docs/ref/house-look.txt` under the app unless `--house` names another.
//
//   film concept measure <sheet.png> --kind turnaround|poses|heads
//       --count <n> --anchor <view> [--slot <slot> ...] [--standing <view> ...]
//       [--headgear] [--concept <crop.png>:<view> ...] [--out <dir>]
//     measure a try (`core/cast-sheet.ts`): print a line for the sheet and one
//     per flag, and write `<stem>.measure.md`, `<stem>.measure.json` and
//     `<stem>.overlay.png` beside it (or in `--out`). Facing is read first;
//     a flag guides the retry and the ask, it keeps or drops nothing.

import { Argument, Command, Flag } from 'effect/cli';
import { Console, Effect, FileSystem, Option, Path, Schema } from 'effect';
import {
  measureSheet,
  type SheetConcept,
  SheetKind,
  SheetMeasure,
  type SheetOptions,
  sheetLines,
  sheetOverlay,
  sheetTable,
  Slot,
} from '../core/cast-sheet.ts';
import { measureFigure } from '../core/figure.ts';
import { castSheetBrief, turnaroundLayout } from './cast-sheet-brief.ts';
import { decodePng, encodePng } from './png.ts';

/** A `--concept` that is not `<crop.png>:<view>`, or whose crop shows no figure. */
class ConceptUnread extends Schema.TaggedError<ConceptUnread>()('ConceptUnread', {
  concept: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `the concept ${this.concept} does not read: ${this.reason}`;
  }
}

/** A brief given both a turnaround and a layout, or neither. */
class LayoutUnset extends Schema.TaggedError<LayoutUnset>()('LayoutUnset', {}) {
  override get message() {
    return "name the sheet's layout once: --turnaround <who> for a turnaround, or --layout <file> for poses or heads";
  }
}

const measuredJson = Schema.encodeSync(Schema.fromJsonString(SheetMeasure));

/** The PNG at `file`, decoded. */
const pngAt = (file: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const bytes = yield* fs.readFile(file);
    return yield* Effect.fromResult(decodePng(bytes));
  });

/** A `--concept <crop.png>:<view>`, its crop measured. */
const conceptOf = (given: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const at = given.lastIndexOf(':');
    const view = Number(given.slice(at + 1));
    if (at < 1 || !Number.isInteger(view) || view < 1)
      return yield* ConceptUnread.make({
        concept: given,
        reason: 'write it <crop.png>:<view>, the view 1-based',
      });
    const file = given.slice(0, at);
    const crop = yield* pngAt(file);
    const measure = yield* Effect.fromResult(measureFigure(crop)).pipe(
      Effect.mapError((e) => ConceptUnread.make({ concept: given, reason: e.message })),
    );
    return { name: path.basename(file, '.png'), measure, view } satisfies SheetConcept;
  });

const measure = Command.make(
  'measure',
  {
    sheet: Argument.String('sheet').pipe(Argument.withDescription('the sheet try, a PNG')),
    kind: Flag.Literals('kind', SheetKind.literals).pipe(
      Flag.withDescription(
        'turnaround (six views: front, left, left, back, right, right), poses or heads',
      ),
    ),
    count: Flag.Int('count').pipe(Flag.withDescription('how many figures the sheet draws')),
    anchor: Flag.Int('anchor').pipe(
      Flag.withDescription(
        "the view the rest are held to, 1-based: the one that passes the concept's match",
      ),
    ),
    slot: Flag.Literals('slot', Slot.literals).pipe(
      Flag.atLeast(0),
      Flag.withDescription(
        "each view's facing, left to right (a turnaround's are its six; free where not held)",
      ),
    ),
    standing: Flag.Int('standing').pipe(
      Flag.atLeast(0),
      Flag.withDescription(
        "a view whose height is held to the anchor's (a turnaround: all of them)",
      ),
    ),
    headgear: Flag.Boolean('headgear').pipe(
      Flag.withDefault(false),
      Flag.withDescription(
        'a headcloth or a veil: the head is read as its face opening, the canon on the lock',
      ),
    ),
    concept: Flag.String('concept').pipe(
      Flag.atLeast(0),
      Flag.withDescription(
        "a kept concept's figure crop and the view it is held to, <crop.png>:<view>",
      ),
    ),
    out: Flag.String('out').pipe(
      Flag.optional,
      Flag.withDescription(
        "the folder the table, the JSON and the overlay go to (the sheet's own when left out)",
      ),
    ),
  },
  Effect.fn('film.concept.measure')(function* (input) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const sheet = yield* pngAt(input.sheet);
    const concepts = yield* Effect.forEach(input.concept, conceptOf);
    const options: SheetOptions = {
      kind: input.kind,
      count: input.count,
      anchor: input.anchor,
      ...((input.slot.length > 0 && { slots: input.slot }) || {}),
      ...((input.standing.length > 0 && { standing: input.standing }) || {}),
      headgear: input.headgear,
      concepts,
    };
    const measured = yield* Effect.fromResult(measureSheet(sheet, options));
    const name = path.basename(input.sheet, '.png');
    const dir = Option.getOrElse(input.out, () => path.dirname(input.sheet));
    yield* fs.makeDirectory(dir, { recursive: true });
    const stem = path.join(dir, name);
    yield* fs.writeFileString(`${stem}.measure.md`, sheetTable(name, measured));
    yield* fs.writeFileString(`${stem}.measure.json`, measuredJson(measured));
    yield* fs.writeFile(`${stem}.overlay.png`, encodePng(sheetOverlay(sheet, measured)));
    for (const line of sheetLines(name, measured)) yield* Console.log(line);
    yield* Console.log(`${stem}.measure.md`);
  }),
).pipe(
  Command.withDescription(
    'Measure a cast sheet try: facing first, then the canon, the views held to the anchor, the papers, the lit side, mirrors, sleeves and bare arms, the hair and the beard; a line per flag, a table, JSON and an overlay. Guides the retry and the ask; not a gate',
  ),
);

const brief = Command.make(
  'brief',
  {
    look: Flag.String('look').pipe(
      Flag.withDescription(
        "a file of the member's look: face, hair, beard, skin, garments, as the kept concepts draw them",
      ),
    ),
    references: Flag.String('references').pipe(
      Flag.withDescription('a file saying what each reference image is for, in their order'),
    ),
    turnaround: Flag.String('turnaround').pipe(
      Flag.optional,
      Flag.withDescription('a turnaround of the member, named by its pronoun (Him, her)'),
    ),
    layout: Flag.String('layout').pipe(
      Flag.optional,
      Flag.withDescription(
        'a file of the poses or heads, left to right, each facing as its kept panel',
      ),
    ),
    house: Flag.String('house').pipe(
      Flag.withDefault('docs/ref/house-look.txt'),
      Flag.withDescription('the house block every concept prompt opens with'),
    ),
  },
  Effect.fn('film.concept.brief')(function* (input) {
    const fs = yield* FileSystem.FileSystem;
    const layout = yield* Option.match(input.turnaround, {
      onSome: (who) =>
        Option.match(input.layout, {
          onNone: () => Effect.succeed(turnaroundLayout(who)),
          onSome: () => Effect.fail(LayoutUnset.make({})),
        }),
      onNone: () =>
        Option.match(input.layout, {
          onNone: () => Effect.fail(LayoutUnset.make({})),
          onSome: (file) => fs.readFileString(file),
        }),
    });
    const prompt = yield* Effect.fromResult(
      castSheetBrief({
        house: yield* fs.readFileString(input.house),
        references: yield* fs.readFileString(input.references),
        look: yield* fs.readFileString(input.look),
        layout,
      }),
    );
    yield* Console.log(prompt);
  }),
).pipe(
  Command.withDescription(
    "Print a cast sheet's brief for the image route: the house block made a sheet's, the references, the look, the layout and the sheet rules (no lettering, a sleeve at rest only, the hair behind the head and the beard parted from it)",
  ),
);

export const concept = Command.make('concept').pipe(
  Command.withDescription("A cast member's sheet: its brief, and a try measured"),
  Command.withSubcommands([brief, measure]),
);
