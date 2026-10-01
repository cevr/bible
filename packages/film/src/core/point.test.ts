import { describe, expect, test } from 'bun:test';
import { Arbitrary, Effect, Option, Result, Schema } from 'effect';
import { CatalogueJson } from './catalogue.ts';
import { PointId, PointRef, pointIdOf } from './point.ts';

/** The point an id names, when it names one: the id read as `PointId` decodes it. */
const pointRefOf = Schema.decodeOption(PointId);

/** Every kind of point, and the string it has always been written as. */
const written: ReadonlyArray<readonly [PointRef, string]> = [
  [{ _tag: 'Score' }, 'score'],
  [{ _tag: 'Take', sound: 'paper.slide' }, 'take:paper.slide'],
  [{ _tag: 'Voice', beat: 'cold' }, 'voice:cold'],
  [{ _tag: 'Look', name: 'ground' }, 'look:ground'],
  [{ _tag: 'Render', address: { _tag: 'Film' } }, 'render:film'],
  [{ _tag: 'Render', address: { _tag: 'Act', act: 'valley' } }, 'render:act:valley'],
  [
    { _tag: 'Render', address: { _tag: 'Scenes', ids: ['cold', 'word'] } },
    'render:scenes:cold,word',
  ],
  [{ _tag: 'Render', address: { _tag: 'Short', id: 'hook' } }, 'render:short:hook'],
  [{ _tag: 'Montage', clip: 'p6-onset-roof' }, 'render:p6-onset-roof'],
  [
    {
      _tag: 'Level',
      target: { _tag: 'Layer', layer: { _tag: 'Bed', index: 3, sound: 'amb.hall' } },
    },
    'level:bed:3:amb.hall',
  ],
  [
    { _tag: 'Level', target: { _tag: 'Layer', layer: { _tag: 'Effect', name: 'gavel' } } },
    'level:effect:gavel',
  ],
  [
    { _tag: 'Level', target: { _tag: 'Layer', layer: { _tag: 'Score', which: 'under' } } },
    'level:score:under',
  ],
  [{ _tag: 'Level', target: { _tag: 'Const', name: 'PAPER' } }, 'level:const:PAPER'],
];

describe('the choice point id', () => {
  test('each point is written as it always was, and reads back as itself', () => {
    for (const [ref, id] of written) {
      expect(pointIdOf(ref)).toBe(id);
      expect(pointRefOf(id)).toEqual(Option.some(ref));
      expect(Schema.encodeSync(PointId)(ref)).toBe(id);
      expect(Schema.decodeSync(PointId)(id)).toEqual(ref);
    }
  });

  test('every point the schema admits is written as an id that reads back as itself', () => {
    const same = Schema.toEquivalence(PointRef);
    const result = Effect.runSync(
      Arbitrary.checkEffect(
        Arbitrary.schema(PointRef),
        (ref) =>
          Result.isSuccess(Schema.decodeResult(PointId)(pointIdOf(ref))) &&
          Option.exists(pointRefOf(pointIdOf(ref)), (back) => same(back, ref)),
        { runs: 2000, seed: 7 },
      ),
    );
    expect(Arbitrary.formatCheckFailure(result)).toBeUndefined();
  });

  test('a montage named like an address, and an empty name, are no point', () => {
    for (const ref of [
      { _tag: 'Montage', clip: 'film' },
      { _tag: 'Montage', clip: 'act:valley' },
      { _tag: 'Montage', clip: 'scenes:a' },
      { _tag: 'Montage', clip: 'short:hook' },
      { _tag: 'Take', sound: '' },
      { _tag: 'Render', address: { _tag: 'Act', act: '' } },
      { _tag: 'Render', address: { _tag: 'Scenes', ids: ['a,b'] } },
      { _tag: 'Level', target: { _tag: 'Layer', layer: { _tag: 'Bed', index: -1, sound: 'x' } } },
    ])
      expect(Result.isFailure(Schema.decodeUnknownResult(PointRef)(ref))).toBe(true);
  });

  test('a string that names no point does not decode', () => {
    for (const id of ['', 'take:', 'nothing:x', 'level:bed:x:amb', 'level:score:loud', 'level:'])
      expect(Result.isFailure(Schema.decodeResult(PointId)(id))).toBe(true);
  });

  test('an id no point is written as does not decode', () => {
    for (const id of [
      'level:bed::amb',
      'level:bed:01:amb',
      'level:bed:1e0:amb',
      'level:bed: 1:amb',
      'level:bed:0x1:amb',
      'render:scenes:a,',
      'render:scenes:,a',
      // A beat is a scene: its id is a `PartId`.
      'voice:Cold Open',
      'voice:-all',
    ]) {
      expect(pointRefOf(id)).toEqual(Option.none());
      expect(Result.isFailure(Schema.decodeResult(PointId)(id))).toBe(true);
    }
  });

  test('any string that reads as a point is that point’s own id', () => {
    const heads = ['', 'score', 'take:', 'look:', 'render:', 'render:scenes:', 'render:act:'];
    const idLike = Arbitrary.map(
      Arbitrary.all([
        Arbitrary.schema(Schema.Literals([...heads, 'level:bed:', 'level:bed:0', 'level:const:'])),
        Arbitrary.schema(Schema.String),
      ]),
      ([head, tail]) => head + tail,
    );
    const result = Effect.runSync(
      Arbitrary.checkEffect(
        idLike,
        (id) =>
          Option.match(pointRefOf(id), {
            onNone: () => Result.isFailure(Schema.decodeResult(PointId)(id)),
            onSome: (ref) =>
              pointIdOf(ref) === id && Result.isSuccess(Schema.decodeResult(PointRef)(ref)),
          }),
        { runs: 4000, seed: 7 },
      ),
    );
    expect(Arbitrary.formatCheckFailure(result)).toBeUndefined();
  });

  test('a catalogue with a say on each kind of point keeps its bytes', () => {
    // As the catalogue writes a say: the render's with no point, every other with its id.
    const said = (point: Option.Option<string>, i: number) =>
      `{"address":{"_tag":"Scenes","ids":["cold"]},${Option.match(point, {
        onNone: () => '',
        onSome: (id) => `"point":"${id}",`,
      })}"variant":"v${i}","key":"k${i}","at":${i}}`;
    const ids = written.map(([, id]) => id).filter((id) => !id.startsWith('render:'));
    const approvals = [said(Option.none(), 0), ...ids.map((id, i) => said(Option.some(id), i + 1))];
    const text = `{"film":"f","renders":[],"approvals":[${approvals.join(',')}],"comments":[]}`;
    const catalogue = Schema.decodeSync(CatalogueJson)(text);
    expect(catalogue.approvals[0]?.point).toEqual(Option.none());
    expect(catalogue.approvals[1]?.point).toEqual(Option.some({ _tag: 'Score' }));
    expect(Schema.encodeSync(CatalogueJson)(catalogue)).toBe(text);
  });
});
