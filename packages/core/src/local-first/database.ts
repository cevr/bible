import { Context, Effect, Option, Predicate, Schema } from 'effect';

export class UserDatabaseError extends Schema.TaggedError<UserDatabaseError>()(
  'UserDatabaseError',
  {
    operation: Schema.Literals(['run', 'all', 'get', 'transaction']),
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export interface DrizzleOperation<A> {
  readonly execute: () => PromiseLike<A> | A;
}

export interface SqliteTransaction {
  readonly run: <A>(operation: DrizzleOperation<A>) => PromiseLike<A> | A;
  readonly all: <A>(
    operation: DrizzleOperation<ReadonlyArray<A>>,
  ) => PromiseLike<ReadonlyArray<A>> | ReadonlyArray<A>;
  readonly get: <A>(operation: DrizzleOperation<A>) => PromiseLike<A> | A;
}

export interface SqliteEffectBridgeService {
  readonly run: <A>(operation: DrizzleOperation<A>) => Effect.Effect<A, UserDatabaseError>;
  readonly all: <A>(
    operation: DrizzleOperation<ReadonlyArray<A>>,
  ) => Effect.Effect<ReadonlyArray<A>, UserDatabaseError>;
  readonly get: <A>(
    operation: DrizzleOperation<A>,
  ) => Effect.Effect<Option.Option<NonNullable<A>>, UserDatabaseError>;
  readonly transaction: <A>(
    operation: (transaction: SqliteTransaction) => PromiseLike<A> | A,
  ) => Effect.Effect<A, UserDatabaseError>;
}

export class SqliteEffectBridge extends Context.Service<
  SqliteEffectBridge,
  SqliteEffectBridgeService
>()('@bible/core/local-first/SqliteEffectBridge') {}

export interface SqliteBridgeAdapter {
  readonly run: <A>(operation: DrizzleOperation<A>) => PromiseLike<A> | A;
  readonly all: <A>(
    operation: DrizzleOperation<ReadonlyArray<A>>,
  ) => PromiseLike<ReadonlyArray<A>> | ReadonlyArray<A>;
  readonly get: <A>(operation: DrizzleOperation<A>) => PromiseLike<A> | A;
  readonly transaction: <A>(
    operation: (transaction: SqliteTransaction) => PromiseLike<A> | A,
  ) => PromiseLike<A> | A;
}

const messageOf = (cause: unknown): string => {
  if (cause instanceof Error) return cause.message;
  return String(cause);
};

const isPromiseLike = <A>(value: A | PromiseLike<A>): value is PromiseLike<A> =>
  Predicate.isPromiseLike(value);

const adapt = <A>(
  operation: UserDatabaseError['operation'],
  evaluate: () => PromiseLike<A> | A,
): Effect.Effect<A, UserDatabaseError> => {
  const failure = (cause: unknown) =>
    UserDatabaseError.make({ operation, message: messageOf(cause), cause });
  return Effect.try({ try: evaluate, catch: failure }).pipe(
    Effect.flatMap((result) => {
      if (!isPromiseLike(result)) return Effect.succeed(result);
      return Effect.tryPromise({ try: () => result, catch: failure });
    }),
  );
};

export const makeSqliteEffectBridge = (
  adapter: SqliteBridgeAdapter,
): SqliteEffectBridgeService => ({
  run: (operation) => adapt('run', () => adapter.run(operation)),
  all: (operation) => adapt('all', () => adapter.all(operation)),
  get: (operation) =>
    adapt('get', () => adapter.get(operation)).pipe(Effect.map(Option.fromNullishOr)),
  transaction: (operation) => adapt('transaction', () => adapter.transaction(operation)),
});
