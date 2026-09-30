import { describe, expect, test } from 'bun:test';
import { Option, Schema } from 'effect';
import { sceneAddress } from './address.ts';
import {
  type Catalogue,
  CatalogueJson,
  type Render,
  approvalState,
  approve,
  approveCurrent,
  comment,
  emptyCatalogue,
  type Keyed,
  type SceneKey,
  needsRender,
  partSubject,
  projectOf,
  recordRender,
  renderIn,
  sceneSlot,
  subjectOf,
} from './catalogue.ts';

const SETTINGS = { scale: 0.5, captions: true };

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
  at,
});

const withRenders = (...renders: ReadonlyArray<Render>): Catalogue =>
  renders.reduce(recordRender, emptyCatalogue('f'));

/** The film as its scenes alone, keyed now (no acts). */
const keyed = (scenes: ReadonlyArray<SceneKey>): Keyed => ({ key: 'film-k', acts: [], scenes });

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

  test('needs a render when missing, stale or made at other settings; not when current', () => {
    const catalogue = withRenders(sceneRender('a', 'k1'));
    const slot = sceneSlot('a', 'main');
    expect(needsRender(catalogue, slot, 'k1', SETTINGS)).toBe(false);
    expect(needsRender(catalogue, slot, 'k2', SETTINGS)).toBe(true);
    expect(needsRender(catalogue, slot, 'k1', { scale: 1, captions: true })).toBe(true);
    expect(needsRender(catalogue, sceneSlot('b', 'main'), 'k1', SETTINGS)).toBe(true);
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
    const { catalogue: after, approved } = approveCurrent(catalogue, now, 'main', 5);
    expect(approved).toEqual(['a']);
    expect(
      projectOf(after, keyed(now), 'main').scenes.map((s) => [s.scene, s.state, s.approval]),
    ).toEqual([
      ['a', 'current', 'approved'],
      ['b', 'stale', 'none'],
      ['c', 'missing', 'none'],
    ]);
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
      point: Option.some('take:paper.slide'),
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
});

test('catalogue.json round-trips through its schema', () => {
  const render = sceneRender('a', 'k1');
  const catalogue = comment(approve(withRenders(render), of(render), 1), of(render), 'ok', 2);
  const text = Schema.encodeSync(CatalogueJson)(catalogue);
  expect(Schema.decodeSync(CatalogueJson)(text)).toEqual(catalogue);
});
