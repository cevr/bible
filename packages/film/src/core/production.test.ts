import { describe, expect, test } from 'bun:test';
import { Array as Arr, Match, Option, Result, Schema } from 'effect';
import { type BoardFile, BoardName, type BoardTry, PANEL_START } from './board.ts';
import { type ChoicePoint, type ChoiceVariant, pointHead } from './choice.ts';
import {
  Entry,
  type ProductionFile,
  boardStageOf,
  ProductionFile as ProductionFileSchema,
  type Said,
  choiceStateOf,
  currentOf,
  moveForward,
  newProduction,
  productionsOf,
  unfiledOf,
  versionAt,
  withAskSaid,
  withFiled,
  withSaid,
} from './production.ts';
import { VersionMoved } from './refusals.ts';
import type { ReviewFolder } from './review.ts';
import { Segment } from './segment.ts';

/** One production's history, as the front door lays it out (`productionsOf`). */
const historyOf = (
  production: string,
  ledger: Option.Option<ProductionFile>,
  folders: ReadonlyArray<ReviewFolder>,
) =>
  Option.getOrThrow(
    Arr.findFirst(
      productionsOf(Option.toArray(ledger), folders),
      (h) => h.production === production,
    ),
  );

const HOUR = 3_600_000;

const variant = (id: string, approved = false): ChoiceVariant => ({
  id,
  label: id,
  lines: [],
  state: 'current',
  staleBy: Option.none(),
  picked: false,
  verbs: [],
  fixed: Option.none(),
  media: { _tag: 'Unseen' },
  key: id,
  approval: Match.value(approved).pipe(
    Match.when(true, (): 'approved' => 'approved'),
    Match.orElse((): 'none' => 'none'),
  ),
  comments: [],
  notes: Option.none(),
});

const choice = (clip: string, variants: ReadonlyArray<ChoiceVariant>): ChoicePoint => ({
  ...pointHead({ _tag: 'Montage', clip }),
  address: Option.none(),
  title: clip,
  lines: [],
  start: 0,
  moments: Option.none(),
  marks: [],
  knob: Option.none(),
  variants,
});

/** A set folder under the `p5` root, its newest file written at `mtime`. */
const folder = (name: string, mtime: number, more: Partial<ReviewFolder> = {}): ReviewFolder => ({
  ref: `p5/${name}`,
  title: Option.some(name),
  blurb: Option.none(),
  mtime,
  sets: [],
  videos: [],
  images: [],
  docs: [],
  ...more,
});

/** The look: v1 opened at 0, v2 at 10 h, v3 at 20 h. */
const look = (): ProductionFile => {
  const first = { ...newProduction('look', 'The look', 0), title: 'The look' };
  const v2 = Result.getOrThrow(
    moveForward(first, { after: 1, title: 'K1', because: Option.some('i like k1') }, 10 * HOUR),
  );
  return Result.getOrThrow(
    moveForward(v2, { after: 2, title: '9005', because: Option.some('i like 9005') }, 20 * HOUR),
  );
};

describe('a production moves forward', () => {
  test('a new version opens after the one the mover saw, numbered by its place', () => {
    const file = look();
    expect(file.versions.map((v) => v.title)).toEqual(['v1', 'K1', '9005']);
    expect(file.versions[2]?.because).toEqual(Option.some('i like 9005'));
  });

  test('a mover who saw an older version is refused with the version now', () => {
    const moved = moveForward(
      look(),
      { after: 2, title: 'late', because: Option.none() },
      30 * HOUR,
    );
    expect(Result.isFailure(moved)).toBe(true);
    const refusal = Result.match(moved, {
      onFailure: Option.some,
      onSuccess: () => Option.none<VersionMoved>(),
    });
    expect(Option.getOrThrow(refusal)).toBeInstanceOf(VersionMoved);
    expect(Option.map(refusal, (r) => r.current)).toEqual(Option.some(3));
  });

  test('a version is never opened before the one before it', () => {
    const file = Result.getOrThrow(
      moveForward(look(), { after: 3, title: 'clock behind', because: Option.none() }, 5 * HOUR),
    );
    expect(file.versions[3]?.at).toBe(20 * HOUR);
  });

  test('the ledger refuses versions out of order', () => {
    const bad = {
      production: 'look',
      title: 'The look',
      versions: [
        { at: 10, title: 'v1' },
        { at: 5, title: 'v2' },
      ],
    };
    expect(() => Schema.decodeUnknownSync(ProductionFileSchema)(bad)).toThrow(/no earlier/);
  });

  test('the version open at a time is the last opened at or before it', () => {
    const file = look();
    expect(versionAt(file, -1)).toBe(1);
    expect(versionAt(file, 9 * HOUR)).toBe(1);
    expect(versionAt(file, 10 * HOUR)).toBe(2);
    expect(versionAt(file, 99 * HOUR)).toBe(3);
  });
});

describe('a production’s history', () => {
  test('a set lands in the version open when it was published, or the one it names', () => {
    const folders = [
      folder('styles', 1 * HOUR, { production: 'look', published: 12 * HOUR }),
      folder('concepts', 21 * HOUR, { production: 'look' }),
      folder('late-for-v2', 25 * HOUR, { production: 'look', version: 2 }),
      folder('brand', 3 * HOUR, { production: 'brand' }),
    ];
    const history = historyOf('look', Option.some(look()), folders);
    const sets = history.versions.map((v) =>
      v.entries.filter(Entry.$is('Published')).map((e) => e.folder.ref),
    );
    // Newest version first.
    expect(sets).toEqual([['p5/concepts'], ['p5/late-for-v2', 'p5/styles'], []]);
    expect(history.versions[0]?.current).toBe(true);
    expect(history.versions[1]?.until).toEqual(Option.some(20 * HOUR));
  });

  test('a set the ledger files lands in its version, and one no root holds is missing', () => {
    const file = withFiled(withFiled(look(), { set: 'cast', version: 2 }), {
      set: 'trashed',
      version: 1,
    });
    const history = historyOf('look', Option.some(file), [folder('cast', 50 * HOUR)]);
    const v2 = history.versions.find((v) => v.n === 2);
    const v1 = history.versions.find((v) => v.n === 1);
    expect(v2?.entries.map((e) => e._tag)).toEqual(['Published']);
    expect(v1?.entries).toEqual([expect.objectContaining({ _tag: 'Missing', set: 'trashed' })]);
  });

  test('a set that names another production is never filed into this one', () => {
    const file = withFiled(look(), { set: 'brand', version: 1 });
    const history = historyOf('look', Option.some(file), [
      folder('brand', HOUR, { production: 'brand' }),
    ]);
    expect(history.versions.flatMap((v) => v.entries.map((e) => e._tag))).toEqual(['Missing']);
  });

  test('the owner’s words land in the version open when they were said', () => {
    const said: Said = {
      _tag: 'Decided',
      at: 15 * HOUR,
      text: 'K1-minimal over Paper Theatre',
      quote: Option.some('minimal when it comes to k1'),
      set: Option.none(),
      point: Option.none(),
      variant: Option.none(),
      ask: Option.none(),
      by: Option.none(),
    };
    const history = historyOf('look', Option.some(withSaid(look(), said)), []);
    expect(history.versions.find((v) => v.n === 2)?.entries).toEqual([
      expect.objectContaining({ _tag: 'Said', said }),
    ]);
  });

  test('an ask waits on the owner until a pick in its choice or a later decision answers it', () => {
    const open = choice('cold', [variant('9005'), variant('9006')]);
    const approved = choice('heads', [variant('a', true), variant('b')]);
    const decided = choice('subtitles', [variant('clean'), variant('punchy')]);
    const quiet = choice('one', [variant('only'), variant('other')]);
    const set = folder('rbf-rive', 25 * HOUR, {
      production: 'look',
      sets: [open, approved, decided, quiet],
    });
    const word = (
      tag: 'Asked' | 'Decided',
      at: number,
      text: string,
      on: Option.Option<string>,
    ): Said => ({
      _tag: tag,
      at,
      text,
      quote: Option.none(),
      set: Option.some('rbf-rive'),
      point: on,
      variant: Option.none(),
      ask: Option.none(),
      by: Option.none(),
    });
    const words = [
      // Asked in v2, still open: it waits on the version open now.
      word('Asked', 15 * HOUR, 'Which cold open?', Option.some(open.id)),
      word('Asked', 25 * HOUR, 'Which heads?', Option.some(approved.id)),
      // A decision before the ask does not answer it; the one after does.
      word('Decided', 24 * HOUR, 'punchy', Option.some(decided.id)),
      word('Asked', 25 * HOUR, 'Which subtitles?', Option.some(decided.id)),
      word('Decided', 26 * HOUR, 'clean', Option.some(decided.id)),
    ];
    const file = words.reduce(withSaid, look());
    const history = historyOf('look', Option.some(file), [set]);
    const waiting = currentOf(history).waiting;
    expect(waiting.map((w) => w.ask.text)).toEqual(['Which cold open?']);
    expect(waiting.map((w) => Option.map(w.point, (p) => p.id))).toEqual([Option.some(open.id)]);
    // Only the current version holds what waits.
    expect(history.versions.slice(1).every((v) => v.waiting.length === 0)).toBe(true);
    const states = set.sets.map((p) => choiceStateOf(set, p, file.said, waiting)._tag);
    expect(states).toEqual(['Waiting', 'Picked', 'Decided', 'Quiet']);
  });

  test("an ask's words answer its own question only, its withdrawal closes it, and each files once", () => {
    const word = (tag: Said['_tag'], at: number, ask: string): Said => ({
      _tag: tag,
      at,
      text: `${tag} ${ask}`,
      quote: Option.none(),
      set: Option.some('gone'),
      point: Option.none(),
      variant: Option.none(),
      ask: Option.some(ask),
      by: Option.none(),
    });
    const asked = [word('Asked', 20 * HOUR, 'a1'), word('Asked', 21 * HOUR, 'a2')].reduce(
      withAskSaid,
      look(),
    );
    const waitingOn = (file: ProductionFile) =>
      currentOf(historyOf('look', Option.some(file), [])).waiting.map((w) => w.ask.text);
    // Ask a1 answered on the same set: a2's question still waits.
    const answered = withAskSaid(asked, word('Decided', 22 * HOUR, 'a1'));
    expect(waitingOn(answered)).toEqual(['Asked a2']);
    // Filed again (a retried close, a second close at once): once.
    const again = [word('Decided', 23 * HOUR, 'a1'), word('Asked', 24 * HOUR, 'a1')].reduce(
      withAskSaid,
      answered,
    );
    expect(again).toEqual(answered);
    // Ask a2 withdrawn: a note naming it closes its wait.
    expect(waitingOn(withAskSaid(answered, word('Noted', 23 * HOUR, 'a2')))).toEqual([]);
  });

  test('a question filed before words named their ask is known by the id its text names', () => {
    const legacy = withSaid(look(), {
      _tag: 'Asked',
      at: 20 * HOUR,
      text: 'Which judge? (ask a0123456789)',
      quote: Option.none(),
      set: Option.some('gone'),
      point: Option.none(),
      variant: Option.none(),
      ask: Option.none(),
      by: Option.none(),
    });
    const on = {
      quote: Option.none(),
      set: Option.some('gone'),
      point: Option.none(),
      variant: Option.none(),
      ask: Option.some('a0123456789'),
      by: Option.none(),
    };
    const closed = [
      { _tag: 'Asked' as const, at: 20 * HOUR, text: 'Which judge? (ask a0123456789)', ...on },
      { _tag: 'Decided' as const, at: 22 * HOUR, text: 'Which judge?: Calmer', ...on },
    ].reduce(withAskSaid, legacy);
    expect(closed.said.map((s) => s._tag)).toEqual(['Asked', 'Decided']);
    expect(currentOf(historyOf('look', Option.some(closed), [])).waiting).toEqual([]);
  });

  test('an ask on a set no root holds still waits, named by its words', () => {
    const file = withSaid(look(), {
      _tag: 'Asked',
      at: 21 * HOUR,
      text: 'Keep the subtitles?',
      quote: Option.none(),
      set: Option.some('gone'),
      point: Option.none(),
      variant: Option.none(),
      ask: Option.none(),
      by: Option.none(),
    });
    const [ask] = currentOf(historyOf('look', Option.some(file), [])).waiting;
    expect(ask?.ask.text).toBe('Keep the subtitles?');
    expect(Option.isNone(ask?.folder ?? Option.some(folder('x', 0)))).toBe(true);
  });

  test('a set published after its version shut keeps a time inside that version', () => {
    const file = withFiled(look(), { set: 'styles', version: 1 });
    const history = historyOf('look', Option.some(file), [folder('styles', 50 * HOUR)]);
    const v1 = history.versions.find((v) => v.n === 1);
    expect(v1?.entries.map((e) => e.at)).toEqual([10 * HOUR]);
  });

  test('a production only its sets name has one version, open since the start', () => {
    const history = historyOf('brand', Option.none(), [
      folder('brand', HOUR, { production: 'brand' }),
    ]);
    expect(history.kept).toBe(false);
    expect(history.versions.map((v) => v.n)).toEqual([1]);
    expect(history.latest).toBe(HOUR);
  });

  test('every production is listed newest first, and the front door keeps only the unfiled', () => {
    const folders = [
      folder('brand', 100 * HOUR, { production: 'brand' }),
      folder('styles', 12 * HOUR, { production: 'look' }),
      folder('loose', 5 * HOUR),
    ];
    const histories = productionsOf([look()], folders);
    expect(histories.map((h) => h.production)).toEqual(['brand', 'look']);
    expect(unfiledOf(histories, folders).map((f) => f.ref)).toEqual(['p5/loose']);
  });
});

describe('a film production’s board stage', () => {
  const tried = (n: number): BoardTry => ({
    n,
    file: Segment.make(`t${n}.png`),
    sha256: 'x',
    made: 'generate',
    refs: [],
    at: '2026-10-14T12:00:00Z',
  });

  test('counts picture panels and the kept, and beats approved as they stand or since changed', () => {
    const A = BoardName.make('a');
    const B = BoardName.make('b');
    const C = BoardName.make('c');
    const board: BoardFile = {
      film: 'f',
      panels: [
        { id: 'a.start', beat: A, at: PANEL_START, tries: [tried(1)], kept: 1 },
        { id: 'a.x', beat: A, at: BoardName.make('x'), tries: [tried(1)], kept: 1 },
        { id: 'b.start', beat: B, at: PANEL_START, tries: [tried(1), tried(2)], kept: 2 },
        { id: 'c.start', beat: C, at: PANEL_START, tries: [] },
        {
          id: 'c.card',
          beat: C,
          at: BoardName.make('card'),
          tries: [],
          text: { _tag: 'Card', payoff: 'just' },
        },
      ],
      approvals: [
        {
          beat: A,
          kept: [
            { panel: 'a.start', try: 1 },
            { panel: 'a.x', try: 1 },
          ],
          at: '2026-10-14T12:00:00Z',
        },
        // Approved on try 1; try 2 is kept now.
        { beat: B, kept: [{ panel: 'b.start', try: 1 }], at: '2026-10-14T12:00:00Z' },
      ],
    };
    expect(boardStageOf(board)).toEqual({ panels: 4, kept: 3, beats: 3, approved: 1, stale: 1 });
  });
});
