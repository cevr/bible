/**
 * The list's log lines: `[mail] <action> key=value …`, with counts, ids,
 * films and error codes only. An address, a token or a secret is never a
 * field: `mail.test.ts` reads every line the routes write and holds them to
 * that.
 */
import { Cause, Effect, Option } from 'effect';

export type LogField = string | number;

const line = (action: string, fields: Readonly<Record<string, LogField>>) =>
  [`[mail] ${action}`, ...Object.entries(fields).map(([key, value]) => `${key}=${value}`)].join(
    ' ',
  );

export const logMail = (action: string, fields: Readonly<Record<string, LogField>> = {}) =>
  Effect.logInfo(line(action, fields));

export const warnMail = (action: string, fields: Readonly<Record<string, LogField>> = {}) =>
  Effect.logWarning(line(action, fields));

/** What a cause names in a log line: its error's `field`, or `defect` for a throw or an interrupt. */
export const reasonOf = <E>(cause: Cause.Cause<E>, field: (error: E) => string) =>
  Option.match(Cause.findErrorOption(cause), { onNone: () => 'defect', onSome: field });
