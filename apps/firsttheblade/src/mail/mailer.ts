/**
 * Sending one letter. On Cloudflare it is the Worker's Email Sending binding
 * (`../worker/mail.ts`); in the tests it is a list the test reads
 * (`layerMemory`); under `bun run preview` each letter is written to a file
 * (`layerOutbox`), so the links in it can be followed on a laptop and no mail
 * leaves it.
 *
 * A send either goes, is refused for good (a fact about that one address:
 * it is on Cloudflare's suppression list, or its own server turned the letter
 * away), or is unavailable (anything else: a limit, an outage, a setting, a
 * letter the sender finds malformed), to be tried again later. Only a refusal
 * is recorded against the address; an unavailable send stops its batch, so a
 * setting that is wrong never marks the whole list as refused.
 */
import { Context, Effect, FileSystem, Layer, Path, Ref, Schema } from 'effect';

import type { Address } from './address.ts';

/** Who every letter is from. */
export const FROM = { name: 'First the Blade', email: 'films@firsttheblade.com' } as const;

export interface Letter {
  readonly to: Address;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
  /** Headers beyond the ones the sender sets (`List-Unsubscribe`, `List-Unsubscribe-Post`). */
  readonly headers: Readonly<Record<string, string>>;
}

/** The sender will never take this letter. `code` is the sender's, never the address. */
export class MailRefused extends Schema.TaggedError<MailRefused>()('MailRefused', {
  code: Schema.String,
}) {}

/** The letter could not be sent now; try again later. */
export class MailUnavailable extends Schema.TaggedError<MailUnavailable>()('MailUnavailable', {
  code: Schema.String,
}) {}

export interface MailerService {
  readonly send: (letter: Letter) => Effect.Effect<void, MailRefused | MailUnavailable>;
}

export class Mailer extends Context.Service<Mailer, MailerService>()('firsttheblade/Mailer') {}

/**
 * The codes Email Sending's `send()` refuses one address with, whatever the
 * letter: suppressed, outside the binding's allowed destinations, or turned
 * away by the address's own server.
 */
const REFUSED_CODES: ReadonlySet<string> = new Set([
  'E_RECIPIENT_SUPPRESSED',
  'E_RECIPIENT_NOT_ALLOWED',
  'E_DELIVERY_FAILED',
]);

/** A sender's error as one of the two failures, by its code. */
export const failureOf = (code: string): MailRefused | MailUnavailable => {
  if (REFUSED_CODES.has(code)) return MailRefused.make({ code });
  return MailUnavailable.make({ code });
};

/** The letters a test's mailer took, and what it answers the next sends with. */
export interface MailboxService {
  readonly letters: Effect.Effect<ReadonlyArray<Letter>>;
  /** Makes each next send fail as given, in order, then go again. */
  readonly failNext: (
    ...failures: ReadonlyArray<MailRefused | MailUnavailable>
  ) => Effect.Effect<void>;
}

export class Mailbox extends Context.Service<Mailbox, MailboxService>()('firsttheblade/Mailbox') {}

/** A mailer that keeps what it is sent, for the tests. */
export const layerMemory = Layer.effectContext(
  Effect.gen(function* () {
    const sent = yield* Ref.make<ReadonlyArray<Letter>>([]);
    const failures = yield* Ref.make<ReadonlyArray<MailRefused | MailUnavailable>>([]);
    const send = Effect.fn('Mailer.send')(function* (letter: Letter) {
      const [failure, ...rest] = yield* Ref.get(failures);
      if (failure) {
        yield* Ref.set(failures, rest);
        return yield* failure;
      }
      yield* Ref.update(sent, (letters) => [...letters, letter]);
    });
    return Context.make(Mailer, Mailer.of({ send })).pipe(
      Context.add(
        Mailbox,
        Mailbox.of({
          letters: Ref.get(sent),
          failNext: (...next) => Ref.set(failures, next),
        }),
      ),
    );
  }),
);

/** A mailer that writes each letter to `<dir>/<n>.txt`, for `bun run preview`. */
export const layerOutbox = (dir: string) =>
  Layer.effect(
    Mailer,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const count = yield* Ref.make(0);
      yield* fs.makeDirectory(dir, { recursive: true }).pipe(Effect.orDie);
      const send = Effect.fn('Mailer.send')(function* (letter: Letter) {
        const n = yield* Ref.updateAndGet(count, (value) => value + 1);
        const headers = Object.entries(letter.headers).map(([name, value]) => `${name}: ${value}`);
        const body = [
          `To: ${letter.to}`,
          `Subject: ${letter.subject}`,
          ...headers,
          '',
          letter.text,
        ];
        yield* fs
          .writeFileString(path.join(dir, `${n}.txt`), `${body.join('\n')}\n`)
          .pipe(Effect.mapError(() => MailUnavailable.make({ code: 'E_OUTBOX' })));
      });
      return Mailer.of({ send });
    }),
  );
