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
  needsRender,
  projectOf,
  recordRender,
  renderIn,
  sceneSlot,
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

describe('a scene render against its sources', () => {
  test('is stale once its scene changes: the stamp, not the file, says so', () => {
    const catalogue = withRenders(sceneRender('a', 'k1'));
    const unchanged = projectOf(catalogue, [{ scene: 'a', key: 'k1' }], 'main');
    const changed = projectOf(catalogue, [{ scene: 'a', key: 'k2' }], 'main');
    expect(unchanged.scenes[0]?.state).toBe('current');
    expect(changed.scenes[0]?.state).toBe('stale');
  });

  test('is missing until rendered', () => {
    const project = projectOf(emptyCatalogue('f'), [{ scene: 'a', key: 'k1' }], 'main');
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
    const approved = approve(withRenders(first), first, 10);
    expect(approvalState(approved, first)).toBe('approved');

    const second = sceneRender('a', 'k2', 20);
    const rerendered = recordRender(approved, second);
    expect(approvalState(rerendered, second)).toBe('stale');
    expect(rerendered.approvals).toEqual(approved.approvals);
    // The slot holds the new render alone.
    expect(rerendered.renders).toEqual([second]);
  });

  test('approving twice records one approval', () => {
    const render = sceneRender('a', 'k1');
    const twice = approve(approve(withRenders(render), render, 1), render, 2);
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
    expect(projectOf(after, now, 'main').scenes.map((s) => [s.scene, s.state, s.approval])).toEqual(
      [
        ['a', 'current', 'approved'],
        ['b', 'stale', 'none'],
        ['c', 'missing', 'none'],
      ],
    );
  });

  test("an approval is one variant's: another variant of the scene is not approved", () => {
    const main = sceneRender('a', 'k1');
    const other: Render = { ...main, variant: 'ink' };
    const catalogue = approve(withRenders(main, other), main, 1);
    expect(approvalState(catalogue, other)).toBe('none');
    expect(Option.isSome(renderIn(catalogue, sceneSlot('a', 'ink')))).toBe(true);
  });
});

describe('comments', () => {
  test('a comment stays on its scene, marked as on an earlier render once it is rendered again', () => {
    const first = sceneRender('a', 'k1');
    const said = comment(withRenders(first), first, 'the hand jumps', 'c1', 3);
    const now = [{ scene: 'a', key: 'k2' }];
    const before = projectOf(said, [{ scene: 'a', key: 'k1' }], 'main').scenes[0]?.comments;
    expect(before?.map((c) => [c.text, c.onThisRender])).toEqual([['the hand jumps', true]]);
    const after = projectOf(recordRender(said, sceneRender('a', 'k2', 9)), now, 'main').scenes[0]
      ?.comments;
    expect(after?.map((c) => [c.text, c.onThisRender])).toEqual([['the hand jumps', false]]);
  });
});

test('catalogue.json round-trips through its schema', () => {
  const render = sceneRender('a', 'k1');
  const catalogue = comment(approve(withRenders(render), render, 1), render, 'ok', 'c1', 2);
  const text = Schema.encodeSync(CatalogueJson)(catalogue);
  expect(Schema.decodeSync(CatalogueJson)(text)).toEqual(catalogue);
});
