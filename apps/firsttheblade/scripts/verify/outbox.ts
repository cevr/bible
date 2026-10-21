/**
 * The letters a preview wrote instead of sending (`../../src/mail/mailer.ts`
 * `layerOutbox`): one file a letter, `<n>.txt`, its headers (`To:`,
 * `Subject:`, a film's `List-Unsubscribe`), a blank line, then its text. A
 * letter's link is the one a person opens in it: the confirm link of a
 * confirm letter, the leave link at the foot of a film's.
 */
import { Effect, FileSystem, Option, Path, Schedule } from 'effect';

import { MAIL_ROUTES } from '../../src/mail/paths.ts';
import { type Letter, NotReady } from './model.ts';

const CONFIRM_LINK = new RegExp(`https?://\\S+${MAIL_ROUTES.confirm}\\?token=\\S+`);
const LEAVE_LINK = new RegExp(`https?://\\S+${MAIL_ROUTES.unsubscribe}\\?token=\\S+`);

const header = (lines: ReadonlyArray<string>, name: string) =>
  Option.getOrElse(
    Option.map(Option.fromUndefinedOr(lines.find((line) => line.startsWith(`${name}: `))), (line) =>
      line.slice(name.length + 2),
    ),
    () => '',
  );

/** A letter's file as the outbox wrote it, read back. */
export const parseLetter = (file: string, text: string): Letter => {
  const [head = '', ...body] = text.split('\n\n');
  const lines = head.split('\n');
  const words = body.join('\n\n');
  const n = Number(file.replace(/^.*\//, '').replace(/\.txt$/, ''));
  const base = { file, n, to: header(lines, 'To'), subject: header(lines, 'Subject') };
  const confirm = CONFIRM_LINK.exec(words);
  if (confirm) return { ...base, kind: 'confirm', link: confirm[0] };
  const leave = LEAVE_LINK.exec(words);
  if (leave) return { ...base, kind: 'film', link: leave[0] };
  return { ...base, kind: 'other' };
};

/** Every letter in `outbox`, oldest first; none when the outbox is not there yet. */
export const readOutbox = Effect.fn('Verify.readOutbox')(function* (outbox: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  if (!(yield* fs.exists(outbox))) return [];
  const files = (yield* fs.readDirectory(outbox)).filter((name) => /^\d+\.txt$/.test(name));
  const letters = yield* Effect.forEach(
    files,
    (name) =>
      Effect.map(fs.readFileString(path.join(outbox, name)), (text) =>
        parseLetter(path.join(outbox, name), text),
      ),
    { concurrency: 8 },
  );
  return letters.toSorted((a, b) => a.n - b.n);
});

/** The newest letter to `to`, waited for: a sign-up's letter is written after its answer. */
export const awaitLetter = Effect.fn('Verify.awaitLetter')(function* (outbox: string, to: string) {
  return yield* readOutbox(outbox).pipe(
    Effect.flatMap((letters) =>
      Effect.fromOption(Option.fromUndefinedOr(letters.findLast((letter) => letter.to === to))),
    ),
    Effect.mapError(() => NotReady.make({ message: `no letter to ${to} in ${outbox}` })),
    Effect.retry({ schedule: Schedule.spaced('100 millis'), times: 50 }),
  );
});
