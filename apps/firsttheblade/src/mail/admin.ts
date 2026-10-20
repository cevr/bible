/**
 * What `bun run mail:send` (`../../scripts/mail-send.ts`) and the Worker's
 * send route (`./routes.ts`) say to each other: one contract, read on both
 * sides.
 */
import { Schema } from 'effect';

export const SendRequest = Schema.Struct({
  /** `<series id>/<no>` (`./films.ts`). */
  film: Schema.String,
  /** Count only: put nothing on the queue. */
  dryRun: Schema.optionalKey(Schema.Boolean),
});
export type SendRequest = typeof SendRequest.Type;

/** A film's send as it stands, and how many deliveries this call queued. */
export const SendCounts = Schema.Struct({
  film: Schema.String,
  confirmed: Schema.Int,
  sent: Schema.Int,
  refused: Schema.Int,
  waiting: Schema.Int,
  /** Sends that stopped before their outcome was kept: never sent again (`./list.ts`). */
  unsure: Schema.Int,
  queued: Schema.Int,
});

export const SendRefusal = Schema.Struct({ error: Schema.String });

export const SendAnswer = Schema.Union([SendCounts, SendRefusal]);
export type SendAnswer = typeof SendAnswer.Type;
