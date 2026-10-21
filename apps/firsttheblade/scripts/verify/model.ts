/**
 * What the verify helpers print and read (`./cli.ts`), and how they fail.
 * Every command prints one JSON value on success, encoded by its schema
 * here, and fails with one of these tagged errors and a non-zero exit, so an
 * agent reads the outcome without reading logs.
 */
import { Console, Effect, Schema } from 'effect';

/**
 * An instance `bun run verify:launch` started, kept at `<root>/launch.json`:
 * the preview's PID (the process that holds the port), the commit it serves
 * and where its build, outbox and log are.
 */
export const LaunchRecord = Schema.Struct({
  root: Schema.String,
  port: Schema.Int,
  origin: Schema.String,
  pid: Schema.Int,
  head: Schema.String,
  dist: Schema.String,
  outbox: Schema.String,
  log: Schema.String,
  startedAt: Schema.String,
});
export interface LaunchRecord extends Schema.Schema.Type<typeof LaunchRecord> {}

/** One letter the preview wrote to its outbox, with the link a person opens in it. */
export const Letter = Schema.Struct({
  file: Schema.String,
  n: Schema.Int,
  to: Schema.String,
  subject: Schema.String,
  kind: Schema.Literals(['confirm', 'film', 'other']),
  link: Schema.optionalKey(Schema.String),
});
export interface Letter extends Schema.Schema.Type<typeof Letter> {}

export const OutboxReport = Schema.Struct({
  outbox: Schema.String,
  letters: Schema.Array(Letter),
});

/** One check of `verify:doctor`, as it passed. */
export const Check = Schema.Struct({ check: Schema.String, detail: Schema.String });
export interface Check extends Schema.Schema.Type<typeof Check> {}

export const DoctorReport = Schema.Struct({
  ok: Schema.Literal(true),
  target: Schema.String,
  checks: Schema.Array(Check),
  /** Whether a timing measured now means anything: the load is below the core count. */
  timingsValid: Schema.Boolean,
});

/** One step of a journey, as the drive saw it after the action. */
export const Step = Schema.Struct({
  n: Schema.Int,
  step: Schema.String,
  action: Schema.String,
  url: Schema.String,
  observed: Schema.String,
  /** What the step kept: its screenshot and ARIA snapshot, or the letter it read. */
  files: Schema.Array(Schema.String),
  /** When the step ended, from the journey's start. */
  atMs: Schema.Int,
});
export interface Step extends Schema.Schema.Type<typeof Step> {}

export const Steps = Schema.Array(Step);

export const Video = Schema.Struct({ path: Schema.String, seconds: Schema.Finite });

export const JourneyReport = Schema.Struct({
  journey: Schema.String,
  evidence: Schema.String,
  steps: Steps,
  video: Schema.optionalKey(Video),
});
export interface JourneyReport extends Schema.Schema.Type<typeof JourneyReport> {}

export const DriveReport = Schema.Struct({
  passed: Schema.Literal(true),
  origin: Schema.String,
  root: Schema.String,
  doctor: DoctorReport,
  journeys: Schema.Array(JourneyReport),
});

export const StageReport = Schema.Struct({
  stage: Schema.String,
  action: Schema.Literals(['up', 'down']),
  url: Schema.optionalKey(Schema.String),
  log: Schema.String,
});

export const StopReport = Schema.Struct({
  stopped: Schema.Int,
  port: Schema.Int,
  root: Schema.String,
});

/** The value printed as one line of JSON on stdout. */
export const printJson = <A, I>(schema: Schema.Codec<A, I>) => {
  const encode = Schema.encodeEffect(Schema.fromJsonString(schema));
  return (value: A) => Effect.flatMap(Effect.orDie(encode(value)), Console.log);
};

/** A port, root or stage the helpers refuse, so no run drives the owner's instance or prod. */
export class Refused extends Schema.TaggedError<Refused>()('Refused', {
  message: Schema.String,
}) {}

/** The site is not built, or the build is older than the sources it serves. */
export class NotBuilt extends Schema.TaggedError<NotBuilt>()('NotBuilt', {
  message: Schema.String,
}) {}

/** The launched preview did not answer in time, or stopped. */
export class NotReady extends Schema.TaggedError<NotReady>()('NotReady', {
  message: Schema.String,
}) {}

/** The first doctor check that failed, and what it saw. */
export class DoctorFailed extends Schema.TaggedError<DoctorFailed>()('DoctorFailed', {
  check: Schema.String,
  message: Schema.String,
}) {}

/** A journey's step saw something other than what it expects. */
export class JourneyFailed extends Schema.TaggedError<JourneyFailed>()('JourneyFailed', {
  journey: Schema.String,
  step: Schema.String,
  message: Schema.String,
  evidence: Schema.String,
}) {}

/** A command the helpers run (git, lsof, ffprobe, alchemy) failed. */
export class CommandFailed extends Schema.TaggedError<CommandFailed>()('CommandFailed', {
  command: Schema.String,
  message: Schema.String,
}) {}
