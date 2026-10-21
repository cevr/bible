// Drawing a cast member's sheet (`film concept cast`): tries of one kind of
// sheet on the image route, each measured as it lands and recorded in the
// member's `cast-sheet.json`, its image and its measure under the film's
// `out/`. The brief is `castSheetBrief`'s: the house block made a sheet's,
// the references' note, the member's look (`look.md` beside the record), the
// kind's layout and the sheet rules. Tries run side by side in lanes (three
// at most: the route's own limit).
//
// The retry gate: a try the measure flags is drawn once more, each drift
// named in its prompt in words, and a try flagged on facing or on the canon
// rides with the underlay (`core/cast-underlay.ts`) as its last reference,
// since words alone turned 3 of 9 prototype sheets the right way. The
// underlay stands each view's figure at its own size (`statureOf`: the
// member's heads, and a smaller figure's share of the grown height), so a
// sheet of a child beside the grown member gets a child in the child's
// column. A retry
// that still drifts is recorded with its flags, never dropped: the ask shows
// it after the clean ones.

import type { PlatformError } from 'effect/PlatformError';
import {
  Array as Arr,
  DateTime,
  Effect,
  FileSystem,
  Match,
  Option,
  Path,
  Predicate,
  Random,
  Result,
  Schema,
} from 'effect';
import {
  castKindPlan,
  type CastKindPlan,
  CastSheetJson,
  type CastSheetRecord,
  type CastTry,
  hairShows,
  nextCastTry,
  withCastTry,
} from '../core/cast-record.ts';
import {
  measureSheet,
  type SheetCheck,
  type SheetKind,
  type SheetMeasure,
  type SheetConcept,
  type SheetOptions,
  sheetLines,
  grownHeadsOf,
  standingOf,
  statureOf,
  type Stature,
  sheetOverlay,
  sheetTable,
  type Slot,
} from '../core/cast-sheet.ts';
import { sheetPreview } from '../core/cast-preview.ts';
import { colourWords, hexOf, opaqueOf } from '../core/cast-sheet-pixels.ts';
import { mannequinUnderlay } from '../core/cast-underlay.ts';
import { measureFigure } from '../core/figure.ts';
import { cropRaster, type Raster } from '../core/raster.ts';
import { castSheetBrief, headsWords, turnaroundLayout } from './cast-sheet-brief.ts';
import { ContentStore } from './content-store.ts';
import { FileInvalid } from './errors.ts';
import { ImageRoute, PANEL_SIZE } from './image-route.ts';
import { decodePng, encodePng } from './png.ts';

/** The most tries drawn at once: the image route's own limit. */
export const CAST_LANES = 3;

/** Where one member's sheet is kept and where its tries land. */
interface CastPlace {
  /** The `cast-sheet/` folder: `cast-sheet.json`, `look.md` and the reference images. */
  readonly folder: string;
  /** The film's output folder for the member: tries, measures, the underlay. */
  readonly out: string;
}

/** A run of one kind of sheet. */
interface CastRun {
  readonly kind: SheetKind;
  readonly tries: number;
  readonly lanes: number;
  /** Print each prompt and draw nothing. */
  readonly dryRun: boolean;
  /** The house block every concept prompt opens with, and its reference image. */
  readonly house: string;
  readonly houseImage: string;
}

/** A line a run prints: a try made (with its flags), one that drew nothing, or (dry) the prompt it would send. */
type CastLine =
  | {
      readonly _tag: 'Made';
      readonly member: string;
      readonly kind: SheetKind;
      readonly tried: CastTry;
      readonly lines: ReadonlyArray<string>;
    }
  | {
      readonly _tag: 'Failed';
      readonly member: string;
      readonly kind: SheetKind;
      readonly reason: string;
    }
  | {
      readonly _tag: 'Planned';
      readonly member: string;
      readonly kind: SheetKind;
      readonly prompt: string;
      readonly refs: ReadonlyArray<string>;
    };

/** One line of a run's output. */
export const castLine: (line: CastLine) => string = Match.type<CastLine>().pipe(
  Match.tagsExhaustive({
    Made: (l) =>
      [
        `made ${l.member}.${l.kind} try=${l.tried.n} flags=${l.tried.flags.length} underlay=${l.tried.underlay}${Option.match(Option.fromUndefinedOr(l.tried.retryOf), { onNone: () => '', onSome: (n) => ` retryOf=${n}` })}${Option.match(Option.fromUndefinedOr(l.tried.unread), { onNone: () => '', onSome: (why) => ` unread="${why}"` })} file=${l.tried.file}`,
        ...l.lines.slice(1).map((line) => `  ${line}`),
      ].join('\n'),
    Failed: (l) => `failed ${l.member}.${l.kind} reason="${l.reason.replace(/\s+/g, ' ')}"`,
    Planned: (l) => `plan ${l.member}.${l.kind} refs=${l.refs.join(',')}\n${l.prompt}\n`,
  }),
);

/** The checks a retry answers with the underlay as well as words: facing and the canon. */
const UNDERLAID: ReadonlySet<SheetCheck> = new Set(['facing', 'sameWay', 'roll', 'squash']);

/** How a slot reads in a prompt. */
const facingWords = (slot: Option.Option<Slot>): string =>
  Match.value(Option.getOrElse(slot, () => 'free' as const)).pipe(
    Match.when('front', () => 'the viewer straight on'),
    Match.when('left', () => "the viewer's left"),
    Match.when('right', () => "the viewer's right"),
    Match.when('back', () => 'away from the viewer'),
    Match.orElse(() => 'as its pose says'),
  );

/** What a retry's drifts are said against: the sheet's slots, and the anchor view of the try it redraws as measured. */
interface Drifting {
  readonly slots: ReadonlyArray<Slot>;
  readonly anchor: Option.Option<SheetMeasure['views'][number]>;
  /** Every view as the try measured it. */
  readonly views: ReadonlyArray<SheetMeasure['views'][number]>;
  /** A heads sheet: a head is held by its width to its turn's first head, not by its height to the anchor. */
  readonly heads: boolean;
  /** The anchor view, by its number on the sheet. */
  readonly anchorView: number;
  /** Each view's stature (`statureOf`): its share of the grown height and its own heads. */
  readonly stature: (view: number) => Stature;
  /** Whether the sheet draws a smaller figure beside the grown member. */
  readonly smaller: boolean;
}

/** A view's size against the anchor's: its share of the anchor's height, and its head's share of the anchor's head. */
const besideAnchor = (held: Drifting, view: number) => {
  const own = held.stature(view);
  const anchor = held.stature(held.anchorView);
  return {
    height: own.height / anchor.height,
    head: own.height / own.heads / (anchor.height / anchor.heads),
  };
};

/** Whether a view is drawn at the anchor's own size. */
const atAnchorSize = (held: Drifting, view: number): boolean => {
  const { height, head } = besideAnchor(held, view);
  return Math.abs(height - 1) < 0.005 && Math.abs(head - 1) < 0.005;
};

/** A percentage in words: "67 %". */
const percent = (x: number): string => `${Math.round(100 * x)} %`;

/**
 * A drift said for each view at its own size: the views at the anchor's
 * size in one sentence (`grown`), each smaller figure in its own (`own`), so
 * a retry never asks a child to stand as tall as the grown member.
 */
const bySize = (
  held: Drifting,
  views: ReadonlyArray<number>,
  grown: (views: ReadonlyArray<number>) => string,
  own: (view: number, size: ReturnType<typeof besideAnchor>) => string,
): string => {
  const smaller = views.filter((v) => !atAnchorSize(held, v));
  if (smaller.length === 0) return grown(views);
  const rest = views.filter((v) => atAnchorSize(held, v) && v !== held.anchorView);
  return [
    ...smaller.map((v) => own(v, besideAnchor(held, v))),
    ...((rest.length > 0 && [grown(rest)]) || []),
  ].join(' ');
};

/** A share in words, for a prompt beside its number: "about a third of". */
const shareWords = (x: number): string =>
  (x < 0.22 && 'under a quarter of') ||
  (x < 0.29 && 'about a quarter of') ||
  (x < 0.37 && 'about a third of') ||
  (x < 0.45 && 'a little under half of') ||
  (x < 0.55 && 'about half of') ||
  'more than half of';

/** A list in words: "a, b and c". */
const listed = (xs: ReadonlyArray<string>): string =>
  [xs.slice(0, -1).join(', '), ...xs.slice(-1)].filter((x) => x !== '').join(' and ');

/** The anchor's head and hands, its papers, in words and numbers: what a head, hand or papers drift is held to. */
const anchorSizes = (held: Drifting, views: ReadonlyArray<number>) =>
  Option.map(held.anchor, (a) => {
    const drifted = views.filter((v) => v !== a.view);
    const head = Option.fromUndefinedOr(a.head);
    const hand = Option.fromUndefinedOr(a.hand);
    const papers = a.papers
      .filter((p) => p.share >= 0.05)
      .slice(0, 3)
      .map((p) => `${colourWords(p.rgb)} (${hexOf(p.rgb)})`);
    return {
      who: `Figure ${((drifted.length > 0 && drifted) || views).join(' and ')}`,
      anchor: a.view,
      head: Option.map(
        head,
        (px) =>
          `${Math.round(px)} pixels tall on this sheet, ${shareWords(px / a.height)} the figure's whole height (${Math.round((100 * px) / a.height)} %)`,
      ),
      hand: Option.map(hand, (share) => {
        const px = Option.match(head, {
          onNone: () => '',
          onSome: (h) => `about ${Math.round(share * h)} pixels across, `,
        });
        return `each ${px}${shareWords(share)} the head's height (${share.toFixed(2)})`;
      }),
      papers: (papers.length > 0 && Option.some(listed(papers))) || Option.none<string>(),
    };
  });

/** A drift said against the anchor's own number when the try measured one, else in words alone. */
const heldTo = (
  held: Drifting,
  views: ReadonlyArray<number>,
  part: 'head' | 'hand' | 'papers',
  said: (who: string, anchor: number, value: string) => string,
  plain: string,
): string =>
  Option.getOrElse(
    Option.flatMap(anchorSizes(held, views), (a) =>
      Option.map(a[part], (value) => said(a.who, a.anchor, value)),
    ),
    () => plain,
  );

/** A heads sheet's head drift: the head held by its eyes' spacing, which no lock of hair widens, to the head its flag names, its turn's first. */
const headsDrift = (held: Drifting, views: ReadonlyArray<number>): string => {
  const [drifted, to] = [Arr.get(views, 0), Arr.get(views, 1)];
  const eyes = Option.flatMap(to, (n) =>
    Option.flatMap(
      Arr.findFirst(held.views, (v) => v.view === n),
      (v) => Option.fromUndefinedOr(v.eyes),
    ),
  );
  return Option.getOrElse(
    Option.map(
      Option.all([drifted, to, eyes]),
      ([d, n, e]) =>
        `Figure ${d}'s head is the size of figure ${n}'s, which turns the same way: its eyes about ${Math.round(e)} pixels apart.`,
    ),
    () => `Figure ${views.join(' and ')}'s heads are the same size as the others'.`,
  );
};

/** One flag as the sentence a retry's prompt adds. */
const driftOf = (check: SheetCheck, views: ReadonlyArray<number>, held: Drifting): string => {
  const v = views.join(' and ');
  const slots = held.slots;
  return Match.value(check).pipe(
    Match.when(
      'facing',
      () =>
        `Figure ${v} faces ${facingWords(Arr.get(slots, Option.getOrElse(Arr.head(views), () => 1) - 1))}: its eyes, nose and feet point that way.`,
    ),
    Match.when('sameWay', () => `Figures ${v} face opposite ways, each its own drawing.`),
    Match.when(
      'profileWay',
      () =>
        `Figures ${v} face the same way: the profile looks where the three-quarter beside it looks.`,
    ),
    Match.when('roll', () => `Figure ${v} holds its head level, never tipped.`),
    Match.when(
      'squash',
      () =>
        `Every ${(held.smaller && 'grown ') || ''}figure stands about ${headsWords(held.stature(held.anchorView).heads)} of its own heads tall, as the underlay's figures do.`,
    ),
    Match.whenOr('height', 'ground', () =>
      bySize(
        held,
        views,
        (grown) =>
          `Figure ${grown.join(' and ')} stands as tall as the others, its soles level with theirs.`,
        (view, size) =>
          `Figure ${view} stands about ${percent(size.height)} of figure ${held.anchorView}'s height, its soles level with theirs: it is the smaller figure the layout names.`,
      ),
    ),
    Match.when(
      'head',
      () =>
        (held.heads && headsDrift(held, views)) ||
        bySize(
          held,
          views,
          (grown) =>
            heldTo(
              held,
              grown,
              'head',
              (who, anchor, size) => `${who}'s head is as big as figure ${anchor}'s: ${size}.`,
              `Figure ${grown.join(' and ')}'s head is the same size as the others'.`,
            ),
          (view, size) =>
            `Figure ${view}'s head is about ${percent(size.head)} of figure ${held.anchorView}'s${Option.getOrElse(
              Option.map(
                Option.flatMap(held.anchor, (a) => Option.fromUndefinedOr(a.head)),
                (px) => `, about ${Math.round(px * size.head)} pixels tall on this sheet`,
              ),
              () => '',
            )}: a smaller figure's head is a larger share of its height.`,
        ),
    ),
    Match.when('hand', () =>
      bySize(
        held,
        views,
        (grown) =>
          heldTo(
            held,
            grown,
            'hand',
            (who, anchor, size) =>
              `${who}'s round hands are as big as figure ${anchor}'s: ${size}, as the kept concept draws them.`,
            `Figure ${grown.join(' and ')}'s hands are the same size as the others', as the kept concept draws them.`,
          ),
        (view) =>
          `Figure ${view}'s round hands are the same share of its own head as figure ${held.anchorView}'s are of its head, as the kept concept draws them.`,
      ),
    ),
    Match.when('width', () => `Figures ${v} are the same width.`),
    Match.when('hairFall', () => `Figure ${v}'s hair falls to the same place as in the others.`),
    Match.whenOr('papers', 'grey', () =>
      heldTo(
        held,
        views,
        'papers',
        (who, anchor, papers) =>
          `${who} wears the same papers as figure ${anchor}: ${papers}; its shade a deeper hue toward violet, never grey.`,
        `Figure ${v} wears the same papers as the others, its shade a deeper hue toward violet, never grey.`,
      ),
    ),
    Match.when(
      'lit',
      () => `Figure ${v} is lit from the upper left too: its left side is the lit one.`,
    ),
    Match.when('mirror', () => `Figures ${v} are each their own drawing, never one flipped.`),
    Match.when(
      'sleeveReach',
      () =>
        `In figure ${v} each hand is at the end of its arm in its sleeve, the sleeve running from the shoulder to the hand: no hand floats free beside the body.`,
    ),
    Match.when(
      'bareArm',
      () =>
        `In figure ${v} no skin shows below the neck but the round hands: never a bare arm or a bare shoulder.`,
    ),
    Match.when(
      'hairBeard',
      () =>
        `In figure ${v} a narrow dark band, the deep shade of the brown, runs between the beard and each lock of hair: the beard never runs into the hair.`,
    ),
    Match.exhaustive,
  );
};

/** How the underlay sizes its figures, in words: one height in heads, or each at its own size. */
const underlaySizes = (options: SheetOptions): string =>
  ((options.figures ?? []).length > 0 &&
    `each at its figure's size: a grown one about ${headsWords(grownHeadsOf(options))} of its own heads tall, a smaller one shorter with its head a larger share of it`) ||
  `each about ${headsWords(grownHeadsOf(options))} of its own heads tall`;

/** The references' note: what each image is for, in the order they are sent. */
const referencesNote = (
  record: CastSheetRecord,
  options: SheetOptions,
  underlay: boolean,
): string =>
  [
    'Image 1 is the house look: take its paper, its line and its light from it; its hands float free beside the body, which no figure on this sheet does.',
    ...record.refs.map((r, k) => `Image ${k + 2} is ${r.why}.`),
    ...((underlay && [
      `Image ${record.refs.length + 2} is a layout, never a look: blank figures standing level, each turned the way its figure on this sheet faces and ${underlaySizes(options)}. Take each figure's facing, place and size from it, and nothing else.`,
    ]) ||
      []),
  ].join(' ');

/** Everything one try needs. */
interface TryContext {
  readonly place: CastPlace;
  readonly run: CastRun;
  readonly record: CastSheetRecord;
  readonly look: string;
  readonly layout: string;
  readonly plan: CastKindPlan;
  /** The measure's options: the plan's, each kept concept measured and held to its views. */
  readonly options: SheetOptions;
  /** The underlay's file, and its drawing, run by each retry that sends it. */
  readonly underlay: {
    readonly file: string;
    readonly drawn: Effect.Effect<void, PlatformError>;
    /** Whether it draws any mannequin: a heads sheet's, or a pose sheet's with no standing view, draws none and is never sent. */
    readonly shown: boolean;
  };
}

/** A try's prompt and references: the brief, with each drift of the try it redraws named after it. */
const requestOf = (ctx: TryContext, drifts: ReadonlyArray<string>, underlay: boolean) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    if (underlay) yield* ctx.underlay.drawn;
    const brief = yield* Effect.fromResult(
      castSheetBrief({
        kind: ctx.run.kind,
        house: ctx.run.house,
        references: referencesNote(ctx.record, ctx.options, underlay),
        look: ctx.look,
        layout: ctx.layout,
        heads: grownHeadsOf(ctx.options),
        figures: ctx.options.figures ?? [],
        hair: hairShows(ctx.record),
      }),
    );
    const prompt = [
      brief,
      ...((drifts.length > 0 && [`This sheet is drawn again: ${drifts.join(' ')}`]) || []),
    ].join('\n\n');
    const refs = [
      ctx.run.houseImage,
      ...ctx.record.refs.map((r) => path.join(ctx.place.folder, r.file)),
      ...((underlay && [ctx.underlay.file]) || []),
    ];
    return { prompt, refs };
  });

/** The measure's flags as the record keeps them. */
const flagsOf = (m: SheetMeasure) => m.flags.map((f) => ({ check: f.check, views: f.views }));

/** A try's image drawn: its bytes, read back from a scratch file the route writes. */
const drawBytes = Effect.fn('Cast.drawBytes')(function* (
  place: CastPlace,
  request: { readonly prompt: string; readonly refs: ReadonlyArray<string> },
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const route = yield* ImageRoute;
  const drawing = path.join(place.out, '.drawing');
  yield* fs.makeDirectory(drawing, { recursive: true });
  const out = path.join(drawing, `${(yield* Random.nextIntBetween(0, 36 ** 6)).toString(36)}.png`);
  return yield* route
    .draw({ ...request, size: PANEL_SIZE, out })
    .pipe(
      Effect.retry({ times: 1, while: (e) => e._tag === 'ImageRouteFailed' }),
      Effect.andThen(fs.readFile(out)),
      Effect.ensuring(fs.remove(out).pipe(Effect.ignore)),
    );
});

/** A try's measure written beside its image (`<stem>.measure.md`, `.overlay.png` and `.preview.png`, the views as the trace will make them), and its lines and flags. */
const keepMeasure = Effect.fn('Cast.keepMeasure')(function* (
  stem: string,
  sheet: Raster,
  measured: Result.Result<SheetMeasure, { readonly message: string; readonly reason: string }>,
  options: SheetOptions,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const name = path.basename(stem);
  if (Result.isFailure(measured))
    return {
      lines: [`sheet ${name} not measured: ${measured.failure.message}`],
      flags: [],
      squash: {},
      unread: { unread: measured.failure.reason },
    };
  const m = measured.success;
  yield* fs.writeFileString(`${stem}.measure.md`, sheetTable(name, m));
  yield* fs.writeFile(`${stem}.overlay.png`, encodePng(sheetOverlay(sheet, m)));
  yield* fs.writeFile(`${stem}.preview.png`, encodePng(sheetPreview(sheet, m, options)));
  const squash = Option.match(Option.fromUndefinedOr(m.canon.squash), {
    onNone: () => ({}),
    onSome: (s) => ({ squash: s }),
  });
  return { lines: sheetLines(name, m), flags: flagsOf(m), squash, unread: {} };
});

/**
 * One try drawn, measured and recorded: its number is taken under the
 * record's lock, so lanes drawing at once never share one. Its image and its
 * measure land in the place's `out/` as `<kind>-<n>.*`.
 */
const drawTry = Effect.fn('Cast.drawTry')(function* (
  ctx: TryContext,
  drifts: ReadonlyArray<string>,
  underlay: boolean,
  retryOf: Option.Option<number>,
  emit: (line: CastLine) => Effect.Effect<void>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const store = yield* ContentStore;
  const request = yield* requestOf(ctx, drifts, underlay);
  const bytes = yield* drawBytes(ctx.place, request);
  const sheet = opaqueOf(yield* Effect.fromResult(decodePng(bytes)));
  const measured = measureSheet(sheet, ctx.options);
  const manifest = {
    file: path.join(ctx.place.folder, 'cast-sheet.json'),
    codec: CastSheetJson,
    empty: ctx.record,
  };
  const kind = ctx.run.kind;
  const at = DateTime.formatIso(yield* DateTime.now);
  const [tried, lines] = yield* store.transact(manifest, (current) =>
    Effect.gen(function* () {
      const n = nextCastTry(current, kind);
      const stem = path.join(ctx.place.out, `${kind}-${n}`);
      yield* fs.writeFile(`${stem}.png`, bytes);
      const read = yield* keepMeasure(stem, sheet, measured, ctx.options);
      const t: CastTry = {
        n,
        file: path.relative(ctx.place.out, `${stem}.png`),
        prompt: request.prompt,
        // Each reference as the sheet's folder reaches it: the record names no machine's paths.
        refs: request.refs.map((ref) => path.relative(ctx.place.folder, ref)),
        underlay,
        ...Option.match(retryOf, { onNone: () => ({}), onSome: (r) => ({ retryOf: r }) }),
        flags: read.flags,
        ...read.unread,
        ...read.squash,
        at,
      };
      return [[t, read.lines] as const, withCastTry(current, kind, t)] as const;
    }),
  );
  yield* emit({ _tag: 'Made', member: ctx.record.member, kind, tried, lines });
  return { tried, measure: Result.getSuccess(measured) };
});

/** A try that drew nothing: no tries made. */
const NONE_MADE: ReadonlyArray<CastTry> = [];

/** A kept concept whose crop shows no figure the measure reads. */
class CastConceptUnread extends Schema.TaggedError<CastConceptUnread>()('CastConceptUnread', {
  file: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `the concept ${this.file} does not read in its box: ${this.reason} (cast-sheet.json, the kind's concepts)`;
  }
}

/** Each kept concept the plan names, cropped to its box and measured, held to each of its views. */
export const conceptsOf = Effect.fn('Cast.concepts')(function* (
  place: CastPlace,
  plan: CastKindPlan,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const held = yield* Effect.forEach(plan.concepts, (c) =>
    Effect.gen(function* () {
      const image = yield* Effect.fromResult(
        decodePng(yield* fs.readFile(path.join(place.folder, c.file))),
      );
      const measure = yield* Effect.fromResult(
        Result.mapError(measureFigure(cropRaster(image, c.box)), (e) =>
          CastConceptUnread.make({ file: c.file, reason: e.message }),
        ),
      );
      return c.views.map((view): SheetConcept => ({ name: c.file, measure, view }));
    }),
  );
  return held.flat();
});

/** One try and, when the measure flags it, its one retry: each drift in words, the underlay on facing or the canon. */
const gatedTry = (ctx: TryContext, emit: (line: CastLine) => Effect.Effect<void>) =>
  drawTry(ctx, [], false, Option.none(), emit).pipe(
    Effect.flatMap(({ tried: first, measure }) => {
      if (first.flags.length === 0 && Predicate.isUndefined(first.unread))
        return Effect.succeed([first]);
      const held: Drifting = {
        slots: ctx.plan.options.slots ?? [],
        anchor: Option.flatMap(measure, (m) => Arr.findFirst(m.views, (v) => v.view === m.anchor)),
        views: Option.match(measure, { onNone: () => [], onSome: (m) => m.views }),
        heads: ctx.run.kind === 'heads',
        anchorView: ctx.options.anchor,
        stature: (view) => statureOf(ctx.options, view),
        smaller: (ctx.options.figures ?? []).length > 0,
      };
      const drifts = first.flags.map((f) => driftOf(f.check, f.views, held));
      const underlay = ctx.underlay.shown && first.flags.some((f) => UNDERLAID.has(f.check));
      return Effect.map(
        drawTry(ctx, drifts, underlay, Option.some(first.n), emit),
        ({ tried: second }) => [first, second],
      );
    }),
    Effect.catch((e) =>
      Effect.as(
        emit({ _tag: 'Failed', member: ctx.record.member, kind: ctx.run.kind, reason: e.message }),
        NONE_MADE,
      ),
    ),
  );

/**
 * The member's record, look and plan for one kind of its sheet: the layout in
 * words (a turnaround's from the record's pronoun) and the measure's options,
 * each kept concept measured and held to its views. Every try is drawn and
 * measured from these, and `film concept brief` and `measure` read a record
 * through them.
 */
export const castPlanOf = Effect.fn('Cast.plan')(function* (place: CastPlace, kind: SheetKind) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const record = yield* fs
    .readFileString(path.join(place.folder, 'cast-sheet.json'))
    .pipe(Effect.flatMap((text) => Effect.fromResult(decodeRecord(text))));
  const look = yield* fs.readFileString(path.join(place.folder, 'look.md'));
  const plan = yield* Effect.fromResult(castKindPlan(record, kind));
  const layout = Option.getOrElse(plan.layout, () => turnaroundLayout(record.who));
  const options: SheetOptions = { ...plan.options, concepts: yield* conceptsOf(place, plan) };
  return { record, look, plan, layout, options };
});

/**
 * Draw `run.tries` tries of the member's `run.kind` sheet, `run.lanes` at
 * once, each gated by the measure; every try lands in the record. A dry run
 * prints the first try's prompt and references and draws nothing.
 */
export const makeCastSheet = Effect.fn('Cast.make')(function* (
  place: CastPlace,
  run: CastRun,
  emit: (line: CastLine) => Effect.Effect<void>,
) {
  const fs = yield* FileSystem.FileSystem;
  const { ctx, first } = yield* tryPlan(place, run);
  if (run.dryRun) {
    yield* emit({ _tag: 'Planned', member: ctx.record.member, kind: run.kind, ...first });
    return NONE_MADE;
  }
  yield* fs.makeDirectory(place.out, { recursive: true });
  const made = yield* Effect.forEach(Arr.range(1, run.tries), () => gatedTry(ctx, emit), {
    concurrency: Math.min(run.lanes, CAST_LANES),
  });
  return made.flat();
});

/** The prompt and references the first try of a run is drawn from, built as the run builds them: `film concept brief` prints its prompt. */
export const castRequest = (place: CastPlace, run: CastRun) =>
  Effect.map(tryPlan(place, run), ({ first }) => first);

/** Everything a run's tries are drawn from, and its first try's request. */
const tryPlan = Effect.fn('Cast.tryPlan')(function* (place: CastPlace, run: CastRun) {
  const path = yield* Path.Path;
  const store = yield* ContentStore;
  const { record, look, plan, layout, options } = yield* castPlanOf(place, run.kind);
  const file = path.join(place.out, `underlay-${run.kind}.png`);
  const slots = plan.options.slots ?? [];
  // The mannequins stand: a heads sheet draws none, and a pose sheet only its standing views.
  const shown =
    (run.kind !== 'heads' &&
      standingOf(
        plan.options,
        slots.map((_, k) => ({ view: k + 1 })),
      )) ||
    [];
  const profiles = (run.kind === 'turnaround' && [3, 5]) || [];
  // Drawn afresh by each retry that sends it (the slots may have changed since the last run), whole: a lane never reads half of one.
  const statures = slots.map((_, k) => statureOf(plan.options, k + 1));
  const drawn = Effect.sync(() =>
    encodePng(mannequinUnderlay({ slots, profiles, shown, statures })),
  ).pipe(Effect.flatMap((bytes) => store.writeFile(file, bytes)));
  const ctx: TryContext = {
    place,
    run,
    record,
    look,
    layout,
    plan,
    options,
    underlay: { file, drawn, shown: shown.length > 0 },
  };
  // The brief is built once before any draw: a house block that moved stops the run, not each try.
  return { ctx, first: yield* requestOf(ctx, [], false) };
});

const decodeRecord = (text: string) =>
  Result.mapError(Schema.decodeResult(CastSheetJson)(text), (e) =>
    FileInvalid.make({ file: 'cast-sheet.json', reason: e.message }),
  );
