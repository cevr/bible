/**
 * The ways a `sim.ts` command fails, each a tagged error the command prints
 * as its JSON result (`result.ts`) before it exits non-zero.
 */
import { Schema } from 'effect';

/** No `boot` ran, or `down` closed the drive: there is nothing to drive. */
export class NoSession extends Schema.TaggedError<NoSession>()('NoSession', {
  file: Schema.String,
}) {
  override get message() {
    return `no drive is booted (no ${this.file}); run sim boot first`;
  }
}

/** The drive's simulator is not booted, or no longer exists. */
export class SimulatorDown extends Schema.TaggedError<SimulatorDown>()('SimulatorDown', {
  name: Schema.String,
  state: Schema.String,
}) {
  override get message() {
    return `simulator ${this.name} is ${this.state}, not Booted; run sim boot`;
  }
}

/** A wait for something to become ready ran out. */
export class ReadinessTimedOut extends Schema.TaggedError<ReadinessTimedOut>()(
  'ReadinessTimedOut',
  { what: Schema.String, seconds: Schema.Finite },
) {
  override get message() {
    return `${this.what} was not ready after ${this.seconds} s`;
  }
}

/** No element on screen answers the target. */
export class TargetMissing extends Schema.TaggedError<TargetMissing>()('TargetMissing', {
  target: Schema.String,
  platform: Schema.String,
  /** What the driver said when its wait or scroll ran out. */
  driver: Schema.String,
}) {
  override get message() {
    return `no element ${this.target} on the ${this.platform} screen (${this.driver})`;
  }
}

/** A tool the command runs is not installed. */
export class ToolMissing extends Schema.TaggedError<ToolMissing>()('ToolMissing', {
  tool: Schema.String,
}) {
  override get message() {
    return `${this.tool} is not installed`;
  }
}

/** A tool ran and exited non-zero, or did not finish in its time. */
export class ToolFailed extends Schema.TaggedError<ToolFailed>()('ToolFailed', {
  tool: Schema.String,
  args: Schema.Array(Schema.String),
  exitCode: Schema.Finite,
  output: Schema.String,
}) {
  override get message() {
    return `${this.tool} ${this.args.join(' ')} exited ${this.exitCode}: ${this.output}`;
  }
}

/** The command does not apply to the drive's platform. */
export class NotOnPlatform extends Schema.TaggedError<NotOnPlatform>()('NotOnPlatform', {
  command: Schema.String,
  platform: Schema.String,
}) {
  override get message() {
    return `sim ${this.command} does not run on ${this.platform}`;
  }
}

/** A file the drive reads or writes failed on the host (`PlatformError`). */
export class HostFailed extends Schema.TaggedError<HostFailed>()('HostFailed', {
  reason: Schema.String,
}) {
  override get message() {
    return this.reason;
  }
}

/** The arguments did not parse: an unknown command or flag, a bad or missing value. */
export class BadArguments extends Schema.TaggedError<BadArguments>()('BadArguments', {
  /** The command path the parser reached, as `sim tap`. */
  command: Schema.String,
  /** Each problem the parser found, in its words. */
  problems: Schema.Array(Schema.String),
}) {
  override get message() {
    return `${this.command}: ${this.problems.join('; ')} (run ${this.command} --help)`;
  }
}

/** A read-only check of the booted drive failed (`sim doctor`): which, and why. */
export class Unhealthy extends Schema.TaggedError<Unhealthy>()('Unhealthy', {
  check: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.check}: ${this.reason}`;
  }
}

/** Any failure a command reports. */
export const SimError = Schema.Union([
  NoSession,
  SimulatorDown,
  ReadinessTimedOut,
  TargetMissing,
  ToolMissing,
  ToolFailed,
  NotOnPlatform,
  HostFailed,
  BadArguments,
  Unhealthy,
]);
export type SimError = typeof SimError.Type;
