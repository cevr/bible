import { Clock, Config, Effect, Exit, Inspectable, Option, Schema, SchemaGetter } from 'effect';

interface TraceEntry {
  readonly label: string;
  readonly timestampMs: number;
  readonly durationMs?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

const enabled = Config.boolean('TRACE').pipe(
  Config.withDefault(false),
  Effect.catch(() => Effect.succeed(false)),
);
const entries: TraceEntry[] = [];
let startTime: number | undefined;

const JsonString = Schema.Unknown.pipe(
  Schema.encodeTo(Schema.String, {
    decode: SchemaGetter.parseJson(),
    encode: SchemaGetter.stringifyJson({ space: 2 }),
  }),
);

const encodeJson = Schema.encodeUnknownEffect(JsonString);

const elapsed = Effect.gen(function* () {
  const current = yield* Clock.currentTimeMillis;
  if (startTime === undefined) {
    startTime = current;
  }
  return current - startTime;
});

export const trace = Effect.fn('cli.trace')(function* (
  label: string,
  metadata?: Readonly<Record<string, unknown>>,
) {
  if (!(yield* enabled)) {
    return;
  }
  const timestampMs = yield* elapsed;
  entries.push({ label, timestampMs, metadata });
  let metadataText = '';
  if (metadata !== undefined) {
    metadataText = ` metadata=${Inspectable.toStringUnknown(metadata, 0)}`;
  }
  yield* Effect.logInfo(
    `cli.trace label=${label} timestampMs=${timestampMs.toFixed(2)}${metadataText}`,
  );
});

export const traceEffect = <A, E, R>(
  label: string,
  effect: Effect.Effect<A, E, R>,
  metadata?: Readonly<Record<string, unknown>>,
): Effect.Effect<A, E | Config.ConfigError, R> =>
  Effect.gen(function* () {
    if (!(yield* enabled)) {
      return yield* effect;
    }
    const timestampMs = yield* elapsed;
    return yield* effect.pipe(
      Effect.onExit((exit) =>
        Effect.gen(function* () {
          const endMs = yield* elapsed;
          const durationMs = endMs - timestampMs;
          let entryMetadata = metadata;
          if (Exit.isFailure(exit)) {
            entryMetadata = { ...metadata, error: true };
          }
          entries.push({
            label,
            timestampMs,
            durationMs,
            metadata: entryMetadata,
          });
          yield* Effect.logInfo(
            `cli.trace.span label=${label} timestampMs=${timestampMs.toFixed(2)} durationMs=${durationMs.toFixed(2)} success=${Exit.isSuccess(exit)}`,
          );
        }),
      ),
    );
  });

export const printSummary = Effect.gen(function* () {
  if (!(yield* enabled) || entries.length === 0) {
    return;
  }
  const totalMs = yield* elapsed;
  const withDuration = entries.filter((entry) => entry.durationMs !== undefined);
  const slowest = [...withDuration].sort((left, right) => {
    const leftDuration = Option.getOrElse(Option.fromNullishOr(left.durationMs), () => 0);
    const rightDuration = Option.getOrElse(Option.fromNullishOr(right.durationMs), () => 0);
    return rightDuration - leftDuration;
  });
  yield* Effect.logInfo(
    `cli.trace.summary totalMs=${totalMs.toFixed(2)} entries=${entries.length} slowest=${Inspectable.toStringUnknown(slowest.slice(0, 10), 0)}`,
  );
});

export const getTraceJson = Effect.gen(function* () {
  const totalMs = yield* elapsed;
  return yield* encodeJson({ totalMs, entries });
});

export const isEnabled = enabled;

export const clear = Effect.sync(() => {
  entries.length = 0;
  startTime = undefined;
});
