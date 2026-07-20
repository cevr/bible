import { Context, Effect, Schema } from 'effect';

export class UserDatabaseError extends Schema.TaggedErrorClass<UserDatabaseError>()(
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
  readonly get: <A>(
    operation: DrizzleOperation<A | undefined>,
  ) => PromiseLike<A | undefined> | A | undefined;
}

export interface SqliteEffectBridgeShape {
  readonly run: <A>(operation: DrizzleOperation<A>) => Effect.Effect<A, UserDatabaseError>;
  readonly all: <A>(
    operation: DrizzleOperation<ReadonlyArray<A>>,
  ) => Effect.Effect<ReadonlyArray<A>, UserDatabaseError>;
  readonly get: <A>(
    operation: DrizzleOperation<A | undefined>,
  ) => Effect.Effect<A | undefined, UserDatabaseError>;
  readonly transaction: <A>(
    operation: (transaction: SqliteTransaction) => PromiseLike<A> | A,
  ) => Effect.Effect<A, UserDatabaseError>;
}

export class SqliteEffectBridge extends Context.Service<
  SqliteEffectBridge,
  SqliteEffectBridgeShape
>()('@bible/core/local-first/SqliteEffectBridge') {}

export interface SqliteBridgeAdapter {
  readonly run: <A>(operation: DrizzleOperation<A>) => PromiseLike<A> | A;
  readonly all: <A>(
    operation: DrizzleOperation<ReadonlyArray<A>>,
  ) => PromiseLike<ReadonlyArray<A>> | ReadonlyArray<A>;
  readonly get: <A>(
    operation: DrizzleOperation<A | undefined>,
  ) => PromiseLike<A | undefined> | A | undefined;
  readonly transaction: <A>(
    operation: (transaction: SqliteTransaction) => PromiseLike<A> | A,
  ) => PromiseLike<A> | A;
}

const messageOf = (cause: unknown): string => {
  if (cause instanceof Error) return cause.message;
  return String(cause);
};

const isPromiseLike = <A>(value: A | PromiseLike<A>): value is PromiseLike<A> =>
  typeof value === 'object' &&
  value !== null &&
  'then' in value &&
  typeof value.then === 'function';

const adapt = <A>(
  operation: UserDatabaseError['operation'],
  evaluate: () => PromiseLike<A> | A,
): Effect.Effect<A, UserDatabaseError> => {
  const failure = (cause: unknown) =>
    new UserDatabaseError({ operation, message: messageOf(cause), cause });
  return Effect.try({ try: evaluate, catch: failure }).pipe(
    Effect.flatMap((result) => {
      if (!isPromiseLike(result)) return Effect.succeed(result);
      return Effect.tryPromise({ try: () => result, catch: failure });
    }),
  );
};

export const makeSqliteEffectBridge = (adapter: SqliteBridgeAdapter): SqliteEffectBridgeShape => ({
  run: (operation) => adapt('run', () => adapter.run(operation)),
  all: (operation) => adapt('all', () => adapter.all(operation)),
  get: (operation) => adapt('get', () => adapter.get(operation)),
  transaction: (operation) => adapt('transaction', () => adapter.transaction(operation)),
});
