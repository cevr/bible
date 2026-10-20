// The match's words (`film lab match`), shared by the page, the lab, the CLI and
// the MCP: a figure's concept reference as a film declares it beside its
// rig, a match asked, the table it answers (each ratio and shade of the
// concept against the scene, flagged past its tolerance) and the files it
// writes. Measuring is `figure.ts`; drawing and cropping, the lab's easel
// (`tools/easel.ts`). Not a gate: a concept is painted, so the table guides
// a painter and fails nothing. Pure.

import { Array as Arr, Match, Option, Order, Schema } from 'effect';
import { ARTIFACT_KINDS, type ArtifactKind, type ArtifactMark } from './render-artifacts.ts';
import {
  type FigureMeasure,
  type FigureSilhouette,
  HEAD_RADII,
  RATIO_LABELS,
  RATIOS,
  type Ratio,
  PixelBox,
  type Shading,
} from './figure.ts';
import { type Raster, type RasterPath, besideRaster, scaleRaster, strokeRaster } from './raster.ts';

// ---------------------------------------------------------------------------
// A figure's concept, as a film declares it

/** A name in a path: letters, digits, `_`, `.` and `-`, never `.` or `..` alone. */
const NAME = '(?!\\.\\.?(?:/|$))[A-Za-z0-9_.-]+';

/** A set's folder name (`rbf-v3-concepts-2026-10-15`): one name. */
const SetName = Schema.String.check(
  Schema.isPattern(new RegExp(`^${NAME}$`), { message: "a set's folder: one name" }),
);

/** A file in a set (`images/1-cold-34.png`): names joined by `/`, an image. */
const SetFile = Schema.String.check(
  Schema.isPattern(new RegExp(`^${NAME}(?:/${NAME})*\\.(?:png|jpe?g|webp)$`), {
    message: "a set's image, by its path in the set's folder",
  }),
);

/** A Board try's file in the film's `board/` folder (`cold.34.3.png`). */
const BoardImage = Schema.String.check(
  Schema.isPattern(new RegExp(`^${NAME}\\.(?:png|jpe?g|webp)$`), {
    message: "a Board try's file, as board.json names it",
  }),
);

/**
 * A concept image: a set's file (`out/<set>/<file>`: a kept concept, a model
 * sheet), or a Board try of the film's own, by its file in the film's
 * `board/` folder (board.json's `tries[].file`).
 */
export const ConceptImage = Schema.Union([
  Schema.Struct({ set: SetName, file: SetFile }),
  Schema.Struct({ board: BoardImage }),
]);
export type ConceptImage = typeof ConceptImage.Type;

/**
 * A figure's concept reference (`RivePropSpec.concept`): the image it was
 * painted in and the figure's box in it, in the image's pixels, with a
 * little room round the figure and none of another's face in it.
 */
export const ConceptRef = Schema.Struct({ image: ConceptImage, box: PixelBox });
export type ConceptRef = typeof ConceptRef.Type;

/** A concept image as a line names it: `<set>/<file>` or `board/<file>`. */
export const conceptImageName = (image: ConceptImage): string =>
  Match.value(image).pipe(
    Match.when({ set: Match.string }, (set) => `${set.set}/${set.file}`),
    Match.when({ board: Match.string }, (board) => `board/${board.board}`),
    Match.exhaustive,
  );

/**
 * A figure a probed frame drew (`probeFigure`, declared by a rig's draw): the
 * rig's key, its box on screen in canvas pixels (its artboard's bounds as
 * drawn), whether it has a face (a hand has none), and its concept.
 */
export const FigureMark = Schema.Struct({
  scene: Schema.String,
  key: Schema.String,
  box: PixelBox,
  face: Schema.Boolean,
  concept: Schema.optional(ConceptRef),
});
export type FigureMark = typeof FigureMark.Type;

/** A figure's name as a table and `--figure` name it: its rig's key past its last `/` (`righteousness-by-faith/lead` is `lead`). */
export const figureName = (key: string): string => key.slice(key.lastIndexOf('/') + 1);

/** Whether any of the figure `mark`'s box lies on the `width` × `height` frame. */
export const onFrame = (mark: FigureMark, width: number, height: number): boolean => {
  const [x0, y0, x1, y1] = mark.box;
  return x1 > 0 && y1 > 0 && x0 < width && y0 < height;
};

/**
 * Where to crop the figure `mark` from its frame: its box joined with each
 * hand (a mark with no face) nearer its box than any other figure's, with a
 * twentieth of its size as room, held to the `width` × `height` frame.
 */
export const sceneBoxOf = (
  mark: FigureMark,
  marks: ReadonlyArray<FigureMark>,
  width: number,
  height: number,
): PixelBox => {
  const centre = (b: PixelBox) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] as const;
  const gap = (b: PixelBox, to: PixelBox) => {
    const [x, y] = centre(b);
    return Math.hypot(Math.max(to[0] - x, 0, x - to[2]), Math.max(to[1] - y, 0, y - to[3]));
  };
  const figures = marks.filter((m) => m.face);
  const hands = marks.filter(
    (m) =>
      !m.face &&
      figures.every((other) => other === mark || gap(m.box, mark.box) <= gap(m.box, other.box)) &&
      gap(m.box, mark.box) < Math.max(mark.box[2] - mark.box[0], mark.box[3] - mark.box[1]),
  );
  const boxes = [mark.box, ...hands.map((h) => h.box)];
  const [x0, y0, x1, y1] = [
    Math.min(...boxes.map((b) => b[0])),
    Math.min(...boxes.map((b) => b[1])),
    Math.max(...boxes.map((b) => b[2])),
    Math.max(...boxes.map((b) => b[3])),
  ];
  const room = Math.max(x1 - x0, y1 - y0) / 20;
  return [
    Math.max(0, Math.floor(x0 - room)),
    Math.max(0, Math.floor(y0 - room)),
    Math.min(width, Math.ceil(x1 + room)),
    Math.min(height, Math.ceil(y1 + room)),
  ];
};

// ---------------------------------------------------------------------------
// A match asked and answered

/** A match asked of the lab: the scene, one place in it (as `look` reads places), the figure (each with a concept, without one), and the asker's films folder. */
export const MatchPost = Schema.Struct({
  scene: Schema.String,
  at: Schema.String,
  figure: Schema.optional(Schema.String),
  /** The asker's films folder, absolute: a lab serving another checkout's films refuses (`LabElsewhere`). */
  from: Schema.optionalKey(Schema.String),
});
export type MatchPost = typeof MatchPost.Type;

/** How a row's difference is told: a ratio's in percent of the concept's, a shade's in its own unit. */
const RowUnit = Schema.Literals(['ratio', 'degrees', 'value', 'rule']);
type RowUnit = typeof RowUnit.Type;

/**
 * One row of a match's table: the concept's number and the scene's (either
 * left out where its crop does not show it, `note` saying why), their
 * difference (percent for a ratio, the scene's less the concept's for a
 * shade) and whether it is past its tolerance.
 */
const MatchRow = Schema.Struct({
  name: Schema.String,
  unit: RowUnit,
  concept: Schema.optionalKey(Schema.Finite),
  scene: Schema.optionalKey(Schema.Finite),
  diff: Schema.optionalKey(Schema.Finite),
  flagged: Schema.Boolean,
  note: Schema.optionalKey(Schema.String),
});
type MatchRow = typeof MatchRow.Type;

/** A figure matched: its name, its rig's key, its concept, its table, and the side-by-side and table files written. */
export const FigureMatched = Schema.Struct({
  figure: Schema.String,
  key: Schema.String,
  concept: ConceptRef,
  rows: Schema.Array(MatchRow),
  /** The side-by-side PNG, absolute: the concept left, the scene right, at one head height. */
  side: Schema.String,
  /** The table as Markdown, absolute. */
  table: Schema.String,
  /** The two crops at 1:1, absolute: the concept's by its box, the scene's by the figure's (`sceneBoxOf`). What a critique sees. */
  crops: Schema.Struct({ concept: Schema.String, scene: Schema.String }),
});
export type FigureMatched = typeof FigureMatched.Type;

/** A figure drawn at the place that was not matched, and why (no concept declared, its image unreadable, no figure read). */
export const Unmatched = Schema.Struct({ figure: Schema.String, reason: Schema.String });
export type Unmatched = typeof Unmatched.Type;

/** What the lab answers a match: the build, the frame drawn, each figure matched and each not. */
export const MatchTaken = Schema.Struct({
  build: Schema.String,
  scene: Schema.String,
  at: Schema.String,
  frame: Schema.Int,
  /** Seconds into the scene of the frame drawn. */
  time: Schema.Finite,
  figures: Schema.Array(FigureMatched),
  unmatched: Schema.Array(Unmatched),
});
export type MatchTaken = typeof MatchTaken.Type;

/** A `--figure` the frame does not draw: named with the figures it draws. */
export class MatchFigureUnknown extends Schema.TaggedError<MatchFigureUnknown>()(
  'MatchFigureUnknown',
  {
    scene: Schema.String,
    figure: Schema.String,
    known: Schema.Array(Schema.String),
  },
) {
  override get message() {
    return `scene ${this.scene} draws no figure "${this.figure}" there (it draws: ${this.known.join(', ') || 'none'})`;
  }
}

// ---------------------------------------------------------------------------
// The table

/** A ratio past this share of the concept's is flagged. */
const RATIO_TOLERANCE = 0.05;

/** Ink on the hair/skin edge longer than this share of the head's width is flagged: the owner's rule is none. */
const INTERIOR_INK_MOST = 0.02;

/** A light rim inside an inner part's edge longer than the concept's by this share of the head's width is flagged: the owner's rule is the concept's. */
const INNER_RIM_MORE = 0.1;

/** An outline's mean gap from the concept's past this share of the head's width is flagged: the head's, the body's. */
const SILHOUETTE_TOLERANCE = { head: 0.03, body: 0.05 } as const;

/**
 * A head's turn past this (the eyes' offset in the face's skin on the cheek
 * row, a share of it) is flagged. RBF's figures drawn in their concepts' turn
 * differ by 0.05 at most: Christ by −0.052, the farmer at rain 14.19 s by
 * 0.047, cold's prosecutor by −0.002 (measured, 2026-10-18). A three-quarter
 * concept drawn front (Christ's −0.142 drawn 0) would differ by 0.14.
 */
const TURN_TOLERANCE = 0.1;

/**
 * A head's roll past this many degrees, beside what a pixel either way at
 * each eye makes of the eye line (a small concept's eyes are read coarsely),
 * is flagged. RBF's farmer reads −11.7° in his concept and 0.4° at rain
 * 14.19 s: 12.1° past his 9.8°, flagged. Christ reads +5.0° in his concept
 * (a 28.6-pixel eye line) and −5.3° at court 16.51 s: 10.3° under his 11.5°
 * (measured, 2026-10-18).
 */
const ROLL_TOLERANCE = 6;

/** The degrees one pixel either way at each eye can tilt an eye line `eyes` pixels long. */
const rollGrain = (eyes: number) => (Math.atan2(2, Math.max(1, eyes)) * 180) / Math.PI;

/** A shade's tolerances, in its unit: a value drop, a hue turn, the saturation kept, the edge's angle. */
const SHADE_TOLERANCE = { drop: 0.05, turn: 8, kept: 0.15, edge: 15 } as const;

const valueOf = (m: FigureMeasure, ratio: Ratio): Option.Option<number> =>
  Option.map(
    Arr.findFirst(m.ratios, (r) => r.ratio === ratio),
    (r) => r.value,
  );

const whyMissing = (m: FigureMeasure, ratio: Ratio): Option.Option<string> =>
  Option.map(
    Arr.findFirst(m.missing, (r) => r.ratio === ratio),
    (r) => r.why,
  );

/** A row's difference: percent of the concept's for a ratio (none when the concept's is 0), else the scene's less the concept's. */
const diffOf = (unit: RowUnit, concept: number, scene: number): Option.Option<number> =>
  Match.value(unit).pipe(
    Match.when('ratio', () =>
      Option.map(
        Option.liftPredicate(Math.abs(concept), (size) => size > 0),
        (size) => ((scene - concept) / size) * 100,
      ),
    ),
    Match.orElse(() => Option.some(scene - concept)),
  );

/** A row from its two sides' numbers, each perhaps missing (with why), and how its difference is told and flagged. */
const rowOf = (
  name: string,
  unit: RowUnit,
  concept: Option.Option<number>,
  scene: Option.Option<number>,
  why: { readonly concept: Option.Option<string>; readonly scene: Option.Option<string> },
  tolerance: number,
): MatchRow => {
  const sides = {
    ...Option.match(concept, { onNone: () => ({}), onSome: (v) => ({ concept: v }) }),
    ...Option.match(scene, { onNone: () => ({}), onSome: (v) => ({ scene: v }) }),
  };
  const notes = [
    ...Option.toArray(Option.map(why.concept, (w) => `concept: ${w}`)),
    ...Option.toArray(Option.map(why.scene, (w) => `scene: ${w}`)),
  ];
  const noted = Option.map(Option.liftPredicate(notes, Arr.isArrayNonEmpty), (all) =>
    all.join('; '),
  );
  const diff = Option.flatMap(Option.all([concept, scene]), ([c, d]) => diffOf(unit, c, d));
  const past = Match.value(unit).pipe(
    Match.when('ratio', () => tolerance * 100),
    Match.orElse(() => tolerance),
  );
  return {
    name,
    unit,
    ...sides,
    ...Option.match(diff, { onNone: () => ({}), onSome: (d) => ({ diff: d }) }),
    flagged: Option.exists(diff, (d) => Math.abs(d) > past),
    ...Option.match(noted, { onNone: () => ({}), onSome: (note) => ({ note }) }),
  };
};

/** A shade's hue turn: the shade's hue less the lit's, the short way round (degrees, -180 to 180). */
const turnOf = (s: Shading) => ((s.shade.hue - s.lit.hue + 540) % 360) - 180;

/** The shading rows of one part: the relative shifts, flagged past their tolerance, then each side's absolute colours, never flagged (the scene's light lifts them). */
const shadeRows = (
  part: 'head' | 'body',
  concept: Option.Option<Shading>,
  scene: Option.Option<Shading>,
): ReadonlyArray<MatchRow> => {
  const none = (side: Option.Option<Shading>) =>
    Option.match(side, {
      onNone: () => Option.some('one tone, no shade read'),
      onSome: () => Option.none<string>(),
    });
  const why = { concept: none(concept), scene: none(scene) };
  const by = (f: (s: Shading) => number) => [Option.map(concept, f), Option.map(scene, f)] as const;
  const kindOf = (side: Option.Option<Shading>) =>
    Option.getOrElse(
      Option.map(side, (s): string => s.kind),
      () => 'none',
    );
  return [
    rowOf(
      `${part} shade: value drop`,
      'value',
      ...by((s) => s.lit.value - s.shade.value),
      why,
      SHADE_TOLERANCE.drop,
    ),
    rowOf(`${part} shade: hue turn`, 'degrees', ...by(turnOf), why, SHADE_TOLERANCE.turn),
    rowOf(
      `${part} shade: saturation kept`,
      'value',
      ...by((s) => s.shade.saturation / Math.max(Number.EPSILON, s.lit.saturation)),
      why,
      SHADE_TOLERANCE.kept,
    ),
    rowOf(`${part} shade: edge angle`, 'degrees', ...by((s) => s.edge), why, SHADE_TOLERANCE.edge),
    {
      name: `${part} shade: colour, not grey`,
      unit: 'rule',
      flagged: Option.exists(scene, (s) => s.kind === 'grey'),
      note: `concept ${kindOf(concept)}, scene ${kindOf(scene)}`,
    },
    ...(['lit', 'shade'] as const).flatMap((side) =>
      (['hue', 'saturation', 'value'] as const).map((channel): MatchRow => ({
        ...rowOf(
          `${part} ${side}: ${channel}`,
          Match.value(channel).pipe(
            Match.when('hue', (): RowUnit => 'degrees'),
            Match.orElse((): RowUnit => 'value'),
          ),
          ...by((s) => s[side][channel]),
          why,
          Infinity,
        ),
        flagged: false,
      })),
    ),
  ];
};

/** Where on a head an angle clockwise from straight up lies, as a line names it. */
const SIDES = [
  'top',
  'top right',
  'right',
  'bottom right',
  'bottom',
  'bottom left',
  'left',
  'top left',
] as const;

/** The largest of `values` by `size`, none when there are none. */
const largestBy = <A>(values: ReadonlyArray<A>, size: (a: A) => number): Option.Option<A> =>
  Option.map(Option.liftPredicate(values, Arr.isReadonlyArrayNonEmpty), (some) =>
    Arr.max(some, Order.mapInput(Order.Number, size)),
  );

/** The head's outline row: the mean gap of its radii from the concept's, flagged past its tolerance, the widest gap named by its side. */
const headRow = (c: FigureSilhouette, s: FigureSilhouette): MatchRow => {
  const gaps = Arr.zipWith(c.head, s.head, (painted, drawn) => drawn - painted).map((gap, k) => ({
    gap,
    k,
  }));
  const head = gaps.reduce((sum, g) => sum + Math.abs(g.gap), 0) / Math.max(1, gaps.length);
  const name = "head outline: mean gap from the concept's";
  return Option.match(
    largestBy(gaps, (g) => Math.abs(g.gap)),
    {
      onNone: (): MatchRow => ({ name, unit: 'value', flagged: false, note: 'no outline read' }),
      onSome: ({ gap, k }): MatchRow => {
        const degrees = (360 * k) / HEAD_RADII;
        const side = SIDES[Math.round(degrees / 45) % SIDES.length];
        const way = Match.value(gap > 0).pipe(
          Match.when(true, () => 'outside'),
          Match.orElse(() => 'inside'),
        );
        return {
          name,
          unit: 'value',
          scene: head,
          flagged: head > SILHOUETTE_TOLERANCE.head,
          note: `widest at ${degrees.toFixed(0)}° (${side}): the scene's ${way} by ${Math.abs(gap).toFixed(3)}`,
        };
      },
    },
  );
};

/** Each concept body row with the scene's nearest in height, where one lies within a fortieth of a head. */
const bodyPairs = (c: FigureSilhouette, s: FigureSilhouette) =>
  c.body.flatMap((row) =>
    Option.toArray(
      Option.map(
        Option.filter(
          largestBy(s.body, (q) => -Math.abs(q.y - row.y)),
          (near) => Math.abs(near.y - row.y) <= 0.025,
        ),
        (near) => ({ c: row, s: near }),
      ),
    ),
  );

/** The body's outline row: the mean gap of its sides from the concept's over the rows both show, flagged past its tolerance, the widest named. */
const bodyRow = (c: FigureSilhouette, s: FigureSilhouette): MatchRow => {
  const pairs = bodyPairs(c, s);
  const gapOf = (p: (typeof pairs)[number]) =>
    (Math.abs(p.s.left - p.c.left) + Math.abs(p.s.right - p.c.right)) / 2;
  const body = pairs.reduce((sum, p) => sum + gapOf(p), 0) / Math.max(1, pairs.length);
  const name = "body outline: mean gap from the concept's";
  return Option.match(largestBy(pairs, gapOf), {
    onNone: (): MatchRow => ({
      name,
      unit: 'value',
      flagged: false,
      note: 'no body rows both show',
    }),
    onSome: (wide): MatchRow => ({
      name,
      unit: 'value',
      scene: body,
      flagged: body > SILHOUETTE_TOLERANCE.body,
      note: `over ${pairs.length} rows; widest ${wide.c.y.toFixed(2)} heads under the head's centre: left ${(wide.s.left - wide.c.left).toFixed(3)}, right ${(wide.s.right - wide.c.right).toFixed(3)}`,
    }),
  });
};

/** Whether a figure's feet show under its hem, it has none, or they are hidden. */
const feetOf = (m: FigureMeasure): 'shown' | 'none' | 'hidden' =>
  Option.match(Option.fromUndefinedOr(m.silhouette.feet), {
    onSome: () => 'shown',
    onNone: () =>
      Match.value(Option.contains(whyMissing(m, 'feetWidth'), 'no feet under the hem')).pipe(
        Match.when(true, () => 'none' as const),
        Match.orElse(() => 'hidden' as const),
      ),
  });

/** The outline rows: the head's and the body's mean gap from the concept's (in head widths), and whether both show feet. */
const silhouetteRows = (concept: FigureMeasure, scene: FigureMeasure): ReadonlyArray<MatchRow> => {
  const [c, s] = [concept.silhouette, scene.silhouette];
  const [painted, drawn] = [feetOf(concept), feetOf(scene)];
  const feet: MatchRow = {
    name: 'feet: shown under the hem',
    unit: 'rule',
    flagged: (painted === 'shown' && drawn === 'none') || (painted === 'none' && drawn === 'shown'),
    note: `concept ${painted}, scene ${drawn}`,
  };
  return [headRow(c, s), bodyRow(c, s), feet];
};

/** A rule row: the ratio's row, flagged with `note` where `broken` holds of the two sides. */
const ruleRow = (
  ratio: Ratio,
  sides: readonly [Option.Option<number>, Option.Option<number>],
  why: { readonly concept: Option.Option<string>; readonly scene: Option.Option<string> },
  broken: boolean,
  note: string,
): MatchRow => {
  const row = rowOf(RATIO_LABELS[ratio], 'rule', ...sides, why, Infinity);
  return Match.value(broken).pipe(
    Match.when(true, (): MatchRow => ({ ...row, flagged: true, note })),
    Match.orElse(() => row),
  );
};

/** A row given as information: never flagged, `why` added to its note. */
const informing = (row: MatchRow, why: string): MatchRow => ({
  ...row,
  flagged: false,
  note: [...Option.toArray(Option.fromUndefinedOr(row.note)), why].join('; '),
});

/** Why a figure's height in heads is information (owner, 2026-10-17; `character-design.md`, "One height band for the cast"). */
const HEIGHT_IS_THE_BAND =
  "information: a figure's height comes from the cast's height band, and a concept is a design sketch";

/** The face's marks an expression moves: the eyes' height (a squint), the brows, the mouth. */
const EXPRESSION_RATIOS: ReadonlySet<Ratio> = new Set([
  'eyeHeight',
  'browLength',
  'browAbove',
  'mouthWidth',
  'mouthBelowCentre',
]);

/** Each side's mouth pose, or none. */
const posesOf = (concept: FigureMeasure, scene: FigureMeasure) =>
  [Option.fromUndefinedOr(concept.mouth), Option.fromUndefinedOr(scene.mouth)] as const;

/** The face's pose as each mouth shows it: information, never flagged. */
const poseRow = (concept: FigureMeasure, scene: FigureMeasure): MatchRow => {
  const [painted, drawn] = posesOf(concept, scene).map((pose) =>
    Option.getOrElse(pose, () => 'none'),
  );
  return {
    name: 'face: its mouth',
    unit: 'rule',
    flagged: false,
    note: `concept ${painted}, scene ${drawn}`,
  };
};

/** Why the face's marks are information where the two mouths differ (a shout against a frown), or none where they agree. */
const expressionDiffers = (concept: FigureMeasure, scene: FigureMeasure): Option.Option<string> =>
  Option.flatMap(Option.all(posesOf(concept, scene)), ([painted, drawn]) =>
    Option.liftPredicate(
      `information: the expression differs (the concept's mouth ${painted}, the scene's ${drawn}), so the face's marks do not compare`,
      () => painted !== drawn,
    ),
  );

/** One ratio's row: a ratio flagged past its tolerance, or an owner's rule (no ink of the hair's own; no light rim the concept does not paint). */
const ratioRow = (concept: FigureMeasure, scene: FigureMeasure, ratio: Ratio): MatchRow => {
  const why = { concept: whyMissing(concept, ratio), scene: whyMissing(scene, ratio) };
  const sides = [valueOf(concept, ratio), valueOf(scene, ratio)] as const;
  const [painted, drawn] = sides;
  return Match.value(ratio).pipe(
    Match.when('interiorInk', () =>
      ruleRow(
        ratio,
        sides,
        why,
        Option.exists(drawn, (v) => v > INTERIOR_INK_MOST),
        'the hair carries its own line: the owner rule is none',
      ),
    ),
    Match.when('innerRim', () =>
      ruleRow(
        ratio,
        sides,
        why,
        Option.exists(drawn, (v) => v - Option.getOrElse(painted, () => 0) > INNER_RIM_MORE),
        'a light rim inside an inner part the concept does not paint: the owner rule is none',
      ),
    ),
    Match.when('heightInHeads', () =>
      informing(rowOf(RATIO_LABELS[ratio], 'ratio', ...sides, why, Infinity), HEIGHT_IS_THE_BAND),
    ),
    Match.orElse(() => rowOf(RATIO_LABELS[ratio], 'ratio', ...sides, why, RATIO_TOLERANCE)),
  );
};

/** Every ratio's row, the face's marks information where the expression differs, then the face's pose. */
const ratioRows = (concept: FigureMeasure, scene: FigureMeasure): ReadonlyArray<MatchRow> => {
  const differs = expressionDiffers(concept, scene);
  return [
    ...RATIOS.map((ratio) => {
      const row = ratioRow(concept, scene, ratio);
      return Option.match(
        Option.filter(differs, () => EXPRESSION_RATIOS.has(ratio)),
        { onNone: () => row, onSome: (why) => informing(row, why) },
      );
    }),
    poseRow(concept, scene),
  ];
};

/** Why a turn or a roll that differs is flagged, never information (owner, 2026-10-17, on the RBF v3 cast; `character-design.md`). */
const ANGLE_IS_DESIGN = "a concept's head angle is design, not a sketch's slip: draw the concept's";

/** The head's facing: its turn and its roll against the concept's, each flagged past its tolerance. */
const facingRows = (concept: FigureMeasure, scene: FigureMeasure): ReadonlyArray<MatchRow> => {
  const none = { concept: Option.none<string>(), scene: Option.none<string>() };
  const [c, s] = [concept.facing, scene.facing];
  const turn = rowOf(
    'head: turn (eyes in the face)',
    'value',
    Option.some(c.turn),
    Option.some(s.turn),
    none,
    TURN_TOLERANCE,
  );
  const roll = rowOf(
    'head: roll (the eye line)',
    'degrees',
    Option.some(c.roll),
    Option.some(s.roll),
    none,
    ROLL_TOLERANCE + rollGrain(c.eyes) + rollGrain(s.eyes),
  );
  return [turn, roll].map((row) =>
    Match.value(row.flagged).pipe(
      Match.when(true, (): MatchRow => ({ ...row, note: ANGLE_IS_DESIGN })),
      Match.orElse(() => row),
    ),
  );
};

/** What each artifact is, as its row says it. */
const ARTIFACT_LABELS: Readonly<Record<ArtifactKind, string>> = {
  seam: 'artifacts: seam (a light line between two fills)',
  sliver: 'artifacts: sliver (a fill short of the outline)',
  weather: 'artifacts: weather over the face',
};

/** The most boxes a row's note lists. */
const BOXES_LISTED = 4;

/**
 * A row per artifact kind: the scene's marks' length in head widths, flagged
 * where it has any (the owner's rule is none, 2026-10-17: "theres some
 * artifacts in the render"), its boxes in the scene crop's pixels listed. A
 * concept is painted, so its side is not read.
 */
const artifactRows = (scene: FigureMeasure): ReadonlyArray<MatchRow> => {
  const width = Math.max(1, scene.head[2] - scene.head[0]);
  return ARTIFACT_KINDS.map((kind): MatchRow => {
    const marks = scene.artifacts.filter((a) => a.kind === kind);
    const row: MatchRow = {
      name: ARTIFACT_LABELS[kind],
      unit: 'rule',
      scene: marks.reduce((sum, a) => sum + a.length, 0) / width,
      flagged: marks.length > 0,
    };
    return Option.match(Arr.head(marks), {
      onNone: () => row,
      onSome: () => ({ ...row, note: artifactNote(marks) }),
    });
  });
};

/** Where a row's marks lie, in the scene crop's pixels: the first `BOXES_LISTED` boxes, and how many there are. */
const artifactNote = (marks: ReadonlyArray<ArtifactMark>): string => {
  const at = marks
    .slice(0, BOXES_LISTED)
    .map((a) => a.box.map(Math.round).join(','))
    .join(' ');
  const more = Match.value(marks.length > BOXES_LISTED).pipe(
    Match.when(true, () => ' …'),
    Match.orElse(() => ''),
  );
  return `${marks.length} in the scene crop at ${at}${more}: the owner rule is none`;
};

/** The concept's measure against the scene's, row by row: every ratio, the facing, the outlines, the artifacts, then the head's and the body's shading. */
export const compareFigures = (
  concept: FigureMeasure,
  scene: FigureMeasure,
): ReadonlyArray<MatchRow> => [
  ...ratioRows(concept, scene),
  ...facingRows(concept, scene),
  ...silhouetteRows(concept, scene),
  ...artifactRows(scene),
  ...shadeRows(
    'head',
    Option.fromUndefinedOr(concept.headShading),
    Option.fromUndefinedOr(scene.headShading),
  ),
  ...shadeRows(
    'body',
    Option.fromUndefinedOr(concept.bodyShading),
    Option.fromUndefinedOr(scene.bodyShading),
  ),
];

/** A number as a table writes it: degrees whole, the rest to three places. */
const numberIn = (unit: RowUnit, v: number) =>
  Match.value(unit).pipe(
    Match.when('degrees', () => v.toFixed(0)),
    Match.orElse(() => v.toFixed(3)),
  );

const cell = (row: MatchRow, v: Option.Option<number>) =>
  Option.getOrElse(
    Option.map(v, (n) => numberIn(row.unit, n)),
    () => '–',
  );

const diffCell = (row: MatchRow) =>
  Option.getOrElse(
    Option.map(Option.fromUndefinedOr(row.diff), (d) => {
      const sign = Match.value(d > 0).pipe(
        Match.when(true, () => '+'),
        Match.orElse(() => ''),
      );
      return Match.value(row.unit).pipe(
        Match.when('ratio', () => `${sign}${d.toFixed(0)}%`),
        Match.orElse((unit) => `${sign}${numberIn(unit, d)}`),
      );
    }),
    () => '–',
  );

const sidesOf = (row: MatchRow) =>
  [Option.fromUndefinedOr(row.concept), Option.fromUndefinedOr(row.scene)] as const;

/** A figure's table as Markdown: a heading, then a row per measure, flagged rows marked. */
export const matchTable = (
  figure: string,
  concept: ConceptRef,
  rows: ReadonlyArray<MatchRow>,
  place: string,
): string =>
  [
    `### ${figure} (${place})`,
    '',
    `Concept: ${conceptImageName(concept.image)}, box ${concept.box.join(',')}. Ratios are shares of the head's outer width, the face's marks (eyes, brows, mouth) of the eye spacing; a ratio is flagged past ${RATIO_TOLERANCE * 100}% of the concept's.`,
    '',
    '| Measure | Concept | Scene | Diff | Flag | Note |',
    '|---|---|---|---|---|---|',
    ...rows.map((row) => {
      const [painted, drawn] = sidesOf(row);
      const flag = Match.value(row.flagged).pipe(
        Match.when(true, () => 'FLAG'),
        Match.orElse(() => ''),
      );
      const note = Option.getOrElse(Option.fromUndefinedOr(row.note), () => '');
      return `| ${row.name} | ${cell(row, painted)} | ${cell(row, drawn)} | ${diffCell(row)} | ${flag} | ${note} |`;
    }),
    '',
  ].join('\n');

/** A figure matched as the CLI prints it: its files, then its flagged rows. */
export const matchLines = (m: FigureMatched): ReadonlyArray<string> => {
  const flagged = m.rows.filter((r) => r.flagged);
  return [
    `${m.figure}: ${m.side} ${m.table} flagged=${flagged.length}`,
    ...flagged.map((r) => {
      const [painted, drawn] = sidesOf(r);
      const note = Option.getOrElse(
        Option.map(Option.fromUndefinedOr(r.note), (n) => ` (${n})`),
        () => '',
      );
      return `  ${r.name}: concept ${cell(r, painted)} scene ${cell(r, drawn)} ${diffCell(r)}${note}`;
    }),
  ];
};

/** A match's files' stem in its scene's folder: the figure, the time and the build, so a file once written is never rewritten with other pixels. */
export const matchStem = (figure: string, time: number, build: string): string =>
  `${figure}.t${time.toFixed(2).padStart(7, '0')}.b${build}`;

/** The colour a concept's outline is stroked in over the scene: a magenta no house figure is painted in. */
const OUTLINE_COLOUR = [232, 0, 140] as const;

/**
 * The concept's outline (`FigureSilhouette`) as paths in a picture's pixels, laid
 * on the figure whose head's outer box is `head`, `factor` times its size:
 * the head's outline closed, each side of the body a line (broken where the
 * body is hidden or something meets its side), and the feet's box.
 */
const outlinePaths = (
  silhouette: FigureSilhouette,
  head: PixelBox,
  factor: number,
): ReadonlyArray<RasterPath> => {
  const W = head[2] - head[0];
  const [cx, cy] = [(head[0] + head[2]) / 2, (head[1] + head[3]) / 2];
  const at = (u: number, v: number) => [(cx + u * W) * factor, (cy + v * W) * factor] as const;
  const radius = silhouette.head.map((r, k) => {
    const angle = (2 * Math.PI * k) / silhouette.head.length;
    return at(r * Math.sin(angle), -r * Math.cos(angle));
  });
  // The body's rows run in runs: a gap past three rows' spacing is where it is hidden, a side's jump past a quarter of a head where something meets it.
  type Edge = (typeof silhouette.body)[number];
  const joins = (last: Edge, row: Edge) =>
    row.y - last.y <= 0.16 &&
    Math.abs(row.left - last.left) <= 0.25 &&
    Math.abs(row.right - last.right) <= 0.25;
  const runs = silhouette.body.reduce<Array<Array<Edge>>>((all, row) => {
    const joined = Option.flatMap(Arr.last(all), (run) =>
      Option.filter(
        Option.map(Arr.last(run), (last) => ({ run, last })),
        ({ last }) => joins(last, row),
      ),
    );
    Option.match(joined, { onNone: () => all.push([row]), onSome: ({ run }) => run.push(row) });
    return all;
  }, []);
  const sides = runs.flatMap((run) => [
    { points: run.map((row) => at(row.left, row.y)), closed: false },
    { points: run.map((row) => at(row.right, row.y)), closed: false },
  ]);
  const feet = Option.toArray(
    Option.map(Option.fromUndefinedOr(silhouette.feet), ([x0, y0, x1, y1]) => ({
      points: [at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1)],
      closed: true,
    })),
  );
  return [{ points: radius, closed: true }, ...sides, ...feet];
};

/** The head's height, in pixels, both sides of a side-by-side are scaled to. */
const SIDE_HEAD = 200;

/** Each artifact's colour where the side-by-side rings it. */
const ARTIFACT_COLOURS: Readonly<Record<ArtifactKind, readonly [number, number, number]>> = {
  seam: [255, 0, 0],
  sliver: [0, 90, 255],
  weather: [0, 200, 0],
};

/** `raster` (the scene crop scaled by `factor`) with each of its artifacts ringed in its kind's colour. */
const markArtifacts = (raster: Raster, measure: FigureMeasure, factor: number): Raster =>
  measure.artifacts.reduce((out, a) => {
    const [x0, y0, x1, y1] = [
      a.box[0] * factor,
      a.box[1] * factor,
      a.box[2] * factor,
      a.box[3] * factor,
    ];
    const room = 3;
    return strokeRaster(
      out,
      [
        {
          points: [
            [x0 - room, y0 - room],
            [x1 + room, y0 - room],
            [x1 + room, y1 + room],
            [x0 - room, y1 + room],
          ],
          closed: true,
        },
      ],
      ARTIFACT_COLOURS[a.kind],
      2,
    );
  }, raster);

/**
 * The concept's crop left, the scene's in the middle, each scaled so its head
 * is `head` pixels tall and set down so the heads' tops meet, and right the
 * scene again with the concept's outline over it (`OUTLINE_COLOUR`), laid
 * by the head's centre and width: the proportions a table counts, seen at
 * one size, the outlines one over the other, and the scene's artifacts
 * ringed in the middle (`ARTIFACT_COLOURS`).
 */
export const sideBySide = (
  concept: { readonly crop: Raster; readonly measure: FigureMeasure },
  scene: { readonly crop: Raster; readonly measure: FigureMeasure },
  head: number = SIDE_HEAD,
): Raster => {
  const scaled = ({
    crop,
    measure,
  }: {
    readonly crop: Raster;
    readonly measure: FigureMeasure;
  }) => {
    const factor = head / Math.max(1, measure.head[3] - measure.head[1]);
    return { raster: scaleRaster(crop, factor), top: measure.head[1] * factor, factor };
  };
  const [left, scaledScene] = [scaled(concept), scaled(scene)];
  const middle = {
    ...scaledScene,
    raster: markArtifacts(scaledScene.raster, scene.measure, scaledScene.factor),
  };
  const over = strokeRaster(
    middle.raster,
    outlinePaths(concept.measure.silhouette, scene.measure.head, middle.factor),
    OUTLINE_COLOUR,
    Math.max(2, head / 70),
  );
  return besideRaster([left, middle, { raster: over, top: middle.top }], Math.round(head / 8));
};
