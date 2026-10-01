// A choice point's id: what the point is (`PointRef`) and the one string it
// is written as (`PointId`), on the wire, in a review URL and in
// `catalogue.json`. Every id is built by encoding a ref and read back by
// decoding it; no caller slices or splits one. Pure.
//
// The strings: `score`; `take:<sound>`; `voice:<beat>`; `look:<name>`;
// `render:<address key>` for an address's render set and `render:<clip>`
// for a montage's; `level:bed:<index>:<sound>`, `level:effect:<name>`,
// `level:score:under|alone` and `level:const:<NAME>` for a sound layer's
// level. Every name is non-empty, and a montage clip (named by its file) is
// never `film`, `act:…`, `scenes:…` or `short:…` (`Clip` refuses it), so
// every ref the schema admits reads back from its id as itself. Reading
// back is canonical too: a string is a point only when it is that point's own
// id, so `level:bed:01:x` or `render:scenes:a,` is no point.

import { Effect, Match, Option, Schema, SchemaIssue, SchemaTransformation } from 'effect';
import { Address, addressKey, addressOfKey } from './address.ts';
import { PartId } from './address-schema.ts';

/** A name inside a point's id: never empty, so the id reads back as the point. */
const Name = Schema.NonEmptyString;

/** A layer of the film's sound whose level `sound.ts` sets. */
export const SoundLayer = Schema.Union([
  Schema.TaggedStruct('Bed', {
    index: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    sound: Name,
  }),
  Schema.TaggedStruct('Effect', { name: Name }),
  Schema.TaggedStruct('Score', { which: Schema.Literals(['under', 'alone']) }),
]);
export type SoundLayer = typeof SoundLayer.Type;

/** What a level knob writes: one layer's own level, or a constant layers share. */
export const LevelTarget = Schema.Union([
  Schema.TaggedStruct('Layer', { layer: SoundLayer }),
  Schema.TaggedStruct('Const', { name: Name }),
]);
export type LevelTarget = typeof LevelTarget.Type;

/**
 * A montage's clip, named by its file: never empty, and never an address key
 * (`film`, `act:…`, `scenes:…`, `short:…`), so its `render:` id reads back
 * as a montage.
 */
export const Clip = Name.check(
  Schema.makeFilter((clip: string) =>
    Option.match(addressOfKey(clip), {
      onNone: () => true,
      onSome: () => `a montage clip is not named like an address ("${clip}")`,
    }),
  ),
);

/** Which choice point: an address's render set, a montage's, the score, a take, a voice, a look or a level. */
export const PointRef = Schema.Union([
  Schema.TaggedStruct('Render', { address: Address }),
  Schema.TaggedStruct('Montage', { clip: Clip }),
  Schema.TaggedStruct('Score', {}),
  Schema.TaggedStruct('Take', { sound: Name }),
  Schema.TaggedStruct('Voice', { beat: PartId }),
  Schema.TaggedStruct('Look', { name: Name }),
  Schema.TaggedStruct('Level', { target: LevelTarget }),
]).pipe(Schema.toTaggedUnion('_tag'));
export type PointRef = typeof PointRef.Type;

const levelText = (target: LevelTarget): string =>
  Match.valueTags(target, {
    Const: ({ name }) => `const:${name}`,
    Layer: ({ layer }) =>
      Match.valueTags(layer, {
        Bed: ({ index, sound }) => `bed:${index}:${sound}`,
        Effect: ({ name }) => `effect:${name}`,
        Score: ({ which }) => `score:${which}`,
      }),
  });

/** `ref` as its id. */
const encode = (ref: PointRef): string =>
  PointRef.match(ref, {
    Render: ({ address }) => `render:${addressKey(address)}`,
    Montage: ({ clip }) => `render:${clip}`,
    Score: () => 'score',
    Take: ({ sound }) => `take:${sound}`,
    Voice: ({ beat }) => `voice:${beat}`,
    Look: ({ name }) => `look:${name}`,
    Level: ({ target }) => `level:${levelText(target)}`,
  });

/** A level id's target (`bed:3:amb.hall`), when it names one. */
const levelOf = (text: string): Option.Option<LevelTarget> => {
  const [what = '', ...rest] = text.split(':');
  const tail = rest.join(':');
  if (tail === '') return Option.none();
  if (what === 'const') return Option.some({ _tag: 'Const', name: tail });
  if (what === 'effect')
    return Option.some({ _tag: 'Layer', layer: { _tag: 'Effect', name: tail } });
  if (what === 'score' && (tail === 'under' || tail === 'alone'))
    return Option.some({ _tag: 'Layer', layer: { _tag: 'Score', which: tail } });
  if (what !== 'bed') return Option.none();
  const [index = '', ...sound] = rest;
  const n = Number(index);
  if (!Number.isInteger(n) || n < 0 || sound.length === 0) return Option.none();
  return Option.some({ _tag: 'Layer', layer: { _tag: 'Bed', index: n, sound: sound.join(':') } });
};

/** `id` read as a ref, before the schema and the round trip judge it. */
const read = (id: string): Option.Option<PointRef> => {
  if (id === 'score') return Option.some({ _tag: 'Score' });
  const colon = id.indexOf(':');
  if (colon <= 0 || colon === id.length - 1) return Option.none();
  const kind = id.slice(0, colon);
  const name = id.slice(colon + 1);
  switch (kind) {
    case 'take':
      return Option.some({ _tag: 'Take', sound: name });
    case 'voice':
      return Option.some({ _tag: 'Voice', beat: name });
    case 'look':
      return Option.some({ _tag: 'Look', name });
    case 'level':
      return Option.map(levelOf(name), (target): PointRef => ({ _tag: 'Level', target }));
    case 'render':
      return Option.some(
        Option.match(addressOfKey(name), {
          onNone: (): PointRef => ({ _tag: 'Montage', clip: name }),
          onSome: (address): PointRef => ({ _tag: 'Render', address }),
        }),
      );
    default:
      return Option.none();
  }
};

const isPointRef = Schema.is(PointRef);

/** `id` read back as its ref, when it is the id that ref is written as. */
const decode = (id: string): Option.Option<PointRef> =>
  Option.filter(read(id), (ref) => isPointRef(ref) && encode(ref) === id);

/** A choice point's id on the wire and on disk, decoded to the point it names. */
export const PointId = Schema.String.pipe(
  Schema.decodeTo(
    PointRef,
    SchemaTransformation.transformEffect({
      decode: (id: string) =>
        Effect.fromOption(decode(id)).pipe(
          Effect.mapError(
            () => new SchemaIssue.InvalidValue({ message: `no choice point is "${id}"` }, id),
          ),
        ),
      encode: (ref: PointRef) => Effect.succeed(encode(ref)),
    }),
  ),
);

/** A point's id: `take:paper.slide`, `render:scenes:cold`, `score`. */
export const pointIdOf = (ref: PointRef): string => encode(ref);

/** The point an id names, when it names one. */
export const pointRefOf = (id: string): Option.Option<PointRef> => decode(id);
