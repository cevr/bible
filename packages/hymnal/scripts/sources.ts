/**
 * What the compiler is given for each hymn, built one way for the compile
 * script and for the test that compiles every hymn fresh: the row's title
 * and verses from hymnal.db, the MIDI file's bytes, why it is held back (if
 * it is), and where its refrain is sung (`data/fixes/refrains.json`, read
 * off each refrain hymn's page: hymnal.db cannot say it). Every refrain hymn
 * is listed there, and only those: a refrain with no place, or a place for a
 * hymn with no refrain, is refused, never filled with a default.
 */

import { Effect, Schema } from 'effect';

import type { compile } from '../src/compile.js';
import { Order } from '../src/hymn.js';

type Source = Parameters<typeof compile>[0];

/** Hymns held back as plain text, each with its reason. */
export const HELD: ReadonlyMap<number, string> = new Map(
  [126, 225, 262, 292, 403, 453, 580].map((n) => [
    n,
    'verse split misplaced, spot check 2026-10-17',
  ]),
);

const Refrains = Schema.fromJsonString(
  Schema.Struct({
    print: Schema.String,
    hymns: Schema.Array(Schema.Struct({ number: Schema.Int, order: Order, from: Schema.String })),
  }),
);

/** Where each listed hymn's refrain is sung, from the text of `data/fixes/refrains.json`. */
export const decodeOrders = (text: string) =>
  Schema.decodeEffect(Refrains)(text).pipe(
    Effect.map(({ hymns }) => new Map(hymns.map((hymn) => [hymn.number, hymn.order]))),
  );

/** A hymn whose refrain `refrains.json` does not place, or a place it lists for a hymn with no refrain. */
class RefrainPlaceError extends Schema.TaggedError<RefrainPlaceError>()('RefrainPlaceError', {
  number: Schema.Int,
  reason: Schema.Literals(['a refrain with no place', 'a place with no refrain']),
}) {}

/** Hymn n's source: its row, its MIDI file, its held reason and where its refrain is sung. */
export const sourceOf = (
  row: {
    readonly number: number;
    readonly name: string;
    readonly verses: Source['verses'];
  },
  midi: Uint8Array,
  orders: ReadonlyMap<number, Order>,
): Effect.Effect<Source, RefrainPlaceError> => {
  const order = orders.get(row.number);
  const refrain = row.verses.some((verse) => verse.id < 0);
  if (refrain && order === undefined)
    return Effect.fail(
      RefrainPlaceError.make({ number: row.number, reason: 'a refrain with no place' }),
    );
  if (!refrain && order !== undefined)
    return Effect.fail(
      RefrainPlaceError.make({ number: row.number, reason: 'a place with no refrain' }),
    );
  return Effect.succeed({
    book: 'sdah-1985',
    number: row.number,
    title: row.name,
    verses: row.verses,
    midi,
    held: HELD.get(row.number),
    order,
  });
};
