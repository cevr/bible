// An address as data: which part of a film a command works on, and the one
// string it is keyed by. Its own module, importing nothing of the film, so
// `schema.ts` (a finding's address) and `address.ts` (resolving one against
// the placed film, which reaches `schema.ts` through the layout) both read it
// with no import cycle. `address.ts` re-exports it as the address's one face.

import { Match, Schema } from 'effect';

/** A scene's id as an address names it: never empty, and without the `,` that joins a key's ids. */
const SceneName = Schema.NonEmptyString.check(Schema.isPattern(/^[^,]*$/));

const FilmPart = Schema.TaggedStruct('Film', {});
const ActPart = Schema.TaggedStruct('Act', { act: Schema.NonEmptyString });
const ScenesPart = Schema.TaggedStruct('Scenes', { ids: Schema.NonEmptyArray(SceneName) });

/** Which part of a film: the whole, one act, some scenes (in the order named), or one short. */
export const Address = Schema.Union([
  FilmPart,
  ActPart,
  ScenesPart,
  Schema.TaggedStruct('Short', { id: Schema.NonEmptyString }),
]);
export type Address = typeof Address.Type;

/**
 * A part of the film's own tree (the project's): the whole, one act, some
 * scenes. A short is cut across the film, not a branch of it.
 */
export const PartAddress = Schema.Union([FilmPart, ActPart, ScenesPart]);
export type PartAddress = typeof PartAddress.Type;

/**
 * One address as a string, equal for equal addresses: `film`, `act:<name>`,
 * `scenes:<id>,<id>`, `short:<id>`. A record keyed by address compares these.
 */
export const addressKey = (address: Address): string =>
  Match.valueTags(address, {
    Film: () => 'film',
    Act: ({ act }) => `act:${act}`,
    Scenes: ({ ids }) => `scenes:${ids.join(',')}`,
    Short: ({ id }) => `short:${id}`,
  });

/** One scene's address. */
export const sceneAddress = (id: string): Address => ({ _tag: 'Scenes', ids: [id] });
