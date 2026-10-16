import { describe, expect, test } from 'bun:test';
import { Array as Arr, Option, Result, Schema } from 'effect';
import {
  type BoardFile,
  BoardFileJson,
  BoardName,
  PANEL_START,
  type BoardTry,
  type Panel,
  approvalOf,
  approveBeat,
  cardLine,
  emptyBoard,
  nextTry,
  pickTry,
  plannedAts,
  shownTry,
  withPanel,
  withTries,
  withdrawBeat,
} from './board.ts';
import { Segment } from './segment.ts';

const COLD = BoardName.make('cold');
const JOB = BoardName.make('job');
const RIGHTEOUS = BoardName.make('righteous');

const tried = (n: number): BoardTry => ({
  n,
  file: Segment.make(`cold.righteous.${n}.png`),
  sha256: `sha${n}`,
  made: 'generate',
  prompt: 'p',
  refs: ['style.9005.png'],
  at: '2026-10-14T00:00:00.000Z',
});

const panel = (at: string, tries: number, kept?: number): Panel => ({
  id: `cold.${at}`,
  beat: COLD,
  at: BoardName.make(at),
  tries: Arr.makeBy(tries, (i) => tried(i + 1)),
  ...Option.match(Option.fromUndefinedOr(kept), {
    onNone: () => ({}),
    onSome: (k) => ({ kept: k }),
  }),
});

const board = (...panels: ReadonlyArray<Panel>): BoardFile => ({
  ...emptyBoard('rbf'),
  panels,
});

describe('plannedAts', () => {
  const say =
    'In a {room}court. {judge}The judge {righteous}says righteous. {wait}Wait. {job}Job asked.';
  test('the marks the picture names, in the order the line says them', () => {
    const picture = 'On `job` the question. On `righteous` the gavel. A `drain` cue.';
    expect(plannedAts('cold', Option.some(say), Option.some(picture))).toEqual([RIGHTEOUS, JOB]);
  });
  test('at most three: the first, the last and one between', () => {
    const picture = '`room` `judge` `righteous` `wait` `job`';
    expect(plannedAts('cold', Option.some(say), Option.some(picture))).toEqual([
      BoardName.make('room'),
      RIGHTEOUS,
      JOB,
    ]);
  });
  test('a beat whose picture names no mark, or that says nothing, is one panel at its start', () => {
    expect(plannedAts('cold', Option.some(say), Option.some('a courtroom'))).toEqual([PANEL_START]);
    expect(plannedAts('title', Option.none(), Option.some('`judge`'))).toEqual([PANEL_START]);
  });
});

describe('the board record', () => {
  test('round-trips through board.json', () => {
    const file = withPanel(board(), panel('righteous', 2, 1), ['cold.righteous']);
    const text = Schema.encodeSync(BoardFileJson)(file);
    expect(text.endsWith('}\n')).toBe(true);
    expect(Schema.decodeSync(BoardFileJson)(text)).toEqual(file);
  });
  test('refuses a try file that is a path', () => {
    const file = {
      ...board(),
      panels: [{ ...panel('job', 0), tries: [{ ...tried(1), file: '../x.png' }] }],
    };
    const text = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))(file);
    expect(() => Schema.decodeSync(BoardFileJson)(text)).toThrow();
  });
  test('places a panel in the film order it is given', () => {
    const order = ['cold.righteous', 'cold.job'];
    const once = withPanel(board(), panel('job', 1), order);
    const twice = withPanel(once, panel('righteous', 1), order);
    expect(twice.panels.map((p) => p.id)).toEqual(order);
  });
  test('a tweak adds to the history and numbers on', () => {
    const p = panel('righteous', 2, 1);
    expect(nextTry(p)).toBe(3);
    const after = withTries(p, [{ ...tried(3), made: 'tweak', note: 'n4' }]);
    expect(after.tries.map((t) => t.n)).toEqual([1, 2, 3]);
    // The kept try stays what it was until one is picked.
    expect(Option.map(shownTry(after), (t) => t.n)).toEqual(Option.some(1));
  });
});

describe('picking a try', () => {
  test('keeps it, with why', () => {
    const picked = Result.getOrThrow(
      pickTry(board(panel('righteous', 2)), 'cold.righteous', 2, Option.some(' calmer judge ')),
    );
    expect(picked.panels[0]).toMatchObject({ kept: 2, why: 'calmer judge' });
  });
  test('shows the first try until one is kept', () => {
    expect(Option.map(shownTry(panel('job', 2)), (t) => t.n)).toEqual(Option.some(1));
  });
  test('refuses a panel or a try the board does not have, naming what it has', () => {
    const b = board(panel('righteous', 2));
    expect(Result.getFailure(pickTry(b, 'cold.job', 1, Option.none()))).toEqual(
      Option.some({ reason: 'the board has no panel cold.job (it has cold.righteous)' }),
    );
    expect(Result.getFailure(pickTry(b, 'cold.righteous', 3, Option.none()))).toEqual(
      Option.some({ reason: 'panel cold.righteous has no try 3 (it has 1, 2)' }),
    );
  });
});

describe("approving a beat's board", () => {
  const at = '2026-10-14T00:00:00.000Z';
  test('refuses while a panel keeps no try', () => {
    const b = board(panel('righteous', 2, 1), panel('job', 2));
    expect(Result.getFailure(approveBeat(b, COLD, at))).toEqual(
      Option.some({ reason: 'pick a try of cold.job first' }),
    );
  });
  test('is approved, then stale when a panel keeps another try', () => {
    const b = Result.getOrThrow(approveBeat(board(panel('righteous', 2, 1)), COLD, at));
    expect(approvalOf(b, 'cold')).toBe('approved');
    const repicked = Result.getOrThrow(pickTry(b, 'cold.righteous', 2, Option.none()));
    expect(approvalOf(repicked, 'cold')).toBe('stale');
    expect(approvalOf(repicked, 'title')).toBe('none');
  });
  test('is stale once a panel is added to the beat, picked or not', () => {
    const b = Result.getOrThrow(approveBeat(board(panel('righteous', 2, 1)), COLD, at));
    const added = { ...b, panels: [...b.panels, panel('job', 1)] };
    expect(approvalOf(added, 'cold')).toBe('stale');
    expect(approvalOf({ ...b, panels: [...b.panels, panel('job', 1, 1)] }, 'cold')).toBe('stale');
  });
  test('withdraws, and refuses a withdrawal of nothing', () => {
    const b = Result.getOrThrow(approveBeat(board(panel('righteous', 1, 1)), COLD, at));
    const w = Result.getOrThrow(withdrawBeat(b, 'cold'));
    expect(approvalOf(w, 'cold')).toBe('none');
    expect(Result.isFailure(withdrawBeat(w, 'cold'))).toBe(true);
  });
});

describe('a text panel', () => {
  const card: Panel = {
    id: 'cold.job',
    beat: COLD,
    at: JOB,
    tries: [],
    text: { _tag: 'Card', payoff: 'just' },
  };
  test('sets the words the line says from its mark, exactly, the payoff found', () => {
    const line = Result.getOrThrow(
      cardLine('cold', 'Job asked it: {job}“How should man be just with God?”', 'job', {
        payoff: 'just',
      }),
    );
    expect(line.words).toEqual(['“How', 'should', 'man', 'be', 'just', 'with', 'God?”']);
    expect(line.payoff).toBe(4);
  });
  test('refuses a payoff the card does not say, and a mark the line lacks', () => {
    expect(
      Result.isFailure(cardLine('cold', 'Job asked it: {job}how', 'job', { payoff: 'God' })),
    ).toBe(true);
    expect(
      Result.getFailure(cardLine('cold', 'Job {job}asked', 'nope', { payoff: 'asked' })),
    ).toEqual(Option.some({ reason: 'beat cold has no mark {nope} (it has job)' }));
  });
  test('has no tries to pick, and does not hold a beat from approval', () => {
    const b = board(panel('righteous', 2, 1), card);
    expect(Result.isFailure(pickTry(b, 'cold.job', 1, Option.none()))).toBe(true);
    expect(Result.isSuccess(approveBeat(b, COLD, '2026-10-14T00:00:00.000Z'))).toBe(true);
    const text = Schema.encodeSync(BoardFileJson)(b);
    expect(Schema.decodeSync(BoardFileJson)(text)).toEqual(b);
  });
});
