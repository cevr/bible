// The studio's read model over the films as they stand: Righteousness by
// Faith at v3 (its registered files: a script on the estimated clock, its
// concept kept by the owner's answers) and v2 (a version folder, `v2/`, read
// from its own files: its Board, takes, scenes, acts and score), and the
// cold studies (no ledger, no Board, no concept). The clocks are `film read
// clock`'s answers for them (`--folder v2` for v2), the Board is v2's
// `board.json` with its prompts left out. Only reached stages take a lane;
// the stage is the first not done; the Next row names the first stage ahead
// with what starts it, and the gap it starts from; the Board lane times its
// panels as the animatic shows them; the flags and the header count what
// waits on the owner; the open version is the default.

import { describe, expect, test } from 'bun:test';
import { Array as Arr, Option, Result, Schema } from 'effect';
import { type AskBlock, AskName, type AskRecord, AskState, oneQuestion } from './ask.ts';
import { BoardFile, BoardName, approveBeat, emptyBoard } from './board.ts';
import {
  type Catalogue,
  MAIN_VARIANT,
  type Render,
  approve,
  emptyCatalogue,
  subjectOf,
} from './catalogue.ts';
import {
  type FilmTimeline,
  FilmClock,
  filmClock,
  onlyTracks,
  pickVersion,
  timelineOf,
  versionsOf,
} from './film-timeline.ts';
import { layout } from './layout.ts';
import { ProductionFile } from './production.ts';
import type { Note, NotesFile } from './schema.ts';
import coldClockJson from './fixtures/timeline/cold-studies-clock.json' with { type: 'json' };
import rbfV2BoardJson from './fixtures/timeline/rbf-v2-board.json' with { type: 'json' };
import rbfV2ClockJson from './fixtures/timeline/rbf-v2-clock.json' with { type: 'json' };
import rbfV3ClockJson from './fixtures/timeline/rbf-v3-clock.json' with { type: 'json' };

type TimelineSources = Parameters<typeof timelineOf>[0];
type FilmVersion = FilmTimeline['version'];
type Lane = FilmTimeline['lanes'][number];
type BoardClip = Extract<Lane, { readonly track: 'board' }>['clips'][number];

const RBF = 'righteousness-by-faith';
const COLD = 'cold-studies';

const clockOf = Schema.decodeUnknownSync(FilmClock);
const rbfV2 = clockOf(rbfV2ClockJson);
const rbfV3 = clockOf(rbfV3ClockJson);
const cold = clockOf(coldClockJson);
const rbfV2Board = Schema.decodeUnknownSync(BoardFile)(rbfV2BoardJson);
const name = Schema.decodeSync(AskName);

/** When each of RBF's versions opened, ms. */
const OPENED = { 1: 1_000, 2: 2_000, 3: 3_000 } as const;

/** An ask about RBF in `state`, its one page showing `blocks`. */
const askOf = (
  id: string,
  blocks: ReadonlyArray<AskBlock>,
  state: AskState,
  more: Partial<AskRecord> = {},
): AskRecord => ({
  id: name(id),
  title: `Which ${id}?`,
  why: 'it decides the panel',
  by: 'test',
  film: RBF,
  created: '2026-10-15T00:00:00.000Z',
  ask: oneQuestion(blocks),
  state,
  answered: [],
  ...more,
});
const ASKING = AskState.Asking({ step: name('ask'), answers: {} });
const ANSWERED = AskState.Answered({ step: name('done'), answers: {} });

/** An ask whose page shows Board panels `panels`. */
const askOn = (
  id: string,
  panels: ReadonlyArray<string>,
  state: AskState,
  more: Partial<AskRecord> = {},
) => askOf(id, [{ kind: 'board', film: RBF, panels }], state, more);

/** The owner kept v3's script (an ask showing it) and its concept frames (an ask showing pictures alone). */
const SCRIPT_ASK = askOf('keep-script', [{ kind: 'script', film: RBF }], ANSWERED);
const CONCEPT_ASK = askOf(
  'keep-concept',
  [{ kind: 'image', image: { src: '/api/review/p5/rbf-concepts/a.png' } }],
  ANSWERED,
);

/** RBF's ledger: three versions, the owner's answers to the asks `keeps` filed at each of `keptAt`, and `more`. */
const ledgerOf = (
  keptAt: ReadonlyArray<number>,
  more: ReadonlyArray<unknown> = [],
  keeps: ReadonlyArray<AskRecord> = [SCRIPT_ASK, CONCEPT_ASK],
) =>
  Schema.decodeUnknownSync(ProductionFile)({
    production: RBF,
    title: 'Righteousness by Faith',
    film: RBF,
    versions: [
      { at: OPENED[1], title: 'Canvas cut' },
      { at: OPENED[2], title: 'Rive, in the new look', because: 'Rive is the engine' },
      { at: OPENED[3], title: 'Written from scratch', because: 'the word is a seed' },
    ],
    said: [
      ...keptAt.flatMap((at) =>
        keeps.map((ask, j) => ({
          _tag: 'Decided',
          at: at + j,
          text: `kept by ${ask.id}`,
          ask: ask.id,
        })),
      ),
      ...more,
    ],
  });
const LEDGER = ledgerOf([OPENED[3] + 100]);

/** v2 is a version folder (`v2/`); v3 is on the registered files, and open. */
const rbfVersions = versionsOf(Option.some(LEDGER), [2], RBF);
const versionN = (versions: ReadonlyArray<FilmVersion>, n: number) =>
  Result.getOrThrow(pickVersion(RBF, versions, Option.some(n)));

const noNotes = (film: string): NotesFile => ({ film, seq: 0, notes: [] });

/** RBF's sources at version `n`: its own clock and Board; v3, the open version, has no Board yet. */
const rbf = (n: 2 | 3, more: Partial<TimelineSources> = {}): TimelineSources => ({
  film: RBF,
  ledger: Option.some(LEDGER),
  version: versionN(rbfVersions, n),
  versions: rbfVersions,
  clock: { 2: rbfV2, 3: rbfV3 }[n],
  board: { 2: rbfV2Board, 3: emptyBoard(RBF) }[n],
  openBoard: emptyBoard(RBF),
  catalogue: emptyCatalogue(RBF),
  notes: noNotes(RBF),
  asks: [SCRIPT_ASK, CONCEPT_ASK],
  working: [],
  ...more,
});

const tracks = (t: FilmTimeline) => t.lanes.map((l) => l.track);

const laneOf = <K extends Lane['track']>(t: FilmTimeline, track: K) =>
  t.lanes.find((l): l is Extract<Lane, { readonly track: K }> => l.track === track);

const panelClip = (t: FilmTimeline, panel: string): BoardClip =>
  Option.getOrThrow(Arr.findFirst(laneOf(t, 'board')?.clips ?? [], (c) => c.panel === panel));

const beatOf = (clock: FilmClock, id: string) =>
  Option.getOrThrow(Arr.findFirst(clock.beats, (b) => b.id === id));

const markOf = (clock: FilmClock, beat: string, mark: string) =>
  Option.getOrThrow(Arr.findFirst(beatOf(clock, beat).marks, (m) => m.name === mark)).at;

/** The timings of a film with no take yet. */
const NO_TAKES = { voice: '', scenes: {} };

/** The owner's note on `scene`, `local` seconds in. */
const noteOn = (id: string, scene: string, local: number, status: Note['status']): Note => ({
  id,
  film: RBF,
  scene,
  T: 999,
  local,
  frame: 0,
  text: `note ${id}`,
  seq: 1,
  changed: 1,
  status,
  still: `${id}.png`,
  thread: [],
  createdAt: '2026-10-15T00:00:00.000Z',
});

/** A main video render of `address` with stamp `key`. */
const renderOf = (address: Render['address'], key: string): Render => ({
  address,
  variant: MAIN_VARIANT,
  kind: 'video',
  settings: { scale: 1, captions: false },
  stamp: { commit: Option.none(), key },
  span: Option.none(),
  files: {
    clip: Option.none(),
    share: Option.none(),
    captions: Option.none(),
    chapters: Option.none(),
    images: [],
  },
  sound: Option.none(),
  at: 1,
});

/** `board` with `panel` keeping try `n` in place of the one it kept. */
const keeping = (board: BoardFile, panel: string, n: number): BoardFile => ({
  ...board,
  panels: board.panels.map((p) => Object.assign({ ...p }, p.id === panel && { kept: n })),
});

describe('versions', () => {
  test('RBF: v3 is on the registered files and open, v2 has its folder, v1 keeps none', () => {
    expect(rbfVersions.map((v) => [v.n, v.files, v.open])).toEqual([
      [1, 'none', false],
      [2, 'folder', false],
      [3, 'film', true],
    ]);
  });

  test('the open version is the default; one asked is read; one kept nowhere or unknown is refused', () => {
    expect(Result.getOrThrow(pickVersion(RBF, rbfVersions, Option.none())).n).toBe(3);
    expect(versionN(rbfVersions, 2).title).toBe('Rive, in the new look');
    const unkept = pickVersion(RBF, rbfVersions, Option.some(1));
    expect(Result.isFailure(unkept) && unkept.failure._tag).toBe('FilmVersionUnkept');
    const unknown = pickVersion(RBF, rbfVersions, Option.some(9));
    expect(Result.isFailure(unknown) && unknown.failure.message).toBe(
      `${RBF} has no v9 (its versions: v1, v2, v3)`,
    );
  });

  test('a film with no ledger has one version, open, on its files', () => {
    expect(versionsOf(Option.none(), [], COLD)).toEqual([
      { n: 1, title: COLD, open: true, files: 'film' },
    ]);
  });
});

describe('RBF v3: a kept script on the estimated clock, its concept kept', () => {
  const t = timelineOf(rbf(3));

  test('only the script has a lane; the stage and the Next row are the Board', () => {
    expect(tracks(t)).toEqual(['script']);
    expect(t.flow.map((f) => [f.stage, f.state])).toEqual([
      ['script', 'reached'],
      ['concept', 'reached'],
      ['board', 'ahead'],
      ['voice', 'ahead'],
      ['animatic', 'ahead'],
      ['scenes', 'ahead'],
      ['sound', 'ahead'],
      ['render', 'ahead'],
      ['shorts', 'ahead'],
    ]);
    expect(t.next).toEqual({
      stage: 'board',
      starts: 'Board starts from the kept concept frames',
      later: ['voice', 'animatic', 'scenes', 'sound', 'render', 'shorts'],
    });
    expect(t.header.stage).toBe('board');
  });

  test('its beats are kept, and hatched where they are read from words', () => {
    const clips = laneOf(t, 'script')?.clips ?? [];
    expect(clips.map((c) => c.beat)).toEqual(rbfV3.beats.map((b) => b.id));
    expect(new Set(clips.map((c) => c.state))).toEqual(new Set(['kept']));
    // The title and the credits are silent: their length is declared, not estimated.
    expect(clips.filter((c) => c.clock === 'measured').map((c) => c.beat)).toEqual([
      'title',
      'end',
    ]);
    expect(t.duration).toBeCloseTo(607.38, 2);
    expect(t.bands.map((b) => b.name)).toEqual([
      'verdict',
      'seed',
      'gifts',
      'grain',
      'still at work',
      'harvest',
    ]);
  });

  test('with no decision keeping them, the script is the stage, made, and the Board starts from the concept gap', () => {
    const bare = timelineOf(rbf(3, { ledger: Option.some(ledgerOf([])) }));
    expect(bare.header.stage).toBe('script');
    expect(new Set(laneOf(bare, 'script')?.clips.map((c) => c.state))).toEqual(new Set(['made']));
    expect(bare.flow[1]).toMatchObject({ stage: 'concept', state: 'gap' });
    expect(bare.next).toMatchObject({
      stage: 'board',
      starts: 'Board starts from kept concept frames, and none is kept yet',
      gap: { stage: 'concept' },
    });
  });

  test('with the script kept and no concept, the concept is the stage', () => {
    const ledger = ledgerOf([OPENED[3] + 100], [], [SCRIPT_ASK]);
    const scripted = timelineOf(rbf(3, { ledger: Option.some(ledger) }));
    expect(scripted.header.stage).toBe('concept');
    expect(new Set(laneOf(scripted, 'script')?.clips.map((c) => c.state))).toEqual(
      new Set(['kept']),
    );
    expect(scripted.flow[1]?.state).toBe('gap');
  });

  test("a decision filed in v2 keeps nothing of v3's", () => {
    const earlier = timelineOf(rbf(3, { ledger: Option.some(ledgerOf([OPENED[2] + 100])) }));
    expect(earlier.header.stage).toBe('script');
    expect(earlier.flow[1]?.state).toBe('gap');
  });

  test('a render of the film reaches the render stage; the stage stays the Board', () => {
    const film = renderOf({ _tag: 'Film' }, 'f1');
    const scene = renderOf({ _tag: 'Scenes', ids: ['seed'] }, 's1');
    const rendered: Catalogue = { ...emptyCatalogue(RBF), renders: [film, scene] };
    const catalogue = approve(rendered, subjectOf(film), 2);
    const t2 = timelineOf(rbf(3, { catalogue }));
    expect(tracks(t2)).toEqual(['script', 'render']);
    expect(laneOf(t2, 'render')?.clips.map((c) => [c.address, c.start, c.state])).toEqual([
      ['film', 0, 'approved'],
      ['scenes:seed', beatOf(rbfV3, 'seed').start, 'made'],
    ]);
    expect(laneOf(t2, 'render')?.clips[0]?.dur).toBeCloseTo(t2.duration, 6);
    expect(t2.header.stage).toBe('board');
    expect(t2.next?.stage).toBe('board');
  });
});

describe('RBF v2, read as a version folder', () => {
  const t = timelineOf(rbf(2));

  test('its own material: 54 panels, 18 takes, 20 scenes, 6 acts and 14 movements', () => {
    expect(tracks(t)).toEqual(['script', 'board', 'voice', 'scenes', 'sound']);
    expect(laneOf(t, 'board')?.clips.length).toBe(54);
    expect(laneOf(t, 'voice')?.clips.length).toBe(18);
    expect(laneOf(t, 'scenes')?.clips.length).toBe(20);
    expect(laneOf(t, 'sound')?.clips.length).toBe(14);
    expect(t.bands.map((b) => b.name)).toEqual([
      'cold open',
      'message',
      'faith',
      'forgiveness',
      'power',
      'landing',
    ]);
  });

  test('the stage is the Board (0 of 20 beats approved); its renders are not told apart, so the render is next', () => {
    expect(t.header.stage).toBe('board');
    expect(t.flow.find((f) => f.stage === 'animatic')?.state).toBe('reached');
    expect(t.next).toEqual({
      stage: 'render',
      starts: 'Render comes once the scenes are approved',
      later: ['shorts'],
    });
    const film = renderOf({ _tag: 'Film' }, 'f1');
    const catalogue: Catalogue = { ...emptyCatalogue(RBF), renders: [film] };
    expect(tracks(timelineOf(rbf(2, { catalogue })))).not.toContain('render');
  });

  test("a beat's first panel shows from the beat's start, as the animatic shows it; a later one from its mark", () => {
    const coldBeat = beatOf(rbfV2, 'cold');
    const righteous = markOf(rbfV2, 'cold', 'righteous');
    const asked = markOf(rbfV2, 'cold', 'asked');
    const job = markOf(rbfV2, 'cold', 'job');
    // Held from its mark, `righteous`, which falls after the beat starts.
    expect(righteous).toBeGreaterThan(coldBeat.start);
    expect(panelClip(t, 'cold.righteous')).toMatchObject({
      start: coldBeat.start,
      mark: 'righteous',
      markAt: righteous,
      state: 'kept',
      try: 1,
      card: false,
    });
    expect(panelClip(t, 'cold.righteous').dur).toBeCloseTo(asked - coldBeat.start, 6);
    expect(panelClip(t, 'cold.asked')).toMatchObject({ start: asked, card: true });
    expect(panelClip(t, 'cold.asked').try).toBeUndefined();
    expect(panelClip(t, 'cold.job').dur).toBeCloseTo(coldBeat.start + coldBeat.dur - job, 6);
    // Every beat's first panel sits at its beat's start.
    const firsts = Arr.dedupeWith(laneOf(t, 'board')?.clips ?? [], (a, b) => a.beat === b.beat);
    expect(firsts.map((c) => c.start)).toEqual(firsts.map((c) => beatOf(rbfV2, c.beat).start));
  });

  test('a panel shows the try it keeps, not its first', () => {
    expect(panelClip(t, 'spoke.dark').try).toBe(2);
  });

  test('every voiced beat has a staging take over its speech; silent beats have none', () => {
    const takes = laneOf(t, 'voice')?.clips ?? [];
    expect(takes.map((c) => c.beat)).not.toContain('title');
    const roof = beatOf(rbfV2, 'roof');
    expect(takes.find((c) => c.beat === 'roof')).toMatchObject({
      start: roof.speech?.start,
      state: 'made',
      source: 'staging',
      clock: 'measured',
    });
  });

  test('the movements run from their beat to the next one', () => {
    const sound = laneOf(t, 'sound')?.clips ?? [];
    expect(sound[1]).toMatchObject({
      movement: 'The theme, then the measure',
      from: 'title',
      start: beatOf(rbfV2, 'title').start,
      clock: 'measured',
    });
    expect(sound[1]?.dur).toBeCloseTo(
      beatOf(rbfV2, 'mirror').start - beatOf(rbfV2, 'title').start,
      6,
    );
  });

  test("its Board's ready beats wait on nobody while v3 is open", () => {
    expect(t.header.waits).toBeUndefined();
  });

  test('an approved beat is approved on its panels', () => {
    const board = Result.getOrThrow(approveBeat(rbfV2Board, BoardName.make('cold'), 'now'));
    const approved = timelineOf(rbf(2, { board }));
    expect(panelClip(approved, 'cold.righteous').state).toBe('approved');
    expect(panelClip(approved, 'word.church').state).toBe('kept');
  });
});

describe("the header waits on the open version's Board", () => {
  test('every beat whose pictures are all kept waits on his approval: "20 wait on you"', () => {
    const t = timelineOf(rbf(3, { openBoard: rbfV2Board }));
    expect(t.header.waits?.count).toBe(20);
    expect(t.header.waits?.items[0]).toEqual({
      kind: 'approve',
      beat: 'cold',
      href: '/films/righteousness-by-faith/board/cold',
    });
  });

  test('an approved beat waits no more; one whose kept try changed since waits again', () => {
    const approved = Result.getOrThrow(approveBeat(rbfV2Board, BoardName.make('cold'), 'now'));
    expect(timelineOf(rbf(3, { openBoard: approved })).header.waits?.count).toBe(19);
    const stale = keeping(approved, 'cold.righteous', 2);
    expect(timelineOf(rbf(3, { openBoard: stale })).header.waits?.count).toBe(20);
  });
});

describe('the flags: what waits on the owner, at its time', () => {
  const notes: NotesFile = {
    film: RBF,
    seq: 3,
    notes: [
      noteOn('n1', 'word', 2, 'open'),
      noteOn('n2', 'seed', 1, 'replied'),
      noteOn('n3', 'roof', 1, 'resolved'),
    ],
  };
  const sources = {
    asks: [
      SCRIPT_ASK,
      CONCEPT_ASK,
      askOn('panel-roof', ['roof.see'], ASKING),
      askOn('panel-old', ['word.church'], ANSWERED),
    ],
    notes,
  };

  test('an open ask flags the first beat it shows; an answered ask and a done note do not flag', () => {
    const t = timelineOf(rbf(3, sources));
    expect(t.markers.map((m) => [m.kind, m.id, m.at])).toEqual([
      ['note', 'n1', beatOf(rbfV3, 'word').start + 2],
      ['note', 'n2', beatOf(rbfV3, 'seed').start + 1],
      ['ask', 'panel-roof', beatOf(rbfV3, 'roof').start],
    ]);
    expect(t.markers[2]).toMatchObject({ title: 'Which panel-roof?', href: '/asks/panel-roof' });
  });

  test('the header counts the open ask and the note an agent answered, and lists them', () => {
    const t = timelineOf(rbf(3, sources));
    expect(t.header.waits?.count).toBe(2);
    expect(t.header.waits?.items.map((w) => w.kind)).toEqual(['ask', 'note']);
  });

  test("on v2 the ask flags its beat on v2's clock; the notes, on the registered film's, do not flag", () => {
    const t = timelineOf(rbf(2, sources));
    expect(t.markers.map((m) => [m.kind, m.id, m.at])).toEqual([
      ['ask', 'panel-roof', beatOf(rbfV2, 'roof').start],
    ]);
  });

  test('an ask filed on the production alone, naming no film, waits too', () => {
    const { film: _, ...unnamed } = askOn('by-production', [], ASKING, { production: RBF });
    const t = timelineOf(rbf(3, { asks: [unnamed] }));
    expect(t.header.waits?.items).toEqual([
      {
        kind: 'ask',
        id: 'by-production',
        title: 'Which by-production?',
        href: '/asks/by-production',
      },
    ]);
    const elsewhere = { ...unnamed, production: COLD };
    expect(timelineOf(rbf(3, { asks: [elsewhere] })).header.waits).toBeUndefined();
  });

  describe('an ask whose choice a decision filed since has answered waits no more', () => {
    const made = Date.parse('2026-10-15T00:00:00.000Z');
    const ask = askOn('pick-render', [], ASKING, {
      production: RBF,
      set: 'p5/rbf-renders',
      point: 'render:cold',
    });
    const decided = (at: number, point: string) => ({
      _tag: 'Decided',
      at,
      text: 'the warm one',
      set: 'rbf-renders',
      point,
    });
    const waitsWith = (said: ReadonlyArray<unknown>) =>
      timelineOf(rbf(3, { ledger: Option.some(ledgerOf([OPENED[3] + 100], said)), asks: [ask] }))
        .header.waits?.count ?? 0;

    test('decided in chat after it was asked: it stops waiting', () => {
      expect(waitsWith([decided(made + 1, 'render:cold')])).toBe(0);
    });

    test('decided before it was asked, or on another choice: it still waits', () => {
      expect(waitsWith([decided(made - 1, 'render:cold')])).toBe(1);
      expect(waitsWith([decided(made + 1, 'render:warm')])).toBe(1);
    });
  });
});

describe('the cold studies: no ledger, no Board, no concept', () => {
  const versions = versionsOf(Option.none(), [], COLD);
  const sources: TimelineSources = {
    film: COLD,
    ledger: Option.none(),
    version: Result.getOrThrow(pickVersion(COLD, versions, Option.none())),
    versions,
    clock: cold,
    board: emptyBoard(COLD),
    openBoard: emptyBoard(COLD),
    catalogue: emptyCatalogue(COLD),
    notes: noNotes(COLD),
    asks: [],
    working: [{ by: 'painter', text: 'drawing court', at: '2026-10-16T00:00:00.000Z' }],
  };
  const t = timelineOf(sources);

  test('script, voice and scenes have lanes; the stage is the Board', () => {
    expect(tracks(t)).toEqual(['script', 'voice', 'scenes']);
    expect(t.header.stage).toBe('board');
    expect(t.production).toBeUndefined();
    expect(t.version).toEqual({ n: 1, title: COLD, open: true, files: 'film' });
  });

  test('the Next row is the Board, and names the gap it starts from: no concept is kept', () => {
    expect(t.next).toEqual({
      stage: 'board',
      starts: 'Board starts from kept concept frames, and none is kept yet',
      gap: {
        stage: 'concept',
        why: 'no decision on the production keeps a concept frame yet (the frames keep no record of their own)',
      },
      later: ['animatic', 'sound', 'render', 'shorts'],
    });
  });

  test('a scene approved through its render is approved, over its span', () => {
    const scene = renderOf({ _tag: 'Scenes', ids: ['court'] }, 's1');
    const catalogue = approve({ ...emptyCatalogue(COLD), renders: [scene] }, subjectOf(scene), 2);
    const t2 = timelineOf({ ...sources, catalogue });
    expect(laneOf(t2, 'scenes')?.clips.map((c) => [c.beat, c.state])).toEqual([
      ['court', 'approved'],
      ['job', 'made'],
    ]);
    expect(laneOf(t2, 'render')?.clips[0]).toMatchObject({
      address: 'scenes:court',
      start: 0,
      state: 'approved',
    });
    expect(laneOf(t2, 'render')?.clips[0]?.dur).toBeCloseTo(beatOf(cold, 'court').dur, 6);
  });

  test('nothing waits, so the header has no count; the working line is in it', () => {
    expect(t.header.waits).toBeUndefined();
    expect(t.markers).toEqual([]);
    expect(t.header.working).toEqual([
      { by: 'painter', text: 'drawing court', at: '2026-10-16T00:00:00.000Z' },
    ]);
  });

  test('`tracks` keeps only the lanes named', () => {
    expect(tracks(onlyTracks(t, Option.some(['voice', 'board'])))).toEqual(['voice']);
    expect(tracks(onlyTracks(t, Option.none()))).toEqual(['script', 'voice', 'scenes']);
  });
});

describe('the clock a version plays on', () => {
  test('marks and speech in film seconds; a beat with no take is estimated; acts laid over the beats', () => {
    const placed = Result.getOrThrow(
      layout(
        [{ id: 'a', say: 'one two {m} three' }, { id: 'b' }, { id: 'c', say: 'four' }],
        NO_TAKES,
      ),
    );
    const clock = Result.getOrThrow(
      filmClock(placed, {
        acts: [
          { from: 'a', name: 'open' },
          { from: 'c', name: 'close' },
        ],
        movements: [],
        drawn: (p) => p.spec.id !== 'b',
      }),
    );
    const [a, b, c] = clock.beats;
    expect(a?.voice).toBe('estimated');
    expect(a?.speech?.start).toBe(placed[0]?.speechStart);
    expect(a?.marks.map((m) => m.name)).toEqual(['m']);
    expect(a?.marks[0]?.at).toBeGreaterThan(a?.speech?.start ?? Infinity);
    expect(b).toMatchObject({ voice: 'silent', drawn: false, start: placed[1]?.start });
    expect(b?.speech).toBeUndefined();
    const close = beatOf(clock, 'c');
    expect(c).toEqual(close);
    expect(clock.acts).toEqual([
      { name: 'open', from: 'a', start: 0, end: close.start },
      { name: 'close', from: 'c', start: close.start, end: close.start + close.dur },
    ]);
  });

  test('an act on a beat the clock has not fails, naming it', () => {
    const placed = Result.getOrThrow(layout([{ id: 'a' }], NO_TAKES));
    const read = filmClock(placed, {
      acts: [{ from: 'z', name: 'lost' }],
      movements: [],
      drawn: () => true,
    });
    expect(Result.isFailure(read) && read.failure._tag).toBe('UnknownScene');
  });

  test('a movement over a beat with no take is estimated; one over silence alone is measured', () => {
    const placed = Result.getOrThrow(layout([{ id: 'a', say: 'one two' }, { id: 'b' }], NO_TAKES));
    const clock = Result.getOrThrow(
      filmClock(placed, {
        acts: [],
        movements: [
          { from: 'a', name: 'spoken' },
          { from: 'b', name: 'quiet' },
        ],
        drawn: () => true,
      }),
    );
    const t = timelineOf({ ...rbf(3), clock });
    expect(laneOf(t, 'sound')?.clips.map((c) => [c.movement, c.clock])).toEqual([
      ['spoken', 'estimated'],
      ['quiet', 'measured'],
    ]);
  });
});
