import { createSignal, type Accessor } from 'solid-js';
import type { ReaderReference } from '../../../../app/reader-reference.js';
import { AiSearchState, type AiSearchState as TopicSearchState } from '../../../types/ai-search.js';

export interface BibleTopicSearchController {
  readonly state: Accessor<TopicSearchState>;
  readonly active: Accessor<boolean>;
  readonly results: Accessor<readonly ReaderReference[]>;
  readonly update: (rawQuery: string) => void;
  readonly dispose: () => void;
}

export interface BibleTopicSearchControllerOptions {
  readonly search: ((query: string) => Promise<readonly ReaderReference[]>) | null;
  readonly debounceMs?: number;
}

/**
 * Owns the command palette's `?topic` lifecycle, including debounce and stale
 * request suppression. The caller supplies the external Search adapter; the
 * controller owns every in-process state transition.
 */
export const createBibleTopicSearchController = (
  options: BibleTopicSearchControllerOptions,
): BibleTopicSearchController => {
  const [state, setState] = createSignal<TopicSearchState>(AiSearchState.idle());
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
      setState(AiSearchState.idle());
      return;
    }

    const query = trimmed.slice(1).trim();
    if (query.length < 3) {
      setState(AiSearchState.typing(query));
      return;
    }
    if (options.search === null) {
      setState(AiSearchState.error(query, 'AI search unavailable (no API key configured)'));
      return;
    }

    setState(AiSearchState.loading(query));
    timer = setTimeout(() => {
      timer = undefined;
      void options.search?.(query).then(
        (references) => {
          if (generation !== requestGeneration) return;
          setState(
            references.length === 0
              ? AiSearchState.empty(query)
              : AiSearchState.success(query, references),
          );
        },
        (cause: unknown) => {
          if (generation !== requestGeneration) return;
          setState(
            AiSearchState.error(query, cause instanceof Error ? cause.message : 'AI search failed'),
          );
        },
      );
    }, debounceMs);
  };

  const active = (): boolean => state()._tag !== 'idle';
  const results = (): readonly ReaderReference[] => {
    const current = state();
    return current._tag === 'success' ? current.results : [];
  };

  return {
    state,
    active,
    results,
    update,
    dispose: () => {
      cancelPending();
      setState(AiSearchState.idle());
    },
  };
};
