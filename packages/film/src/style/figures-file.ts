// A film's figures file: every figure rig of the film in one Rive project
// (its `figures.riv`), as the film lays it (`figuresFile`). Each artboard has
// a key, and the file draws them in its keys' order. Each has its name, the
// seed its paper's boil crawls by and its place on the editor's stage, and
// draws a composed figure (`figure`, with the artboard its hands are drawn
// on) or a circle hand of a paper at a size. The figures' ink is the house
// look's line at the film's weight. A file that names one artboard twice,
// lays a figure's hands on a hand of another paper, or lays a figure
// `figure` did not return (a copy of one with a part changed, its parts
// never checked), is refused as the module that lays it loads, and the
// house draws no such figure. The house prints the file (`figuresRml`: one
// id counter for it), each locked figure's print alone, which its lock holds
// (`lockedPrints`), and every override its figures carry, with the artboard
// each is laid on (`figureOverrides`). A film lays its file, and writes no
// RML. Pure.

import { Record as Rec, Schema } from 'effect';
import { decoder } from './decode.ts';
import { type ComposedFigure, isComposed } from './figure.ts';
import { DIRECTION, type Direction } from './house.ts';
import { type Laid, overridesIn } from './override.ts';
import { Paper } from './paper.ts';
import { Length } from './parts/measure.ts';
import { drawFigure, drawHand } from './rig/draw.ts';
import { type Figure, figure as rigOf } from './rig/parts.ts';
import { type Element, fragment, ids } from './rig/rml.ts';

/** Where the file lays an artboard. */
interface Placed {
  /** Its name in the file: what a prop asks the file for. */
  readonly name: string;
  /** The seed its paper's boil crawls by. */
  readonly seed: number;
  /** Its place on the editor's stage, left to right. */
  readonly stage: number;
}

/** A composed figure's artboard, and the key of the hand's artboard its hands are drawn on. */
interface FigureBoard<H extends string = string> extends Placed {
  readonly figure: ComposedFigure<string>;
  readonly hands: H;
}

/** A circle hand's artboard: its paper, `size` times the house hand (1 when left out). */
interface HandBoard extends Placed {
  readonly hand: Paper;
  readonly size?: number;
}

type Board = FigureBoard | HandBoard;

/** The keys of the hands' artboards among `B`. */
type HandKey<B> = { readonly [k in keyof B]: B[k] extends HandBoard ? k : never }[keyof B];

/** Each artboard of a file by its key: a figure's, its hands laid on a hand's of the same file, or a hand's. */
type Boards<B> = { readonly [k in keyof B]: FigureBoard<HandKey<B> & string> | HandBoard };

/** A film's figures file as the house prints it: the figures' ink weight, and each artboard by its key, in the file's order. */
interface LaidFile {
  readonly weight: number;
  readonly boards: Readonly<Record<string, Board>>;
}

/** A film's figures file, laid and checked (`figuresFile`), with each artboard's name by its key. */
interface FiguresFile<B> {
  readonly weight: number;
  readonly boards: B;
  readonly artboards: { readonly [k in keyof B & string]: string };
}

/** Where an artboard lies, as checked. */
const PlacedFields = {
  name: Schema.NonEmptyString,
  seed: Schema.Int,
  stage: Schema.Finite,
};

/** A figure `figure` returned (`isComposed`): a copy of one, a part changed in it, was never checked. */
const Composed = Schema.declare(isComposed, {
  expected: 'a figure `figure` returned, not a copy of one: compose a change from its spec',
});

const FigureBoardFields = Schema.Struct({
  ...PlacedFields,
  figure: Composed,
  hands: Schema.String,
});
const HandBoardFields = Schema.Struct({
  ...PlacedFields,
  hand: Paper,
  size: Schema.optionalKey(Length),
});
const FileFields = Schema.Struct({
  weight: Length,
  boards: Schema.Record(Schema.String, Schema.Union([FigureBoardFields, HandBoardFields])),
});

/** Each artboard's name once in the file: a prop asks for an artboard by its name. */
const namedOnce = Schema.makeFilter((file: typeof FileFields.Type) => {
  const names = Object.values(file.boards).map((b) => b.name);
  const twice = names.filter((name, i) => names.indexOf(name) !== i);
  return twice.length === 0 ? true : `an artboard's name is laid twice: ${twice.join(', ')}`;
});

/** Two papers alike. */
const samePaper = Schema.toEquivalence(Paper);

/** A figure's hands laid on a hand's artboard of the file, in their paper: the artboard its print alone draws them on. */
const handsOnTheirHand = Schema.makeFilter((file: typeof FileFields.Type) => {
  const wrong = Object.entries(file.boards).flatMap(([key, b]) => {
    if (!('figure' in b)) return [];
    const on = file.boards[b.hands];
    if (on === undefined || !('hand' in on))
      return [`${key}'s hands are laid on ${b.hands}, which is no hand's artboard of the file`];
    return samePaper(on.hand, b.figure.hands.paper)
      ? []
      : [`${key}'s hands are laid on ${b.hands}, a hand of another paper`];
  });
  return wrong.length === 0 ? true : wrong.join('; ');
});

/** A file, checked: an artboard's name laid twice, or a figure's hands on a hand of another paper, is refused. */
const checkFile = decoder(FileFields.check(namedOnce, handsOnTheirHand));

/** Each artboard's name, by its key. */
const namesOf = <K extends string>(boards: { readonly [k in K]: Placed }) =>
  Rec.map(boards, (b) => b.name);

/**
 * A film's figures file, checked as it is laid: `boards` each artboard by
 * its key, in the order the file draws them; `weight` the figures' ink
 * against the house look's line (`DIRECTION`), as heavy against a head as
 * the film's kept concept draws it.
 */
export const figuresFile = <const B extends Boards<B>>(file: {
  readonly weight: number;
  readonly boards: B;
}): FiguresFile<B> => {
  checkFile(file, 'figuresFile');
  return { ...file, artboards: namesOf<keyof B & string>(file.boards) };
};

/** Whether `board` draws a composed figure. */
const isFigureBoard = (board: Board): board is FigureBoard => 'figure' in board;

/** The figures' line: the house look's, at the file's weight. */
const lineOf = (file: LaidFile): Direction => ({ ...DIRECTION, weight: file.weight });

/** `board`'s rig, its ids from `next`, laid at `stage`: its place in the file, or the stage's start. */
const rigOfBoard = (next: () => string, board: Board, line: Direction, stage = board.stage) =>
  rigOf(next, board.name, board.seed, stage, line);

/** A figure as the house draws it: one `figure` returned, so a file `figuresFile` did not lay draws none it did not check. */
const checkComposed = decoder(Composed);

/** What `board` draws on `rig`: its figure, or its hand at its size. */
const drawn = (rig: Figure, board: Board): Element[] =>
  isFigureBoard(board)
    ? drawFigure(rig, checkComposed(board.figure, board.name))
    : drawHand(rig, board.hand, board.size);

/** The whole project file: each artboard in the file's order, then its view model; one id counter for the file. */
export const figuresRml = (file: LaidFile): string => {
  const next = ids();
  const line = lineOf(file);
  return fragment(Object.values(file.boards).flatMap((b) => drawn(rigOfBoard(next, b, line), b)));
};

/**
 * `board`'s print alone: its figure's artboard and its hands', each with the
 * seed the file lays it with, numbered by a counter of their own and laid
 * at the stage's start, so it is the same text wherever the file lays them
 * and whatever it draws before them.
 */
const aloneRml = (file: LaidFile, board: FigureBoard): string => {
  const next = ids();
  const line = lineOf(file);
  const hands = file.boards[board.hands];
  return fragment(
    [board, ...(hands === undefined ? [] : [hands])].flatMap((b) =>
      drawn(rigOfBoard(next, b, line, 0), b),
    ),
  );
};

/**
 * Each locked figure of `file`, by the artboard it is laid as, with its lock
 * and its print alone: what a film's build and its test hold to its lock
 * (`unlocked`, `@bible/film/style/build`).
 */
export const lockedPrints = (file: LaidFile) =>
  Object.entries(file.boards).flatMap(([item, b]) =>
    isFigureBoard(b) && b.figure.lock !== undefined
      ? [{ item, lock: b.figure.lock, print: aloneRml(file, b) }]
      : [],
  );

/**
 * Every override the figures of `file` carry (`overridesIn`), with the
 * artboard each is laid as: what a film's build and its test hold to the
 * owner's words on its ledger (`unsaid`, `@bible/film/style/build`).
 */
export const figureOverrides = (file: LaidFile): ReadonlyArray<Laid> =>
  Object.entries(file.boards).flatMap(([item, b]) =>
    isFigureBoard(b) ? overridesIn(b.figure).map((override) => ({ item, override })) : [],
  );
