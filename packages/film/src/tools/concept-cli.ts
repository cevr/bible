// `film concept`: a cast member's sheet, briefed and measured (the concept
// stage's cast sheets, the film skill's Concept step).
//
//   film concept brief --look <file> --references <file>
//       (--turnaround <who> | --layout <file> --kind poses|heads) [--house <file>]
//     print the prompt one try of the sheet is painted from: the house block
//     made a sheet's, the references' note, the member's look, the layout and
//     its kind's rules (`cast-sheet-brief.ts`). The house block is the app's
//     own (`FilmApp.house`), wherever the command runs, unless `--house` names
//     another.
//
//   film concept measure <sheet.png> --kind turnaround|poses|heads
//       --count <n> --anchor <view> [--slot <slot> ...] [--standing <view> ...]
//       [--level <view> ...] [--headgear] [--concept <crop.png>:<view> ...] [--out <dir>]
//     measure a try (`core/cast-sheet.ts`): print a line for the sheet and one
//     per flag, and write `<stem>.measure.md`, `<stem>.measure.json` and
//     `<stem>.overlay.png` beside it (or in `--out`). Facing is read first;
//     a flag guides the retry and the ask, it keeps or drops nothing.
//
//   film concept cast <film> <member> --kind turnaround|poses|heads
//       [--tries 3] [--lanes 3] [--dry-run] [--house <file>] [--house-image <png>]
//     draw tries of the member's sheet on the image route (`cast-sheet-make.ts`)
//     from its `cast-sheet.json` and `look.md`: the film's own role's under
//     `films/<film>/cast/<member>/cast-sheet/`, else the library's under
//     `library/cast/<member>/cast-sheet/` beside the films. Each try is
//     measured as it lands and a flagged one drawn once more, its drifts
//     named (and the underlay sent on facing or the canon); every try, its
//     measure and overlay land in `out/<film>/cast/<member>/` and the record.

import { Argument, Command, Flag } from 'effect/cli';
import { Console, Effect, FileSystem, Option, Path, Schema } from 'effect';
import { CAST_LANES, castLine, makeCastSheet } from './cast-sheet-make.ts';
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
import { FilmFolder, filmNamed } from './film-repo.ts';
import { ImageRoute } from './image-route.ts';
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

/** A brief given both a turnaround and a layout, or neither, or a layout with no kind. */
class LayoutUnset extends Schema.TaggedError<LayoutUnset>()('LayoutUnset', {}) {
  override get message() {
    return "name the sheet's layout once: --turnaround <who> for a turnaround, or --layout <file> --kind poses|heads";
  }
}

/** The app's house look: the block every concept prompt opens with, and its image, every try's first reference. */
interface HouseLook {
  readonly text: string;
  readonly image: string;
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
    level: Flag.Int('level').pipe(
      Flag.atLeast(0),
      Flag.withDescription(
        "a view whose head is level, neither bowed nor lifted: the hair's fall, and on a heads sheet the head's height, are held on these (all of them)",
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
      ...((input.level.length > 0 && { level: input.level }) || {}),
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
    'Measure a cast sheet try: facing first, then the canon, the views held to the anchor, the papers, the lit side, mirrors, a hand floating free of its sleeve and bare arms, the hair and the beard; a line per flag, a table, JSON and an overlay. Guides the retry and the ask; not a gate',
  ),
);

const brief = (house: HouseLook) =>
  Command.make(
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
      kind: Flag.Literals('kind', ['poses', 'heads']).pipe(
        Flag.optional,
        Flag.withDescription("a layout's sheet: poses or heads"),
      ),
      house: Flag.String('house').pipe(
        Flag.optional,
        Flag.withDescription("the house block every concept prompt opens with (the app's own)"),
      ),
    },
    Effect.fn('film.concept.brief')(function* (input) {
      const fs = yield* FileSystem.FileSystem;
      const sheet = yield* Option.match(input.turnaround, {
        onSome: (who) =>
          Option.match(
            Option.orElse(input.layout, () => input.kind),
            {
              onNone: () =>
                Effect.succeed({ kind: 'turnaround' as const, layout: turnaroundLayout(who) }),
              onSome: () => Effect.fail(LayoutUnset.make({})),
            },
          ),
        onNone: () =>
          Option.match(Option.all([input.layout, input.kind]), {
            onNone: () => Effect.fail(LayoutUnset.make({})),
            onSome: ([file, kind]) =>
              Effect.map(fs.readFileString(file), (layout) => ({ kind, layout })),
          }),
      });
      const prompt = yield* Effect.fromResult(
        castSheetBrief({
          ...sheet,
          house: yield* fs.readFileString(Option.getOrElse(input.house, () => house.text)),
          references: yield* fs.readFileString(input.references),
          look: yield* fs.readFileString(input.look),
        }),
      );
      yield* Console.log(prompt);
    }),
  ).pipe(
    Command.withDescription(
      "Print a cast sheet's brief for the image route: the house block made a sheet's, the references, the look, the layout and its kind's rules (no lettering, each hand at its sleeve's end, the beard parted from the hair by a dark band)",
    ),
  );

/** A member with no `cast-sheet.json` in the film's cast or the library's. */
class CastUnfound extends Schema.TaggedError<CastUnfound>()('CastUnfound', {
  member: Schema.String,
  looked: Schema.Array(Schema.String),
}) {
  override get message() {
    return `${this.member} has no cast-sheet.json: looked in ${this.looked.join(' and ')}`;
  }
}

/** The member's sheet folder: the film's own role's when it has one, else the library's. */
const castFolder = Effect.fn('film.concept.castFolder')(function* (film: string, member: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = (yield* FilmFolder).paths(film).dir;
  const looked = [
    path.join(dir, 'cast', member, 'cast-sheet'),
    path.join(dir, '..', '..', 'library', 'cast', member, 'cast-sheet'),
  ];
  const found = yield* Effect.findFirst(looked, (folder) =>
    fs.exists(path.join(folder, 'cast-sheet.json')).pipe(Effect.orElseSucceed(() => false)),
  );
  return yield* Effect.fromOption(found).pipe(
    Effect.mapError(() => CastUnfound.make({ member, looked })),
  );
});

const cast = (house: HouseLook) =>
  Command.make(
    'cast',
    {
      film: Argument.String('film').pipe(
        Argument.withDescription('the film the tries are drawn for'),
      ),
      member: Argument.String('member').pipe(
        Argument.withDescription("the cast member, by its id (its sheet folder's name)"),
      ),
      kind: Flag.Literals('kind', SheetKind.literals).pipe(
        Flag.withDescription('the sheet to draw: turnaround, poses or heads'),
      ),
      tries: Flag.Int('tries').pipe(
        // A count under one is refused at the flag: the run would draw one try for it.
        Flag.withSchema(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))),
        Flag.withDefault(3),
        Flag.withDescription(
          'how many tries to draw (a flagged one is drawn once more beside them)',
        ),
      ),
      lanes: Flag.Int('lanes').pipe(
        Flag.withDefault(CAST_LANES),
        Flag.withDescription(`how many tries are drawn at once (at most ${CAST_LANES})`),
      ),
      dryRun: Flag.Boolean('dry-run').pipe(
        Flag.withDefault(false),
        Flag.withDescription('print the prompt and the references, and draw nothing'),
      ),
      house: Flag.String('house').pipe(
        Flag.optional,
        Flag.withDescription("the house block every concept prompt opens with (the app's own)"),
      ),
      houseImage: Flag.String('house-image').pipe(
        Flag.optional,
        Flag.withDescription("the house look's image, every try's first reference (the app's own)"),
      ),
    },
    Effect.fn('film.concept.cast')(function* (input) {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const film = yield* filmNamed(input.film);
      const folder = yield* castFolder(film, input.member);
      const out = path.join((yield* FilmFolder).paths(film).out, 'cast', input.member);
      yield* makeCastSheet(
        { folder, out },
        {
          kind: input.kind,
          tries: input.tries,
          lanes: input.lanes,
          dryRun: input.dryRun,
          house: yield* fs.readFileString(Option.getOrElse(input.house, () => house.text)),
          houseImage: path.resolve(Option.getOrElse(input.houseImage, () => house.image)),
        },
        (line) => Console.log(castLine(line)),
      );
    }),
  ).pipe(
    Command.withDescription(
      "Draw tries of a cast member's sheet on the image route, each measured as it lands; a flagged try is drawn once more with its drifts named and, on facing or the canon, the underlay; every try lands in its record and out/<film>/cast/<member>/",
    ),
    Command.provide(ImageRoute.layer),
  );

/** `film concept` over the app's house look. */
export const concept = (house: HouseLook) =>
  Command.make('concept').pipe(
    Command.withDescription(
      "A cast member's sheet: its brief, a try measured, and tries drawn and measured",
    ),
    Command.withSubcommands([brief(house), measure, cast(house)]),
  );
