import { describe, expect, test } from 'bun:test';
import { Option, Schema } from 'effect';
import { sceneAddress } from './address.ts';
import {
  type Catalogue,
  CatalogueJson,
  OpId,
  type Render,
  approvalState,
  approve,
  approveCurrent,
  comment,
  emptyCatalogue,
  gaveOf,
  type Keyed,
  type SceneKey,
  renderNeed,
  partSubject,
  projectOf,
  recordRender,
  renderIn,
  sceneSlot,
  subjectOf,
  tookOf,
  withdraw,
  withdrawScenes,
} from './catalogue.ts';

const SETTINGS = { scale: 0.5, captions: true };

/** Approve runs' ops, as `uniqueId(OpId)` or the CLI's `--given` decode makes them. */
const OP_1 = OpId.make('op-1');
const OP_2 = OpId.make('op-2');
const OP_A = OpId.make('op-a');
const OP_B = OpId.make('op-b');
const OP_C = OpId.make('op-c');

/** A render of scene `id`'s main variant, drawn from sources with `key`. */
const sceneRender = (id: string, key: string, at = 1): Render => ({
  address: sceneAddress(id),
  variant: 'main',
  kind: 'video',
  settings: SETTINGS,
  stamp: { commit: Option.some('abc123'), key },
  span: Option.some({ from: 0, to: 4 }),
  files: {
    clip: Option.some(`scenes/${id}/main.mp4`),
    share: Option.none(),
    captions: Option.some(`scenes/${id}/main.vtt`),
    chapters: Option.none(),
    images: [],
  },
  sound: Option.none(),
  at,
});

const withRenders = (...renders: ReadonlyArray<Render>): Catalogue =>
  renders.reduce(recordRender, emptyCatalogue('f'));

/** The film as its scenes alone, keyed now (no acts). */
const keyed = (scenes: ReadonlyArray<SceneKey>): Keyed => ({
  key: 'film-k',
  sound: Option.none(),
  acts: [],
  scenes,
});

/** What is said of `render`: its variant as stamped. */
const of = subjectOf;

describe('a scene render against its sources', () => {
  test('is stale once its scene changes: the stamp, not the file, says so', () => {
    const catalogue = withRenders(sceneRender('a', 'k1'));
    const unchanged = projectOf(catalogue, keyed([{ scene: 'a', key: 'k1' }]), 'main');
    const changed = projectOf(catalogue, keyed([{ scene: 'a', key: 'k2' }]), 'main');
    expect(unchanged.scenes[0]?.state).toBe('current');
    expect(changed.scenes[0]?.state).toBe('stale');
  });

  test('is missing until rendered', () => {
    const project = projectOf(emptyCatalogue('f'), keyed([{ scene: 'a', key: 'k1' }]), 'main');
    expect(project.scenes[0]?.state).toBe('missing');
    expect(project.scenes[0]?.approval).toBe('none');
  });

  test('says where its scene sits in the film when the film was laid out, rendered or not', () => {
    const span = { start: 12.5, dur: 4 };
    const laidOut = projectOf(
      emptyCatalogue('f'),
      keyed([{ scene: 'a', key: 'k1', span }]),
      'main',
    );
    const unplaced = projectOf(emptyCatalogue('f'), keyed([{ scene: 'a', key: 'k1' }]), 'main');
    expect(laidOut.scenes[0]?.span).toEqual(Option.some(span));
    expect(unplaced.scenes[0]?.span).toEqual(Option.none());
  });

  test('needs a render when missing, stale or made at other settings; not when current', () => {
    const catalogue = withRenders(sceneRender('a', 'k1'));
    const slot = sceneSlot('a', 'main');
    const now = (key: string) => ({ key, sound: Option.none() });
    expect(renderNeed(catalogue, slot, now('k1'), SETTINGS)).toBe('current');
    expect(renderNeed(catalogue, slot, now('k2'), SETTINGS)).toBe('draw');
    expect(renderNeed(catalogue, slot, now('k1'), { scale: 1, captions: true })).toBe('draw');
    expect(renderNeed(catalogue, sceneSlot('b', 'main'), now('k1'), SETTINGS)).toBe('draw');
  });
});

/** `render` carrying the film's master as mixed from plan `mix`, cut at its span. */
const sounding = (render: Render, mix: string): Render => ({
  ...render,
  sound: Option.some({ mix: Option.some(mix), pieces: [{ start: 0, duration: 4 }] }),
});

/** The film keyed now with the film's mix key `sound`. */
const heard = (scenes: ReadonlyArray<SceneKey>, sound: string): Keyed => ({
  ...keyed(scenes),
  sound: Option.some(sound),
});

describe("a scene render against the film's sound", () => {
  test('is stale by its sound once the mix changes (a score pick, a level), though its scene did not', () => {
    const catalogue = withRenders(sounding(sceneRender('a', 'k1'), 'mix-a'));
    const same = projectOf(catalogue, heard([{ scene: 'a', key: 'k1' }], 'mix-a'), 'main');
    const remixed = projectOf(catalogue, heard([{ scene: 'a', key: 'k1' }], 'mix-b'), 'main');
    expect([same.scenes[0]?.state, same.scenes[0]?.staleBy]).toEqual(['current', Option.none()]);
    expect([remixed.scenes[0]?.state, remixed.scenes[0]?.staleBy]).toEqual([
      'stale',
      Option.some('sound'),
    ]);
    // A scene that changed is stale by its sources, whatever its sound.
    const redrawn = projectOf(catalogue, heard([{ scene: 'a', key: 'k2' }], 'mix-b'), 'main');
    expect(redrawn.scenes[0]?.staleBy).toEqual(Option.some('sources'));
  });

  test('a render stale by its sound is re-muxed, not drawn again; one that drew other sources is drawn', () => {
    const catalogue = withRenders(
      sounding(sceneRender('a', 'k1'), 'mix-a'),
      sceneRender('b', 'k1'),
    );
    const slot = sceneSlot('a', 'main');
    const now = (key: string, sound: string) => ({ key, sound: Option.some(sound) });
    expect(renderNeed(catalogue, slot, now('k1', 'mix-a'), SETTINGS)).toBe('current');
    expect(renderNeed(catalogue, slot, now('k1', 'mix-b'), SETTINGS)).toBe('remux');
    expect(renderNeed(catalogue, slot, now('k2', 'mix-b'), SETTINGS)).toBe('draw');
    // A render that carries no sound has no cut to re-mux: the film's track is drawn with it.
    expect(renderNeed(catalogue, sceneSlot('b', 'main'), now('k1', 'mix-b'), SETTINGS)).toBe(
      'draw',
    );
    // A film with no track yet (or a plan that does not build) judges no render by its sound.
    expect(renderNeed(catalogue, slot, { key: 'k1', sound: Option.none() }, SETTINGS)).toBe(
      'current',
    );
  });

  test('an approval is of the render as it sounded: re-muxed, it is stale', () => {
    const first = sounding(sceneRender('a', 'k1'), 'mix-a');
    const approved = approve(withRenders(first), of(first), 10);
    const remuxed = sounding(sceneRender('a', 'k1', 20), 'mix-b');
    const after = recordRender(approved, remuxed);
    expect(approvalState(after, of(remuxed))).toBe('stale');
    // Approve-all leaves a scene stale by its sound for a re-mux first.
    const { approved: none } = approveCurrent(
      withRenders(first),
      [{ scene: 'a', key: 'k1' }],
      Option.some('mix-b'),
      'main',
      5,
      OP_1,
    );
    expect(none).toEqual([]);
  });
});

describe('approvals', () => {
  test('a new render of a scene marks its approval stale; the approval is kept', () => {
    const first = sceneRender('a', 'k1');
    const approved = approve(withRenders(first), of(first), 10);
    expect(approvalState(approved, of(first))).toBe('approved');

    const second = sceneRender('a', 'k2', 20);
    const rerendered = recordRender(approved, second);
    expect(approvalState(rerendered, of(second))).toBe('stale');
    expect(rerendered.approvals).toEqual(approved.approvals);
    // The slot holds the new render alone.
    expect(rerendered.renders).toEqual([second]);
  });

  test('approving twice records one approval', () => {
    const render = sceneRender('a', 'k1');
    const twice = approve(approve(withRenders(render), of(render), 1), of(render), 2);
    expect(twice.approvals.length).toBe(1);
  });

  test('approve-all approves the current scenes and leaves stale and missing ones', () => {
    const catalogue = withRenders(sceneRender('a', 'k1'), sceneRender('b', 'old'));
    const now = [
      { scene: 'a', key: 'k1' },
      { scene: 'b', key: 'new' },
      { scene: 'c', key: 'k3' },
    ];
    const { catalogue: after, approved } = approveCurrent(
      catalogue,
      now,
      Option.none(),
      'main',
      5,
      OP_1,
    );
    expect(approved).toEqual(['a']);
    expect(
      projectOf(after, keyed(now), 'main').scenes.map((s) => [s.scene, s.state, s.approval]),
    ).toEqual([
      ['a', 'current', 'approved'],
      ['b', 'stale', 'none'],
      ['c', 'missing', 'none'],
    ]);
  });

  test('approve-all names the scenes it made approved: one approved already is not among them', () => {
    const a = sceneRender('a', 'k1');
    const catalogue = approve(withRenders(a, sceneRender('b', 'k2')), of(a), 1);
    const now = [
      { scene: 'a', key: 'k1' },
      { scene: 'b', key: 'k2' },
    ];
    const first = approveCurrent(catalogue, now, Option.none(), 'main', 5, OP_1);
    expect([first.approved, first.made]).toEqual([['a', 'b'], ['b']]);
    // The approval it added carries its run's op; the one there before carries none.
    expect(first.catalogue.approvals.map((x) => x.op)).toEqual([Option.none(), Option.some(OP_1)]);
    // Approved by another since: the same approve changes nothing, and names nothing it made.
    const again = approveCurrent(first.catalogue, now, Option.none(), 'main', 7, OP_2);
    expect([again.approved, again.made]).toEqual([['a', 'b'], []]);
    expect(again.catalogue).toEqual(first.catalogue);
    // What the CLI's answer says it gave: its op, the moment and those scenes; nothing, when it made none.
    expect(gaveOf(first.made, 5, OP_1)).toEqual(Option.some({ op: OP_1, at: 5, scenes: ['b'] }));
    expect(gaveOf(again.made, 7, OP_2)).toEqual(Option.none());
  });

  test('two approve runs at the same moment: each Undo takes its own approval alone', () => {
    const first = sceneRender('a', 'k1');
    const second = sceneRender('a', 'k2', 20);
    const now = (key: string) => [{ scene: 'a', key }];
    // Run A approves k1 at 5; a new render; run B, queued with the same moment, approves k2.
    const a = approveCurrent(withRenders(first), now('k1'), Option.none(), 'main', 5, OP_A);
    const b = approveCurrent(
      recordRender(a.catalogue, second),
      now('k2'),
      Option.none(),
      'main',
      5,
      OP_B,
    );
    expect(b.catalogue.approvals.map((x) => [x.key, x.at])).toEqual([
      ['k1', 5],
      ['k2', 5],
    ]);
    // B's Undo takes k2's alone: k1's, stamped identically, stays.
    const undoneB = withdraw(b.catalogue, of(second), Option.some(OP_B));
    expect(undoneB.approvals.map((x) => x.key)).toEqual(['k1']);
    expect(approvalState(undoneB, of(second))).toBe('stale');
    // A's Undo takes k1's alone.
    const undoneA = withdraw(b.catalogue, of(second), Option.some(OP_A));
    expect(undoneA.approvals.map((x) => x.key)).toEqual(['k2']);
    expect(approvalState(undoneA, of(second))).toBe('approved');
    // An op no approval carries takes nothing; with none given, every approval of the variant goes.
    expect(withdraw(b.catalogue, of(second), Option.some(OP_C))).toEqual(b.catalogue);
    expect(withdraw(b.catalogue, of(second), Option.none()).approvals).toEqual([]);
  });

  test("approve, another's withdraw and re-approve at the same moment: the first Undo takes nothing", () => {
    const render = sceneRender('a', 'k1');
    const now = [{ scene: 'a', key: 'k1' }];
    const a = approveCurrent(withRenders(render), now, Option.none(), 'main', 5, OP_A);
    const withdrawn = withdraw(a.catalogue, of(render), Option.none());
    const b = approveCurrent(withdrawn, now, Option.none(), 'main', 5, OP_B);
    // A's Undo, late: the approval now is B's, at A's very moment, and stays.
    expect(withdraw(b.catalogue, of(render), Option.some(OP_A))).toEqual(b.catalogue);
    expect(approvalState(b.catalogue, of(render))).toBe('approved');
  });

  test('an approval with no op (given before ops, or by a say) is never taken by an Undo', () => {
    const render = sceneRender('a', 'k1');
    const catalogue = approve(withRenders(render), of(render), 5);
    expect(catalogue.approvals.map((x) => x.op)).toEqual([Option.none()]);
    expect(withdraw(catalogue, of(render), Option.some(OP_A))).toEqual(catalogue);
    expect(withdraw(catalogue, of(render), Option.none()).approvals).toEqual([]);
  });

  test('a withdraw of scenes says which it took an approval from', () => {
    const a = sceneRender('a', 'k1');
    const b = sceneRender('b', 'k1');
    // Run op-a approves a; b is approved by another (a say: no op).
    const given = approveCurrent(
      withRenders(a, b),
      [{ scene: 'a', key: 'k1' }],
      Option.none(),
      'main',
      5,
      OP_A,
    );
    const both = approve(given.catalogue, of(b), 6);
    // Undoing op-a: a's goes; b's approval was another's (no op), so b is not among those taken.
    const undone = withdrawScenes(both, ['a', 'b'], 'main', Option.some(OP_A));
    expect(undone.took).toEqual(['a']);
    expect([
      approvalState(undone.catalogue, of(a)),
      approvalState(undone.catalogue, of(b)),
    ]).toEqual(['none', 'approved']);
    expect(tookOf(Option.some(OP_A), undone.took)).toEqual(
      Option.some({ op: OP_A, scenes: ['a'] }),
    );
    // Undone again: nothing is left to take, and it says so.
    const again = withdrawScenes(undone.catalogue, ['a', 'b'], 'main', Option.some(OP_A));
    expect(again.took).toEqual([]);
    expect(tookOf(Option.some(OP_A), again.took)).toEqual(Option.some({ op: OP_A, scenes: [] }));
    // A plain withdraw takes every approval, and says nothing of an op.
    expect(withdrawScenes(both, ['a', 'b'], 'main', Option.none()).took).toEqual(['a', 'b']);
    expect(tookOf(Option.none(), ['a'])).toEqual(Option.none());
  });

  test('a read of the project says nothing of what an approve gave', () => {
    const render = sceneRender('a', 'k1');
    const catalogue = approve(withRenders(render), of(render), 1);
    expect(projectOf(catalogue, keyed([{ scene: 'a', key: 'k1' }]), 'main').gave).toEqual(
      Option.none(),
    );
  });

  test("an approval is one variant's: another variant of the scene is not approved", () => {
    const main = sceneRender('a', 'k1');
    const other: Render = { ...main, variant: 'ink' };
    const catalogue = approve(withRenders(main, other), of(main), 1);
    expect(approvalState(catalogue, of(other))).toBe('none');
    expect(Option.isSome(renderIn(catalogue, sceneSlot('a', 'ink')))).toBe(true);
  });
});

describe('comments', () => {
  test('a comment stays on its scene, marked as on an earlier render once it is rendered again', () => {
    const first = sceneRender('a', 'k1');
    const said = comment(withRenders(first), of(first), 'the hand jumps', 3);
    const now = [{ scene: 'a', key: 'k2' }];
    const before = projectOf(said, keyed([{ scene: 'a', key: 'k1' }]), 'main').scenes[0]?.comments;
    expect(before?.map((c) => [c.text, c.onThis])).toEqual([['the hand jumps', true]]);
    const after = projectOf(recordRender(said, sceneRender('a', 'k2', 9)), keyed(now), 'main')
      .scenes[0]?.comments;
    expect(after?.map((c) => [c.text, c.onThis])).toEqual([['the hand jumps', false]]);
  });
});

describe("the owner's say beside a scene's render", () => {
  test("an act's comment is on the act as it is now, and earlier once its scenes change", () => {
    const act = { _tag: 'Act', act: 'opening' } as const;
    const said = comment(emptyCatalogue('f'), partSubject(act, 'main', 'a1'), 'too slow', 4);
    const tree = (key: string): Keyed => ({
      key: 'film-k',
      sound: Option.none(),
      acts: [{ act: 'opening', scenes: ['a'], key }],
      scenes: [{ scene: 'a', key: 'k1' }],
    });
    const now = projectOf(said, tree('a1'), 'main');
    expect(now.acts.map((a) => a.comments.map((c) => [c.text, c.onThis]))).toEqual([
      [['too slow', true]],
    ]);
    // The act's scene never hears it: it was said of the act.
    expect(now.scenes[0]?.comments).toEqual([]);
    const later = projectOf(said, tree('a2'), 'main');
    expect(later.acts[0]?.comments.map((c) => c.onThis)).toEqual([false]);
  });

  test("a choice point's approval is its own: the scene's render is not approved by it", () => {
    const render = sceneRender('a', 'k1');
    const take = {
      address: sceneAddress('a'),
      point: Option.some({ _tag: 'Take' as const, sound: 'paper.slide' }),
      variant: 'sha-1',
      key: 'sha-1',
    };
    const catalogue = approve(withRenders(render), take, 1);
    expect(approvalState(catalogue, take)).toBe('approved');
    expect(approvalState(catalogue, of(render))).toBe('none');
  });

  test('comments get the next id in turn', () => {
    const render = sceneRender('a', 'k1');
    const twice = comment(comment(withRenders(render), of(render), 'one', 1), of(render), 'two', 2);
    expect(twice.comments.map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  test("a catalogue written before choice points (no point on a record) reads as the render's", () => {
    const render = sceneRender('a', 'k1');
    const text = Schema.encodeSync(CatalogueJson)(approve(withRenders(render), of(render), 1));
    expect(text).not.toContain('"point"');
    expect(approvalState(Schema.decodeSync(CatalogueJson)(text), of(render))).toBe('approved');
  });

  test("a catalogue written before approve runs had ops reads, and no run's Undo takes its approvals", () => {
    const render = sceneRender('a', 'k1');
    const text = Schema.encodeSync(CatalogueJson)(approve(withRenders(render), of(render), 1));
    expect(text).not.toContain('"op"');
    const legacy = Schema.decodeSync(CatalogueJson)(text);
    expect(withdraw(legacy, of(render), Option.some(OP_1))).toEqual(legacy);
    const given = approve(withRenders(render), of(render), 1, Option.some(OP_1));
    expect(Schema.decodeSync(CatalogueJson)(Schema.encodeSync(CatalogueJson)(given))).toEqual(
      given,
    );
  });
});

test('catalogue.json round-trips through its schema', () => {
  const render = sceneRender('a', 'k1');
  const catalogue = comment(approve(withRenders(render), of(render), 1), of(render), 'ok', 2);
  const text = Schema.encodeSync(CatalogueJson)(catalogue);
  expect(Schema.decodeSync(CatalogueJson)(text)).toEqual(catalogue);
});
