import { Effect, Option } from 'effect';
import { matchSorter } from 'match-sorter';

export const spin = Effect.fn('prelude/spin')(function* <V, E, R>(
  message: string,
  job: Effect.Effect<V, E, R>,
) {
  const start = Date.now();
  yield* Effect.logDebug(`${message}...`);
  const result = yield* job.pipe(
    Effect.tap(() => Effect.logDebug(`${message} done (${msToMinutes(Date.now() - start)})`)),
    Effect.tapError(() =>
      Effect.logError(`${message} failed (${msToMinutes(Date.now() - start)})`),
    ),
    Effect.tapDefect(() =>
      Effect.logError(`${message} failed (${msToMinutes(Date.now() - start)})`),
    ),
  );

  return result;
});

export const msToMinutes = (ms: number) => {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m:${seconds.toString().padStart(2, '0')}s`;
};

export function matchEnum<T extends Record<string, string | number>>(
  enumToParse: T,
  value: string,
) {
  const entries = Object.entries(enumToParse).map(([k, v]) => ({
    value: v as T[keyof T],
    labels: [enumToParse[k as keyof T], enumToParse[v as keyof T]],
  }));
  const matched = matchSorter(entries, value, {
    keys: ['labels'],
  })[0]?.value;
  return Option.fromNullishOr(matched);
}

export function matchArrayEnum<T extends readonly string[]>(
  allowedValues: T,
  values: string[],
): Option.Option<T[number][]> {
  const matched = values.map((v) => {
    const result = matchSorter(allowedValues as unknown as string[], v)[0];
    return result;
  });

  if (matched.some((m) => m === undefined)) {
    return Option.none();
  }
  return Option.some(matched as T[number][]);
}
