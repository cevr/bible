// A film's storyboard as pure data: the board a film is drawn to, before its
// scenes are built. Each beat gets a few panels, each held from a `{mark}`
// its picture turns on (or from the beat's start); each panel is the images
// tried for it (generated, imported or made again on a tweak note), the one
// kept and why. A beat's board is approved as it stands: the approval keeps
// the tries it was given on, so a later pick leaves it stale, never deleted,
// as the catalogue's approvals are. `src/films/<film>/board.json` holds the
// record (committed); the images sit beside it in `board/` (git-ignored, like
// the sounds), each checked by its sha256. The store and the image route are
// the tools'; the lab and the CLI read these. Pure and DOM-free.

import { Array as Arr, Boolean as Bool, Option, Predicate, Result, Schema } from 'effect';
import { parse, readsWord } from './narration.ts';
import { repoJson } from './schema.ts';
import { Segment } from './segment.ts';

/** The most panels a beat's board plans from its picture's marks. */
const PANELS_PER_BEAT = 3;

/** A name the board writes into a file name and a link: a beat's id, a mark, a style's id. */
export const BoardName = Segment.check(
  Schema.isPattern(/^[A-Za-z0-9_-]+$/, {
    message: 'a name of letters, digits, `_` and `-`',
  }),
);
export type BoardName = typeof BoardName.Type;

/** `name` as a board name, when it is one. */
export const boardNamed = Schema.decodeUnknownOption(BoardName);

/** Where a panel is held from when the beat's picture names no mark: the beat's start. */
export const PANEL_START = BoardName.make('start');

/** How a try was made: by the board's own prompt, brought in from elsewhere, or made again on a note. */
const TryMade = Schema.Literals(['generate', 'import', 'tweak']);
type TryMade = typeof TryMade.Type;

/** A file in the board's folder: never a path. */
const BoardFileName = Segment.check(
  Schema.isPattern(/^[A-Za-z0-9_.-]+\.(png|jpe?g|webp)$/, {
    message: 'a file of the board folder (letters, digits, `_`, `.`, `-`; an image)',
  }),
);
type BoardFileName = typeof BoardFileName.Type;

/** One image tried for a panel. */
export const BoardTry = Schema.Struct({
  /** Its number in the panel's history, from 1. */
  n: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  /** The image, in the board's folder. */
  file: BoardFileName,
  /** The image's sha256 (hex), so a copy brought from elsewhere is known to be the same. */
  sha256: Schema.String,
  made: TryMade,
  /** The prompt the image route was sent, exactly; an import made elsewhere carries the one it was made with. */
  prompt: Schema.optionalKey(Schema.String),
  /** The board files the call carried as references, in order: the style's ref, a panel's try, a sketch. */
  refs: Schema.Array(Schema.String),
  /** The note a tweak answers (`n12`). */
  note: Schema.optionalKey(Schema.String),
  /** Where an import came from, said plainly (`rbfconcepts 9005-court-a`). */
  from: Schema.optionalKey(Schema.String),
  /** ISO time. */
  at: Schema.String,
});
export type BoardTry = typeof BoardTry.Type;

/**
 * What the engine sets on a panel in place of a picture (CRAFT rule 1: the
 * narration's words appear only as a full-screen card): a `Card`, the words
 * heard from the panel's mark to `to` (the end of the line when none), set
 * exactly as spoken in the film's card style, `payoff` large; or a `Verse`,
 * Scripture on its page (verbatim, KJV), its phrase highlighted. Never an
 * image: the image route letters badly, and a card's words are the take's.
 */
export const PanelText = Schema.Union([
  Schema.TaggedStruct('Card', {
    to: Schema.optionalKey(BoardName),
    /** The payoff word, read as a take is checked: the first of the card's words that reads it. */
    payoff: Schema.String.check(Schema.isNonEmpty()),
  }),
  Schema.TaggedStruct('Verse', {
    /** `Job 9:2`. */
    ref: Schema.String.check(Schema.isNonEmpty()),
    /** The verse as printed, verbatim. */
    text: Schema.String.check(Schema.isNonEmpty()),
    /** The phrase highlighted: a run of `text`'s words. */
    phrase: Schema.String.check(Schema.isNonEmpty()),
  }),
]).pipe(Schema.toTaggedUnion('_tag'));
export type PanelText = typeof PanelText.Type;

/**
 * A panel: one held frame of a beat, from its mark (or the beat's start)
 * until the next panel. A picture panel is the images tried for it; a text
 * panel (`text`) is set by the engine and has no tries.
 */
export const Panel = Schema.Struct({
  /** `<beat>.<at>`: what a note, a link and the CLI name it by. */
  id: Schema.String,
  beat: BoardName,
  /** The `{mark}` it is held from, or `start`. */
  at: BoardName,
  tries: Schema.Array(BoardTry),
  /** The try kept (its `n`); none until one is picked. */
  kept: Schema.optionalKey(Schema.Int),
  /** Why it was kept, in a sentence. */
  why: Schema.optionalKey(Schema.String),
  /** A card or a verse page the engine sets, in place of a picture. */
  text: Schema.optionalKey(PanelText),
});
export type Panel = typeof Panel.Type;

/** The film's board look: one style block and its reference image, and the film's world in a paragraph. */
export const BoardStyle = Schema.Struct({
  /** The style's id, as the looks study names it (`9005`). */
  id: BoardName,
  name: Schema.String,
  /** The style block every prompt opens with. */
  block: Schema.String,
  /** The style's reference image, in the board's folder. */
  ref: BoardFileName,
  sha256: Schema.String,
  /** What every panel shares: the film's world, its palette and its cast, in a paragraph. */
  world: Schema.optionalKey(Schema.String),
});
export type BoardStyle = typeof BoardStyle.Type;

/** A beat's board approved: the tries kept when it was, so a later pick makes it stale. */
const BeatApproval = Schema.Struct({
  beat: BoardName,
  kept: Schema.Array(Schema.Struct({ panel: Schema.String, try: Schema.Int })),
  /** ISO time. */
  at: Schema.String,
});
type BeatApproval = typeof BeatApproval.Type;

/** `board.json`: a film's storyboard. */
export const BoardFile = Schema.Struct({
  film: Schema.String,
  style: Schema.optionalKey(BoardStyle),
  /** In the film's order: by beat, then by where in the beat's line each is held from. */
  panels: Schema.Array(Panel),
  approvals: Schema.Array(BeatApproval),
});
export type BoardFile = typeof BoardFile.Type;

/** `board.json` on disk. */
export const BoardFileJson = repoJson(BoardFile);

/** A film's board before its first panel. */
export const emptyBoard = (film: string): BoardFile => ({ film, panels: [], approvals: [] });

/** A panel's id: its beat and where it is held from. */
export const panelId = (beat: string, at: string): string => `${beat}.${at}`;

/** What a try's image is: the extensions a board file may end in (`BoardFileName`). */
export const TryExt = Schema.Literals(['png', 'jpg', 'jpeg', 'webp']);
export type TryExt = typeof TryExt.Type;

/** The style's reference image, as the board folder keeps it. */
export const styleFile = (id: BoardName, ext: TryExt): BoardFileName =>
  BoardFileName.make(`style.${id}.${ext}`);

/** The image file of try `n` of the panel held from `at` in `beat`. */
export const tryFile = (
  beat: BoardName,
  at: BoardName,
  n: number,
  ext: TryExt = 'png',
): BoardFileName => BoardFileName.make(`${beat}.${at}.${n}.${ext}`);

/** The panel `id` of `board`. */
export const panelById = (board: BoardFile, id: string): Option.Option<Panel> =>
  Arr.findFirst(board.panels, (p) => p.id === id);

/** The panels of `beat`, in the order its line holds them. */
export const panelsOf = (board: BoardFile, beat: string): ReadonlyArray<Panel> =>
  board.panels.filter((p) => p.beat === beat);

/** The picture panels of `beat`: the ones the image route draws. */
const pictures = (board: BoardFile, beat: string): ReadonlyArray<Panel> =>
  panelsOf(board, beat).filter((p) => Predicate.isUndefined(p.text));

/** Try `n` of `panel`. */
export const tryOf = (panel: Panel, n: number): Option.Option<BoardTry> =>
  Arr.findFirst(panel.tries, (t) => t.n === n);

/** The try a panel shows: the one kept, else its first. None for a panel with no try yet. */
export const shownTry = (panel: Panel): Option.Option<BoardTry> =>
  Option.orElse(
    Option.flatMap(Option.fromUndefinedOr(panel.kept), (n) => tryOf(panel, n)),
    () => Arr.head(panel.tries),
  );

/** The next try's number in `panel`'s history. */
export const nextTry = (panel: Panel): number =>
  Arr.reduce(panel.tries, 0, (most, t) => Math.max(most, t.n)) + 1;

/**
 * Where a beat's panels are held from, as its picture names them: each
 * `{mark}` of its line the picture names in backticks, in the order the line
 * says them, at most `PANELS_PER_BEAT` (the first, the last, and the ones
 * between evenly); a beat whose picture names none of its marks, or that says
 * nothing, gets one panel at its start.
 */
export const plannedAts = (
  beat: string,
  say: Option.Option<string>,
  picture: Option.Option<string>,
): ReadonlyArray<BoardName> => {
  const named = new Set(
    [...Option.getOrElse(picture, () => '').matchAll(/`([A-Za-z0-9_-]+)`/g)].map((m) => m[1]),
  );
  const marks = Option.match(say, {
    onNone: (): ReadonlyArray<BoardName> => [],
    onSome: (text) =>
      Result.match(parse(beat, text), {
        onFailure: (): ReadonlyArray<BoardName> => [],
        onSuccess: (parsed) =>
          [...parsed.marks]
            .toSorted(([, a], [, b]) => a - b)
            .map(([name]) => name)
            .filter((name) => named.has(name))
            .flatMap((name) => Option.toArray(boardNamed(name))),
      }),
  });
  if (marks.length === 0) return [PANEL_START];
  return spread(marks, PANELS_PER_BEAT);
};

/** At most `n` of `items`: the first, the last and the ones between them evenly. */
const spread = <A>(items: ReadonlyArray<A>, n: number): ReadonlyArray<A> => {
  if (items.length <= n) return items;
  const picks = Arr.makeBy(n, (i) => Math.round((i * (items.length - 1)) / (n - 1)));
  return Arr.dedupe(picks).flatMap((i) => Option.toArray(Arr.get(items, i)));
};

/** `board` with `panel` in it: replacing the one of the same id, else placed by `order` (each beat's ats, in the film's order). */
export const withPanel = (
  board: BoardFile,
  panel: Panel,
  order: ReadonlyArray<string>,
): BoardFile => {
  const others = board.panels.filter((p) => p.id !== panel.id);
  const rank = (p: Panel) => {
    const i = order.indexOf(p.id);
    if (i < 0) return order.length;
    return i;
  };
  return {
    ...board,
    panels: [...others, panel].toSorted((a, b) => rank(a) - rank(b)),
  };
};

/** `panel` with `tries` added to its history. */
export const withTries = (panel: Panel, tries: ReadonlyArray<BoardTry>): Panel => ({
  ...panel,
  tries: [...panel.tries, ...tries],
});

/** Why a pick, an approval or a withdrawal is refused: what was asked, and why not. */
export interface BoardRefusal {
  readonly reason: string;
}

/** `board` with try `n` of panel `id` kept, for `why`. */
export const pickTry = (
  board: BoardFile,
  id: string,
  n: number,
  why: Option.Option<string>,
): Result.Result<BoardFile, BoardRefusal> => {
  const panel = panelById(board, id);
  if (Option.isNone(panel))
    return Result.fail({
      reason: `the board has no panel ${id} (it has ${board.panels.map((p) => p.id).join(', ') || 'none'})`,
    });
  if (Predicate.isNotUndefined(panel.value.text))
    return Result.fail({
      reason: `panel ${id} is a ${panel.value.text._tag.toLowerCase()} the engine sets: it has no tries to pick`,
    });
  if (Option.isNone(tryOf(panel.value, n)))
    return Result.fail({
      reason: `panel ${id} has no try ${n} (it has ${panel.value.tries.map((t) => t.n).join(', ') || 'none'})`,
    });
  const kept: Panel = Option.match(
    Option.filter(
      Option.map(why, (w) => w.trim()),
      (w) => w !== '',
    ),
    {
      onNone: () => {
        const { why: _why, ...rest } = panel.value;
        return { ...rest, kept: n };
      },
      onSome: (w) => ({ ...panel.value, kept: n, why: w }),
    },
  );
  return Result.succeed({
    ...board,
    panels: board.panels.map((p) =>
      Bool.match(p.id === id, { onTrue: () => kept, onFalse: () => p }),
    ),
  });
};

/** Whether a beat's board is approved as it stands, approved on tries since changed, or not at all. */
const BoardApprovalState = Schema.Literals(['none', 'approved', 'stale']);
type BoardApprovalState = typeof BoardApprovalState.Type;

/** The tries a beat's board keeps now, picture panel by picture panel. */
const keptNow = (board: BoardFile, beat: string) =>
  pictures(board, beat).flatMap((p) =>
    Option.toArray(Option.map(Option.fromUndefinedOr(p.kept), (n) => ({ panel: p.id, try: n }))),
  );

/**
 * `beat`'s approval state: approved while its picture panels are the ones approved, each keeping the try it kept
 * then; a panel added since (picked or not) or a pick changed makes it stale.
 */
export const approvalOf = (board: BoardFile, beat: string): BoardApprovalState =>
  Option.match(
    Arr.findFirst(board.approvals, (a) => a.beat === beat),
    {
      onNone: (): BoardApprovalState => 'none',
      onSome: (a) => {
        const now = pictures(board, beat);
        const same =
          now.length === a.kept.length &&
          now.every((p) => a.kept.some((was) => was.panel === p.id && was.try === p.kept));
        return Bool.match(same, {
          onTrue: (): BoardApprovalState => 'approved',
          onFalse: (): BoardApprovalState => 'stale',
        });
      },
    },
  );

/** `board` with `beat`'s board approved at `at`: refused while a panel of it keeps no try. */
export const approveBeat = (
  board: BoardFile,
  beat: BoardName,
  at: string,
): Result.Result<BoardFile, BoardRefusal> => {
  const panels = panelsOf(board, beat);
  if (panels.length === 0)
    return Result.fail({ reason: `beat ${beat} has no panel yet: make its board first` });
  const unpicked = pictures(board, beat)
    .filter((p) => Predicate.isUndefined(p.kept))
    .map((p) => p.id);
  if (unpicked.length > 0)
    return Result.fail({ reason: `pick a try of ${unpicked.join(', ')} first` });
  return Result.succeed({
    ...board,
    approvals: [
      ...board.approvals.filter((a) => a.beat !== beat),
      { beat, kept: keptNow(board, beat), at },
    ],
  });
};

/** `board` with `beat`'s approval withdrawn: refused when it has none. */
export const withdrawBeat = (
  board: BoardFile,
  beat: string,
): Result.Result<BoardFile, BoardRefusal> => {
  if (!board.approvals.some((a) => a.beat === beat))
    return Result.fail({ reason: `beat ${beat}'s board is not approved` });
  return Result.succeed({ ...board, approvals: board.approvals.filter((a) => a.beat !== beat) });
};

/**
 * The words a card panel held from `at` sets, as the beat's line says them
 * (from its mark, or the line's start, to `to`, or its end), and the index of
 * its payoff among them; or why not: a mark the line lacks, no word between
 * the marks, a payoff none of them reads.
 */
export const cardLine = (
  beat: string,
  say: string,
  at: string,
  card: { readonly to?: string; readonly payoff: string },
): Result.Result<
  { readonly words: ReadonlyArray<string>; readonly payoff: number },
  BoardRefusal
> =>
  Result.flatMap(
    Result.mapError(parse(beat, say), () => ({ reason: `beat ${beat}: its line does not read` })),
    (parsed) => {
      const words = parsed.spoken.split(/\s+/).filter((w) => w.length > 0);
      const markAt = (name: string) =>
        Option.match(Option.fromUndefinedOr(parsed.marks.get(name)), {
          onNone: () =>
            Result.fail<BoardRefusal>({
              reason: `beat ${beat} has no mark {${name}} (it has ${[...parsed.marks.keys()].join(', ') || 'none'})`,
            }),
          onSome: (i) => Result.succeed(i),
        });
      const fromAt = Bool.match(at === PANEL_START, {
        onTrue: () => Result.succeed(0),
        onFalse: () => markAt(at),
      });
      return Result.flatMap(fromAt, (from) =>
        Result.flatMap(
          Option.match(Option.fromUndefinedOr(card.to), {
            onNone: () => Result.succeed(words.length),
            onSome: markAt,
          }),
          (to) => {
            const said = words.slice(from, to);
            if (said.length === 0)
              return Result.fail({ reason: `the card at ${beat}.${at} sets no words` });
            const payoff = said.findIndex((w) => readsWord(w, card.payoff));
            if (payoff < 0)
              return Result.fail({
                reason: `the card's payoff "${card.payoff}" is none of its words (${said.join(' ')})`,
              });
            return Result.succeed({ words: said, payoff });
          },
        ),
      );
    },
  );

/** A beat as the board's order reads it: its id and its line. */
interface OrderBeat {
  readonly id: string;
  readonly say: Option.Option<string>;
}

/**
 * `ids` (`<beat>.<at>`) in the film's order: by beat as the script runs,
 * then by where in its line each is held from (its start first). An id of a
 * beat or a mark the script lacks goes last, in the order given.
 */
export const filmOrder = (
  beats: ReadonlyArray<OrderBeat>,
  ids: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  const rank = new Map<string, number>();
  for (const [b, beat] of beats.entries()) {
    rank.set(panelId(beat.id, PANEL_START), b * 10_000 - 1);
    const marks = Option.match(beat.say, {
      onNone: () => new Map<string, number>(),
      onSome: (say) =>
        Result.getOrElse(
          Result.map(parse(beat.id, say), (p) => p.marks),
          () => new Map<string, number>(),
        ),
    });
    for (const [mark, word] of marks) rank.set(panelId(beat.id, mark), b * 10_000 + word);
  }
  const last = Number.MAX_SAFE_INTEGER;
  return ids
    .map((id, i) => ({
      id,
      i,
      r: Option.getOrElse(Option.fromUndefinedOr(rank.get(id)), () => last),
    }))
    .toSorted((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.id);
};

/** Whether `phrase` is a run of `text`'s words, as a verse panel highlights it. */
export const phraseIn = (text: string, phrase: string): boolean => {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const want = phrase.split(/\s+/).filter((w) => w.length > 0);
  if (want.length === 0) return false;
  for (let i = 0; i + want.length <= words.length; i++)
    if (want.every((w, k) => words[i + k] === w)) return true;
  return false;
};
