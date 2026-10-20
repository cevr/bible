import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Duration, Effect, Layer, Option } from 'effect';

import { Address } from './address.ts';
import { layer as listLayer, List, PENDING_FOR, RESEND_AFTER } from './list.ts';
import { Sql } from './sql.ts';
import { layerSqlite } from './sql-sqlite.ts';

const test = it.effect.layer(
  listLayer.pipe(Layer.provideMerge(layerSqlite), Layer.provide(BunServices.layer)),
);

const ANN = Address.make('ann@example.com');
const BEN = Address.make('ben@example.com');
const HOUR = Duration.toMillis(RESEND_AFTER);
const PENDING = Duration.toMillis(PENDING_FOR);

/** Signs an address up and confirms it, answering its id. */
const confirmed = (address: Address, now: number) =>
  Effect.gen(function* () {
    const list = yield* List;
    const claim = Option.getOrThrow(yield* list.signUp(address, now));
    expect(yield* list.confirm(claim, now)).toBe('confirmed');
    return claim.subscriber;
  });

describe('the list', () => {
  test('a new address is claimed one confirm email, and no second within the hour', () =>
    Effect.gen(function* () {
      const list = yield* List;
      const first = yield* list.signUp(ANN, 1000);
      expect(Option.isSome(first)).toBe(true);
      expect(Option.isNone(yield* list.signUp(ANN, 1000 + HOUR - 1))).toBe(true);
      const later = yield* list.signUp(ANN, 1000 + HOUR);
      expect(Option.map(later, (claim) => claim.issued)).toEqual(Option.some(1000 + HOUR));
    }));

  test('a confirmed address is claimed no email', () =>
    Effect.gen(function* () {
      const list = yield* List;
      yield* confirmed(ANN, 1000);
      expect(Option.isNone(yield* list.signUp(ANN, 1000 + 2 * HOUR))).toBe(true);
    }));

  test('only the newest confirm claim confirms, and confirming twice changes nothing', () =>
    Effect.gen(function* () {
      const list = yield* List;
      const old = Option.getOrThrow(yield* list.signUp(ANN, 1000));
      const newest = Option.getOrThrow(yield* list.signUp(ANN, 1000 + HOUR));
      expect(yield* list.confirm(old, 1000 + HOUR + 1)).toBe('invalid');
      expect(yield* list.confirm(newest, 1000 + HOUR + 1)).toBe('confirmed');
      expect(yield* list.confirm(newest, 1000 + HOUR + 2)).toBe('confirmed');
    }));

  test('a claim given back lets the next sign-up send at once', () =>
    Effect.gen(function* () {
      const list = yield* List;
      const claim = Option.getOrThrow(yield* list.signUp(ANN, 1000));
      yield* list.release(claim);
      expect(Option.isSome(yield* list.signUp(ANN, 1001))).toBe(true);
    }));

  test('an address that left can sign up again, and its old confirm link no longer works', () =>
    Effect.gen(function* () {
      const list = yield* List;
      const first = Option.getOrThrow(yield* list.signUp(ANN, 1000));
      expect(yield* list.confirm(first, 1001)).toBe('confirmed');
      yield* list.unsubscribe(first.subscriber, 2000);
      yield* list.unsubscribe(first.subscriber, 2001);
      expect(yield* list.confirm(first, 2002)).toBe('invalid');
      const later = 1000 + Duration.toMillis(RESEND_AFTER);
      const again = Option.getOrThrow(yield* list.signUp(ANN, later));
      expect(again.subscriber).toBe(first.subscriber);
      expect(yield* list.confirm(first, later + 1)).toBe('invalid');
      expect(yield* list.confirm(again, later + 1)).toBe('confirmed');
    }));

  test('leaving and joining again does not start the hour between confirm letters again', () =>
    Effect.gen(function* () {
      const list = yield* List;
      const first = Option.getOrThrow(yield* list.signUp(ANN, 1000));
      yield* list.unsubscribe(first.subscriber, 2000);
      expect(Option.isNone(yield* list.signUp(ANN, 3000))).toBe(true);
      yield* list.unsubscribe(first.subscriber, 4000);
      expect(Option.isNone(yield* list.signUp(ANN, 5000))).toBe(true);
      // The first link was sent before the address left, so it does not work.
      expect(yield* list.confirm(first, 5001)).toBe('invalid');
      // No link is issued at the time the address last left, since none of those confirm.
      const hour = Duration.toMillis(RESEND_AFTER);
      yield* list.unsubscribe(first.subscriber, 1000 + hour);
      expect(Option.isNone(yield* list.signUp(ANN, 1000 + hour))).toBe(true);
      expect(Option.isSome(yield* list.signUp(ANN, 1001 + hour))).toBe(true);
    }));

  test('a film waits for each confirmed subscriber until it is recorded, once', () =>
    Effect.gen(function* () {
      const list = yield* List;
      const ann = yield* confirmed(ANN, 1000);
      const ben = yield* confirmed(BEN, 1000);
      yield* list.signUp(Address.make('cal@example.com'), 1000);
      expect(yield* list.counts('path/01')).toEqual({
        confirmed: 2,
        sent: 0,
        refused: 0,
        waiting: 2,
        unsure: 0,
      });
      expect(yield* list.waiting('path/01', 0, 10)).toEqual([ann, ben]);
      expect(yield* list.waiting('path/01', ann, 10)).toEqual([ben]);
      expect(yield* list.recipient('path/01', ann)).toEqual(Option.some(ANN));

      expect(yield* list.claimSend('path/01', ann, 2000)).toBe(true);
      expect(yield* list.claimSend('path/01', ann, 2000)).toBe(false);
      yield* list.recordSend('path/01', ann, 'sent', 2000);
      yield* list.recordSend('path/01', ann, 'refused', 2001);
      expect(yield* list.claimSend('path/01', ann, 2001)).toBe(false);
      expect(yield* list.claimSend('path/01', ben, 2001)).toBe(true);
      yield* list.recordSend('path/01', ben, 'refused', 2001);
      expect(Option.isNone(yield* list.recipient('path/01', ann))).toBe(true);
      expect(yield* list.waiting('path/01', 0, 10)).toEqual([]);
      expect(yield* list.counts('path/01')).toEqual({
        confirmed: 2,
        sent: 1,
        refused: 1,
        waiting: 0,
        unsure: 0,
      });
      expect(yield* list.waiting('path/02', 0, 10)).toEqual([ann, ben]);
    }));

  test('a claim given back waits again; one never finished is unsure and waits no more', () =>
    Effect.gen(function* () {
      const list = yield* List;
      const ann = yield* confirmed(ANN, 1000);
      const ben = yield* confirmed(BEN, 1000);
      yield* list.claimSend('path/01', ann, 2000);
      yield* list.claimSend('path/01', ben, 2000);
      yield* list.releaseSend('path/01', ann);
      expect(yield* list.waiting('path/01', 0, 10)).toEqual([ann]);
      expect(yield* list.counts('path/01')).toMatchObject({ waiting: 1, unsure: 1, sent: 0 });
      // A subscriber who left is not claimed for.
      const cal = yield* confirmed(Address.make('cal@example.com'), 1000);
      yield* list.unsubscribe(cal, 2000);
      expect(yield* list.claimSend('path/01', cal, 2001)).toBe(false);
      // A kept outcome is not given back.
      yield* list.recordSend('path/01', ben, 'sent', 2001);
      yield* list.releaseSend('path/01', ben);
      expect(yield* list.counts('path/01')).toMatchObject({ waiting: 1, unsure: 0, sent: 1 });
    }));

  test('a subscriber who leaves waits for no film', () =>
    Effect.gen(function* () {
      const list = yield* List;
      const ann = yield* confirmed(ANN, 1000);
      yield* list.unsubscribe(ann, 2000);
      expect(Option.isNone(yield* list.recipient('path/01', ann))).toBe(true);
      expect((yield* list.counts('path/01')).waiting).toBe(0);
    }));

  test('a sign-up never confirmed is deleted thirty days after it, with every row it owns, and not before', () =>
    Effect.gen(function* () {
      const list = yield* List;
      const claim = Option.getOrThrow(yield* list.signUp(ANN, 1000));
      // A row of its own in `sends`, which the list never makes for a pending address.
      const sql = yield* Sql;
      yield* sql.run({ name: 'test.send', text: 'INSERT INTO sends VALUES (?, ?, ?, ?)' }, [
        'path/01',
        claim.subscriber,
        'sent',
        1500,
      ]);
      expect(yield* list.purge(1000 + PENDING - 1)).toEqual({ deleted: 0, sends: 0, left: 0 });
      expect(yield* list.purge(1000 + PENDING)).toEqual({ deleted: 1, sends: 1, left: 0 });
      expect(yield* list.confirm(claim, 1000 + PENDING)).toBe('invalid');
      const rows = yield* sql.all(
        {
          name: 'test.rows',
          text: 'SELECT (SELECT count(*) FROM subscribers) AS subscribers, (SELECT count(*) FROM sends) AS sends',
        },
        [],
      );
      expect(rows).toEqual([{ subscribers: 0, sends: 0 }]);
    }));

  test('signing up again starts the thirty days again', () =>
    Effect.gen(function* () {
      const list = yield* List;
      yield* list.signUp(ANN, 1000);
      const day = Duration.toMillis(Duration.days(1));
      yield* list.signUp(ANN, 1000 + 10 * day);
      expect((yield* list.purge(1000 + PENDING)).deleted).toBe(0);
      expect((yield* list.purge(1000 + 10 * day + PENDING)).deleted).toBe(1);
    }));

  test('a confirmed address stays; one that left and signed up again is marked as left again', () =>
    Effect.gen(function* () {
      const list = yield* List;
      const ann = yield* confirmed(ANN, 1000);
      yield* confirmed(BEN, 1000);
      yield* list.claimSend('path/01', ann, 1500);
      yield* list.recordSend('path/01', ann, 'sent', 1500);
      yield* list.unsubscribe(ann, 2000);
      const rejoin = Option.getOrThrow(yield* list.signUp(ANN, 2000 + HOUR));
      const later = 2000 + HOUR + PENDING;
      expect(yield* list.purge(later)).toEqual({ deleted: 0, sends: 0, left: 1 });
      expect(yield* list.counts('path/01')).toMatchObject({ confirmed: 1, sent: 1 });
      expect(yield* list.confirm(rejoin, later)).toBe('invalid');
      const again = Option.getOrThrow(yield* list.signUp(ANN, later));
      expect(again.subscriber).toBe(ann);
    }));
});
