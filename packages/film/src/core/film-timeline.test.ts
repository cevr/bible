// The studio's read model over the films as they stand: Righteousness by
// Faith at v2 (its registered files: Board, takes, scenes, score) and v3 (a
// version folder's script, no take yet), and the cold studies (no ledger, no
// Board). The clocks are `film read clock`'s answers for them, the Board is
// RBF's `board.json` with its prompts left out. Only reached stages take a
// lane; the Next row names the first stage ahead with what starts it; clips
// sit on the clock with their states; the flags and the header count what
// waits on the owner; the open version is the default.

import { describe, expect, test } from 'bun:test';
import { Array as Arr, Option, Result, Schema } from 'effect';
import { AskName, type AskRecord, AskState, oneQuestion } from './ask.ts';
import { BoardFile, BoardName, approveBeat } from './board.ts';
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
import type { Note } from './schema.ts';
import coldClockJson from './fixtures/timeline/cold-studies-clock.json' with { type: 'json' };
import rbfBoardJson from './fixtures/timeline/rbf-board.json' with { type: 'json' };
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
const rbfBoard = Schema.decodeUnknownSync(BoardFile)(rbfBoardJson);

/** RBF's ledger as it names its versions; v3 has a folder (`v3/script.ts`). */
const RBF_LEDGER = {
  versions: [
    { title: 'Canvas cut' },
    { title: 'Rive, in the new look' },
    { title: 'Written from scratch' },
  ],
};
const rbfVersions = versionsOf(Option.some(RBF_LEDGER), [3], RBF);
const versionN = (versions: ReadonlyArray<FilmVersion>, n: number) =>
  Result.getOrThrow(pickVersion(RBF, versions, Option.some(n)));

/** RBF's sources at version `n`, its Board as it stands, and nothing else waiting. */
const rbf = (n: 2 | 3, more: Partial<TimelineSources> = {}): TimelineSources => ({
  film: RBF,
  production: Option.some(RBF),
  version: versionN(rbfVersions, n),
  versions: rbfVersions,
  clock: { 2: rbfV2, 3: rbfV3 }[n],
  board: rbfBoard,
  catalogue: emptyCatalogue(RBF),
  notes: [],
  asks: [],
  working: [],
  ...more,
});

const tracks = (t: FilmTimeline) => t.lanes.map((l) => l.track);

const laneOf = <K extends Lane['track']>(t: FilmTimeline, track: K) =>
  t.lanes.find((l): l is Extract<Lane, { readonly track: K }> => l.track === track);

const panelClip = (t: FilmTimeline, panel: string): Option.Option<BoardClip> =>
  Arr.findFirst(laneOf(t, 'board')?.clips ?? [], (c) => c.panel === panel);

const beatOf = (clock: FilmClock, id: string) =>
  Option.getOrThrow(Arr.findFirst(clock.beats, (b) => b.id === id));

const markOf = (clock: FilmClock, beat: string, mark: string) =>
  Option.getOrThrow(Arr.findFirst(beatOf(clock, beat).marks, (m) => m.name === mark)).at;

/** The timings of a film with no take yet. */
const NO_TAKES = { voice: '', scenes: {} };

/** An ask about RBF in `state`, its one page showing Board panels `panels`. */
const askOn = (id: string, panels: ReadonlyArray<string>, state: AskState): AskRecord => ({
  id: Schema.decodeSync(AskName)(id),
  title: `Which ${id}?`,
  why: 'it decides the panel',
  by: 'test',
  film: RBF,
  created: '2026-10-15T00:00:00.000Z',
  ask: oneQuestion([{ kind: 'board', film: RBF, panels }]),
  state,
  answered: [],
});
const ASKING = AskState.Asking({ step: Schema.decodeSync(AskName)('ask'), answers: {} });
const ANSWERED = AskState.Answered({ step: Schema.decodeSync(AskName)('done'), answers: {} });

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

describe('versions', () => {
  test('RBF: v3 has its folder and is open, v2 is on the registered files, v1 keeps none', () => {
    expect(rbfVersions.map((v) => [v.n, v.files, v.open])).toEqual([
      [1, 'none', false],
      [2, 'film', false],
      [3, 'folder', true],
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

describe('RBF v3: a script on the estimated clock', () => {
  const t = timelineOf(rbf(3));

  test('only the script has a lane; the Next row names the Board and what starts it', () => {
    expect(tracks(t)).toEqual(['script']);
    expect(t.next).toEqual({
      stage: 'board',
      starts: 'Board starts from the kept concept frames',
      later: ['voice', 'animatic', 'scenes', 'sound', 'render', 'shorts'],
    });
    expect(t.flow.map((f) => [f.stage, f.state])).toEqual([
      ['script', 'reached'],
      ['concept', 'gap'],
      ['board', 'ahead'],
      ['voice', 'ahead'],
      ['animatic', 'ahead'],
      ['scenes', 'ahead'],
      ['sound', 'ahead'],
      ['render', 'ahead'],
      ['shorts', 'ahead'],
    ]);
    expect(t.header.stage).toBe('script');
  });

  test('its beats are made, not kept, and hatched where they are read from words', () => {
    const clips = laneOf(t, 'script')?.clips ?? [];
    expect(clips.map((c) => c.beat)).toEqual(rbfV3.beats.map((b) => b.id));
    expect(new Set(clips.map((c) => c.state))).toEqual(new Set(['made']));
    // The title and the credits are silent: their length is declared, not estimated.
    expect(clips.filter((c) => c.clock === 'measured').map((c) => c.beat)).toEqual([
      'title',
      'end',
    ]);
    expect(t.duration).toBeCloseTo(607.38, 2);
    expect(t.bands).toEqual([]);
  });

  test("the Board's approvals wait on the owner film-wide, but its panels draw no lane here", () => {
    expect(laneOf(t, 'board')).toBeUndefined();
    expect(t.header.waits?.count).toBe(20);
  });
});

describe('RBF v2: the registered film', () => {
  const t = timelineOf(rbf(2));

  test('five lanes, the animatic reached, and the Next row is the render', () => {
    expect(tracks(t)).toEqual(['script', 'board', 'voice', 'scenes', 'sound']);
    expect(t.flow.find((f) => f.stage === 'animatic')?.state).toBe('reached');
    expect(t.next).toEqual({
      stage: 'render',
      starts: 'Render comes once the scenes are approved',
      later: ['shorts'],
    });
    expect(t.header.stage).toBe('sound');
    expect(t.bands.map((b) => b.name)).toEqual([
      'cold open',
      'message',
      'faith',
      'forgiveness',
      'power',
      'landing',
    ]);
  });

  test('a panel sits on its mark and holds to the next panel, the last to its beat end', () => {
    const righteous = markOf(rbfV2, 'cold', 'righteous');
    const asked = markOf(rbfV2, 'cold', 'asked');
    const job = markOf(rbfV2, 'cold', 'job');
    expect(Option.getOrThrow(panelClip(t, 'cold.righteous'))).toMatchObject({
      start: righteous,
      state: 'kept',
      try: 1,
      card: false,
    });
    expect(Option.getOrThrow(panelClip(t, 'cold.righteous')).dur).toBeCloseTo(asked - righteous, 6);
    expect(Option.getOrThrow(panelClip(t, 'cold.asked'))).toMatchObject({
      start: asked,
      card: true,
    });
    expect(Option.getOrThrow(panelClip(t, 'cold.asked')).try).toBeUndefined();
    const cold = beatOf(rbfV2, 'cold');
    expect(Option.getOrThrow(panelClip(t, 'cold.job')).dur).toBeCloseTo(
      cold.start + cold.dur - job,
      6,
    );
    // A panel held from the beat's start sits there.
    expect(Option.getOrThrow(panelClip(t, 'title.start'))).toMatchObject({
      start: beatOf(rbfV2, 'title').start,
    });
  });

  test('every voiced beat has a staging take over its speech; silent beats have none', () => {
    const takes = laneOf(t, 'voice')?.clips ?? [];
    expect(takes.map((c) => c.beat)).not.toContain('title');
    expect(takes.length).toBe(18);
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
    expect(sound.length).toBe(14);
    expect(sound[1]).toMatchObject({
      movement: 'The theme, then the measure',
      from: 'title',
      start: beatOf(rbfV2, 'title').start,
    });
    expect(sound[1]?.dur).toBeCloseTo(
      beatOf(rbfV2, 'mirror').start - beatOf(rbfV2, 'title').start,
      6,
    );
  });

  test('every beat whose pictures are all kept waits on his approval: "20 wait on you"', () => {
    expect(t.header.waits?.count).toBe(20);
    expect(t.header.waits?.items[0]).toEqual({
      kind: 'approve',
      beat: 'cold',
      href: '/films/righteousness-by-faith/board/cold',
    });
  });

  test('an approved beat is approved on its panels and waits no more', () => {
    const board = Result.getOrThrow(approveBeat(rbfBoard, BoardName.make('cold'), 'now'));
    const approved = timelineOf(rbf(2, { board }));
    expect(Option.getOrThrow(panelClip(approved, 'cold.righteous')).state).toBe('approved');
    expect(Option.getOrThrow(panelClip(approved, 'word.church')).state).toBe('kept');
    expect(approved.header.waits?.count).toBe(19);
  });

  test('a render reaches the render stage; a scene approved through its render is approved', () => {
    const film = renderOf({ _tag: 'Film' }, 'f1');
    const scene = renderOf({ _tag: 'Scenes', ids: ['cold'] }, 's1');
    const rendered: Catalogue = { ...emptyCatalogue(RBF), renders: [film, scene] };
    const catalogue = approve(rendered, subjectOf(scene), 2);
    const t2 = timelineOf(rbf(2, { catalogue }));
    expect(tracks(t2)).toEqual(['script', 'board', 'voice', 'scenes', 'sound', 'render']);
    expect(laneOf(t2, 'render')?.clips.map((c) => [c.address, c.start, c.state])).toEqual([
      ['film', 0, 'made'],
      ['scenes:cold', 0, 'approved'],
    ]);
    expect(laneOf(t2, 'render')?.clips[0]?.dur).toBeCloseTo(t2.duration, 6);
    expect(laneOf(t2, 'scenes')?.clips.find((c) => c.beat === 'cold')?.state).toBe('approved');
    expect(laneOf(t2, 'scenes')?.clips.find((c) => c.beat === 'word')?.state).toBe('made');
    expect(t2.next?.stage).toBe('shorts');
  });
});

describe('the flags: what waits on the owner, at its time', () => {
  const sources = {
    board: { ...rbfBoard, panels: [] },
    asks: [
      askOn('panel-roof', ['roof.see'], ASKING),
      askOn('panel-old', ['word.church'], ANSWERED),
    ],
    notes: [
      noteOn('n1', 'word', 2, 'open'),
      noteOn('n2', 'mirror', 1, 'replied'),
      noteOn('n3', 'roof', 1, 'resolved'),
    ],
  };

  test('an open ask flags the first beat it shows; an answered ask and a done note do not flag', () => {
    const t = timelineOf(rbf(2, sources));
    expect(t.markers.map((m) => [m.kind, m.id, m.at])).toEqual([
      ['note', 'n1', beatOf(rbfV2, 'word').start + 2],
      ['note', 'n2', beatOf(rbfV2, 'mirror').start + 1],
      ['ask', 'panel-roof', beatOf(rbfV2, 'roof').start],
    ]);
    expect(t.markers[2]).toMatchObject({ title: 'Which panel-roof?', href: '/asks/panel-roof' });
  });

  test('the header counts the open ask and the note an agent answered, and lists them', () => {
    const t = timelineOf(rbf(2, sources));
    expect(t.header.waits?.count).toBe(2);
    expect(t.header.waits?.items.map((w) => w.kind)).toEqual(['ask', 'note']);
  });

  test("on v3 the ask flags its beat on v3's clock; the notes, on the registered film's, do not flag", () => {
    const t = timelineOf(rbf(3, sources));
    expect(t.markers.map((m) => [m.kind, m.id, m.at])).toEqual([
      ['ask', 'panel-roof', beatOf(rbfV3, 'roof').start],
    ]);
  });
});

describe('the cold studies: no ledger, no Board', () => {
  const versions = versionsOf(Option.none(), [], COLD);
  const t = timelineOf({
    film: COLD,
    production: Option.none(),
    version: Result.getOrThrow(pickVersion(COLD, versions, Option.none())),
    versions,
    clock: cold,
    board: { film: COLD, panels: [], approvals: [] },
    catalogue: emptyCatalogue(COLD),
    notes: [],
    asks: [],
    working: [{ by: 'painter', text: 'drawing court', at: '2026-10-16T00:00:00.000Z' }],
  });

  test('script, voice and scenes have lanes; the Board is the Next row', () => {
    expect(tracks(t)).toEqual(['script', 'voice', 'scenes']);
    expect(t.next?.stage).toBe('board');
    expect(t.header.stage).toBe('scenes');
    expect(t.production).toBeUndefined();
    expect(t.version).toEqual({ n: 1, title: COLD, open: true, files: 'film' });
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
});
