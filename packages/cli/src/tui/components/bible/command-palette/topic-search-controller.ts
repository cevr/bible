import * as AsyncData from 'foldkit/asyncData';
import { createSignal, type Accessor } from 'solid-js';
import type { ReaderReference } from '../../../../app/reader-reference.js';

export interface BibleTopicSearchState {
  /** `null` means the palette is in ordinary Bible navigation mode. */
  readonly query: string | null;
  readonly request: AsyncData.AsyncData<readonly ReaderReference[], string>;
}

export interface BibleTopicSearchController {
  readonly state: Accessor<BibleTopicSearchState>;
  readonly active: Accessor<boolean>;
  readonly typing: Accessor<boolean>;
  readonly loading: Accessor<boolean>;
  readonly error: Accessor<string | null>;
  readonly empty: Accessor<boolean>;
  readonly results: Accessor<readonly ReaderReference[]>;
  readonly update: (rawQuery: string) => void;
  readonly dispose: () => void;
}

export interface BibleTopicSearchControllerOptions {
  readonly search: ((query: string) => Promise<readonly ReaderReference[]>) | null;
  readonly debounceMs?: number;
}

const inactiveTopicSearch = (): BibleTopicSearchState => ({
  query: null,
  request: AsyncData.Idle(),
});

const topicSearchState = (
  query: string,
  request: AsyncData.AsyncData<readonly ReaderReference[], string>,
): BibleTopicSearchState => ({ query, request });

/**
 * Owns the command palette's `?topic` lifecycle, including debounce and stale
 * request suppression. Foldkit AsyncData owns the request state; the nullable
 * query separately models whether topic-search mode is active.
 */
export const createBibleTopicSearchController = (
  options: BibleTopicSearchControllerOptions,
): BibleTopicSearchController => {
  const [state, setState] = createSignal<BibleTopicSearchState>(inactiveTopicSearch());
  const debounceMs = options.debounceMs ?? 500;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;

  const cancelPending = (): number => {
    generation += 1;
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    return generation;
  };

  const update = (rawQuery: string): void => {
    const requestGeneration = cancelPending();
    const trimmed = rawQuery.trim();
    if (!trimmed.startsWith('?')) {
      setState(inactiveTopicSearch());
      return;
    }

    const query = trimmed.slice(1).trim();
    if (query.length < 3) {
      setState(topicSearchState(query, AsyncData.Idle()));
      return;
    }
    if (options.search === null) {
      setState(
        topicSearchState(query, AsyncData.fail('AI search unavailable (no API key configured)')),
      );
      return;
    }

    setState(topicSearchState(query, AsyncData.Loading()));
    timer = setTimeout(() => {
      timer = undefined;
      void options.search?.(query).then(
        (references) => {
          if (generation !== requestGeneration) return;
          setState(topicSearchState(query, AsyncData.succeed(references)));
        },
        (cause: unknown) => {
          if (generation !== requestGeneration) return;
          setState(
            topicSearchState(
              query,
              AsyncData.fail(cause instanceof Error ? cause.message : 'AI search failed'),
            ),
          );
        },
      );
    }, debounceMs);
  };

  const active = (): boolean => state().query !== null;
  const typing = (): boolean => {
    const current = state();
    return current.query !== null && current.query.length < 3 && AsyncData.isIdle(current.request);
  };
  const loading = (): boolean => AsyncData.isPending(state().request);
  const error = (): string | null => {
    const request = state().request;
    return AsyncData.isFailure(request) ? request.error : null;
  };
  const results = (): readonly ReaderReference[] =>
    AsyncData.getOrElse(state().request, () => [] as const);
  const empty = (): boolean => {
    const request = state().request;
    return AsyncData.isSuccess(request) && request.data.length === 0;
  };

  return {
    state,
    active,
    typing,
    loading,
    error,
    empty,
    results,
    update,
    dispose: () => {
      cancelPending();
      setState(inactiveTopicSearch());
    },
  };
};
