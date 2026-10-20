/**
 * The email list: who is on it and which films they were sent, over the
 * database's port (`./sql.ts`), in the tables `migrations/0001_mail.sql`
 * makes. Each step that must not run twice is one statement, so two
 * requests at once cannot both take it: a sign-up claims its confirm email
 * in the same UPDATE that checks it may, and a film's email is claimed under
 * the (film, subscriber) key before it is sent.
 */
import { Context, Duration, Effect, Layer, Option, Schema } from 'effect';

import { Address } from './address.ts';
import { Sql, SqlError, type SqlValue, type Statement } from './sql.ts';

/** How long after a confirm email another may be sent to the same address. */
export const RESEND_AFTER = Duration.hours(1);

/** A confirm email the list has claimed: send it with a token issued at `issued`. */
export interface ConfirmClaim {
  readonly subscriber: number;
  readonly issued: number;
}

/** What a film's send has reached. */
export interface FilmCounts {
  readonly confirmed: number;
  readonly sent: number;
  readonly refused: number;
  /** Confirmed, and neither sent the film nor refused it. */
  readonly waiting: number;
  /**
   * Started and never finished: the send stopped before its outcome was
   * kept. The letter may have gone, so it is never sent again.
   */
  readonly unsure: number;
}

export type Outcome = 'sent' | 'refused';

export interface ListService {
  /**
   * Puts an address on the list as pending (or back to pending, after it
   * left), and claims its confirm email when one may go now: none for an
   * address already confirmed, nor within `RESEND_AFTER` of the last, even
   * one sent before the address left, nor at or before the time it last left
   * (a link issued then would never confirm).
   */
  readonly signUp: (
    address: Address,
    now: number,
  ) => Effect.Effect<Option.Option<ConfirmClaim>, SqlError>;
  /** Gives a claim back when its email could not be sent, so the next sign-up sends one. */
  readonly release: (claim: ConfirmClaim) => Effect.Effect<void, SqlError>;
  /**
   * Confirms the subscriber a claim's token names, when it is the newest
   * claim and was made after the address last left; a subscriber already
   * confirmed stays so.
   */
  readonly confirm: (
    claim: ConfirmClaim,
    now: number,
  ) => Effect.Effect<'confirmed' | 'invalid', SqlError>;
  /** Takes a subscriber off the list; one already off stays so. */
  readonly unsubscribe: (subscriber: number, now: number) => Effect.Effect<void, SqlError>;
  readonly counts: (film: string) => Effect.Effect<FilmCounts, SqlError>;
  /** The next confirmed subscribers after `after` (by id) still waiting for the film. */
  readonly waiting: (
    film: string,
    after: number,
    limit: number,
  ) => Effect.Effect<ReadonlyArray<number>, SqlError>;
  /** A subscriber's address, while they are confirmed and still waiting for the film. */
  readonly recipient: (
    film: string,
    subscriber: number,
  ) => Effect.Effect<Option.Option<Address>, SqlError>;
  /**
   * Claims the film's email to a subscriber before it is sent: true when
   * this call took it, false when it was taken before (sent, refused, or
   * being sent) or the subscriber is no longer confirmed.
   */
  readonly claimSend: (
    film: string,
    subscriber: number,
    now: number,
  ) => Effect.Effect<boolean, SqlError>;
  /** Gives a claimed send back when its letter could not go now, so a retry sends it. */
  readonly releaseSend: (film: string, subscriber: number) => Effect.Effect<void, SqlError>;
  /** Keeps a claimed send's outcome. */
  readonly recordSend: (
    film: string,
    subscriber: number,
    outcome: Outcome,
    now: number,
  ) => Effect.Effect<void, SqlError>;
}

export class List extends Context.Service<List, ListService>()('firsttheblade/List') {}

const statement = (name: string, text: string): Statement => ({ name, text });

/** Not yet sent the film nor refused it. */
const NOT_SENT = 'NOT EXISTS (SELECT 1 FROM sends d WHERE d.film = ? AND d.subscriber_id = s.id)';

const UPSERT = statement(
  'list.upsert',
  `INSERT INTO subscribers (address, status, created_at) VALUES (?, 'pending', ?)
   ON CONFLICT (address) DO UPDATE SET status = 'pending', confirmed_at = NULL
   WHERE subscribers.status = 'unsubscribed'`,
);

const CLAIM = statement(
  'list.claim',
  `UPDATE subscribers SET confirm_sent_at = ?
   WHERE address = ? AND status = 'pending' AND (confirm_sent_at IS NULL OR confirm_sent_at <= ?)
     AND (unsubscribed_at IS NULL OR unsubscribed_at < ?)
   RETURNING id`,
);

const RELEASE = statement(
  'list.release',
  `UPDATE subscribers SET confirm_sent_at = NULL WHERE id = ? AND confirm_sent_at = ?`,
);

const CONFIRM = statement(
  'list.confirm',
  `UPDATE subscribers SET status = 'confirmed', confirmed_at = ?
   WHERE id = ? AND status = 'pending' AND confirm_sent_at = ?
     AND (unsubscribed_at IS NULL OR unsubscribed_at < ?)`,
);

const STATUS = statement('list.status', `SELECT status FROM subscribers WHERE id = ?`);

const UNSUBSCRIBE = statement(
  'list.unsubscribe',
  `UPDATE subscribers SET status = 'unsubscribed', unsubscribed_at = ?
   WHERE id = ? AND status != 'unsubscribed'`,
);

const COUNTS = statement(
  'list.counts',
  `SELECT
     (SELECT count(*) FROM subscribers WHERE status = 'confirmed') AS confirmed,
     (SELECT count(*) FROM sends WHERE film = ? AND outcome = 'sent') AS sent,
     (SELECT count(*) FROM sends WHERE film = ? AND outcome = 'refused') AS refused,
     (SELECT count(*) FROM subscribers s WHERE s.status = 'confirmed' AND ${NOT_SENT}) AS waiting,
     (SELECT count(*) FROM sends WHERE film = ? AND outcome = 'sending') AS unsure`,
);

const WAITING = statement(
  'list.waiting',
  `SELECT id FROM subscribers s
   WHERE s.status = 'confirmed' AND s.id > ? AND ${NOT_SENT}
   ORDER BY s.id LIMIT ?`,
);

const RECIPIENT = statement(
  'list.recipient',
  `SELECT address FROM subscribers s WHERE s.id = ? AND s.status = 'confirmed' AND ${NOT_SENT}`,
);

const CLAIM_SEND = statement(
  'list.claimSend',
  `INSERT INTO sends (film, subscriber_id, outcome, at)
   SELECT ?, s.id, 'sending', ? FROM subscribers s WHERE s.id = ? AND s.status = 'confirmed'
   ON CONFLICT (film, subscriber_id) DO NOTHING`,
);

const RELEASE_SEND = statement(
  'list.releaseSend',
  `DELETE FROM sends WHERE film = ? AND subscriber_id = ? AND outcome = 'sending'`,
);

const RECORD_SEND = statement(
  'list.recordSend',
  `UPDATE sends SET outcome = ?, at = ?
   WHERE film = ? AND subscriber_id = ? AND outcome = 'sending'`,
);

const IdRow = Schema.Struct({ id: Schema.Int });
const StatusRow = Schema.Struct({ status: Schema.String });
const AddressRow = Schema.Struct({ address: Address });
const CountsRow = Schema.Struct({
  confirmed: Schema.Int,
  sent: Schema.Int,
  refused: Schema.Int,
  waiting: Schema.Int,
  unsure: Schema.Int,
});

export const layer = Layer.effect(
  List,
  Effect.gen(function* () {
    const sql = yield* Sql;

    /** The rows a statement answers, each read as `row`. */
    const rows = <A, I>(
      row: Schema.Codec<A, I>,
      query: Statement,
      values: ReadonlyArray<SqlValue>,
    ) =>
      sql
        .all(query, values)
        .pipe(
          Effect.flatMap((found) =>
            Schema.decodeUnknownEffect(Schema.Array(row))(found).pipe(
              Effect.mapError(() =>
                SqlError.make({ statement: query.name, reason: 'a row of an unexpected shape' }),
              ),
            ),
          ),
        );

    const signUp = Effect.fn('List.signUp')(function* (address: Address, now: number) {
      yield* sql.run(UPSERT, [address, now]);
      const claimed = yield* rows(IdRow, CLAIM, [
        now,
        address,
        now - Duration.toMillis(RESEND_AFTER),
        now,
      ]);
      return Option.map(Option.fromNullishOr(claimed[0]), (row) => ({
        subscriber: row.id,
        issued: now,
      }));
    });

    const release = Effect.fn('List.release')(function* (claim: ConfirmClaim) {
      yield* sql.run(RELEASE, [claim.subscriber, claim.issued]);
    });

    const confirm = Effect.fn('List.confirm')(function* (claim: ConfirmClaim, now: number) {
      const changed = yield* sql.run(CONFIRM, [now, claim.subscriber, claim.issued, claim.issued]);
      if (changed > 0) return 'confirmed' as const;
      const [row] = yield* rows(StatusRow, STATUS, [claim.subscriber]);
      if (row?.status === 'confirmed') return 'confirmed' as const;
      return 'invalid' as const;
    });

    const unsubscribe = Effect.fn('List.unsubscribe')(function* (subscriber: number, now: number) {
      yield* sql.run(UNSUBSCRIBE, [now, subscriber]);
    });

    const counts = Effect.fn('List.counts')(function* (film: string) {
      const [row] = yield* rows(CountsRow, COUNTS, [film, film, film, film]);
      return row ?? { confirmed: 0, sent: 0, refused: 0, waiting: 0, unsure: 0 };
    });

    const waiting = Effect.fn('List.waiting')(function* (
      film: string,
      after: number,
      limit: number,
    ) {
      const found = yield* rows(IdRow, WAITING, [after, film, limit]);
      return found.map((row) => row.id);
    });

    const recipient = Effect.fn('List.recipient')(function* (film: string, subscriber: number) {
      const [row] = yield* rows(AddressRow, RECIPIENT, [subscriber, film]);
      return Option.map(Option.fromNullishOr(row), (found) => found.address);
    });

    const claimSend = Effect.fn('List.claimSend')(function* (
      film: string,
      subscriber: number,
      now: number,
    ) {
      return (yield* sql.run(CLAIM_SEND, [film, now, subscriber])) > 0;
    });

    const releaseSend = Effect.fn('List.releaseSend')(function* (film: string, subscriber: number) {
      yield* sql.run(RELEASE_SEND, [film, subscriber]);
    });

    const recordSend = Effect.fn('List.recordSend')(function* (
      film: string,
      subscriber: number,
      outcome: Outcome,
      now: number,
    ) {
      yield* sql.run(RECORD_SEND, [outcome, now, film, subscriber]);
    });

    return List.of({
      signUp,
      release,
      confirm,
      unsubscribe,
      counts,
      waiting,
      recipient,
      claimSend,
      releaseSend,
      recordSend,
    });
  }),
);
