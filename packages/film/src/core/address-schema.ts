// An address as data: which part of a film a command works on, and the one
// string it is keyed by. Its own module, importing nothing of the film, so
// `schema.ts` (a finding's address) and `address.ts` (resolving one against
// the placed film, which reaches `schema.ts` through the layout) both read it
// with no import cycle. `address.ts` re-exports it as the address's one face.

import { Match, Schema } from 'effect';

const PART_ID = /^[a-z0-9][a-z0-9-]*$/;

/**
 * A scene's or a short's id: lower case, digits and dashes, starting with a
 * letter or a digit (`cold`, `rain-2`). It names the part's files, its
 * address key and its choice point's id, so it never holds the `,` that
 * joins a key's ids nor the `:` of a key, and never reads as a flag. A
 * refusal names the id.
 */
export const PartId = Schema.String.check(
  Schema.makeFilter(
    (id: string) =>
      PART_ID.test(id) ||
      `"${id}" is no id: lower case, digits and dashes, starting with a letter or a digit`,
  ),
  // The pattern again, as a pattern: property tests generate ids from it.
  Schema.isPattern(PART_ID),
);

/** An act's name (`cold open`): never empty, and never starting with the `-` of a flag. */
export const ActName = Schema.String.check(
  Schema.isPattern(/^[^-]/, {
    message: 'an act is named by a word, never empty nor starting with "-"',
  }),
);

const FilmPart = Schema.TaggedStruct('Film', {});
const ActPart = Schema.TaggedStruct('Act', { act: ActName });
const ScenesPart = Schema.TaggedStruct('Scenes', { ids: Schema.NonEmptyArray(PartId) });

/** Which part of a film: the whole, one act, some scenes (in the order named), or one short. */
export const Address = Schema.Union([
  FilmPart,
  ActPart,
  ScenesPart,
  Schema.TaggedStruct('Short', { id: PartId }),
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
