/**
 * What `sim.ts` prints and keeps: one JSON result per command on stdout, and
 * the drive's session, which `boot` writes and every later command reads.
 */
import { Schema } from 'effect';

import { SimError } from './errors.ts';

export const Platform = Schema.Literals(['ios', 'web']);
export type Platform = typeof Platform.Type;

/** A booted drive: what `boot` started, so later commands reach it and `down` stops it. */
export const Session = Schema.Struct({
  platform: Platform,
  /** Where the drive's logs and screenshots go. */
  out: Schema.String,
  /** The dev server's port (8270–8279). */
  port: Schema.Finite,
  /** The process that owns the dev server (`sim.ts serve`). */
  serverPid: Schema.Finite,
  /** The `verify-hymnal` simulator's UDID; empty on the web. */
  udid: Schema.String,
  /** When `boot` started, ISO 8601: `log` reads the app's log from here. */
  bootedAt: Schema.String,
});
export interface Session extends Schema.Schema.Type<typeof Session> {}

/** A command that did what it was asked. */
export const Success = Schema.Struct({
  ok: Schema.Literal(true),
  command: Schema.String,
  platform: Platform,
  /** The files the command wrote, by what they hold. */
  paths: Schema.Record(Schema.String, Schema.String),
  /** What the command saw, in short. */
  detail: Schema.Record(
    Schema.String,
    Schema.Union([Schema.String, Schema.Finite, Schema.Boolean]),
  ),
  ms: Schema.Finite,
});
export interface Success extends Schema.Schema.Type<typeof Success> {}

/** A command that failed: its tagged error, the cause, with every field. */
export const Failure = Schema.Struct({
  ok: Schema.Literal(false),
  command: Schema.String,
  message: Schema.String,
  error: SimError,
  ms: Schema.Finite,
});
export interface Failure extends Schema.Schema.Type<typeof Failure> {}

/** One line of `sim.ts` output. */
export const Result = Schema.Union([Success, Failure]);
export type Result = typeof Result.Type;
