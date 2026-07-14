import { Reference } from '@bible/core/bible';
import { describe, expect, it } from 'bun:test';
import type { ReaderReference } from '../../src/app/reader-reference.js';
import { createBibleTopicSearchController } from '../../src/tui/components/bible/command-palette/topic-search-controller.js';

const settleTimer = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

const deferred = <A>() => {
  let resolve!: (value: A) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<A>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('Bible topic Search controller', () => {
  it('owns inactive, typing, and unavailable states', () => {
    const controller = createBibleTopicSearchController({ search: null, debounceMs: 0 });

    controller.update('John');
    expect(controller.active()).toBe(false);
    expect(controller.state()).toEqual({ query: null, request: { _tag: 'Idle' } });

    controller.update('?ab');
    expect(controller.active()).toBe(true);
    expect(controller.typing()).toBe(true);
    expect(controller.state()).toEqual({ query: 'ab', request: { _tag: 'Idle' } });

    controller.update('?atonement');
    expect(controller.error()).toBe('AI search unavailable (no API key configured)');
    expect(controller.state()).toEqual({
      query: 'atonement',
      request: {
        _tag: 'Failure',
        error: 'AI search unavailable (no API key configured)',
      },
    });
    controller.dispose();
  });

  it('maps Search results and failures into exhaustive states', async () => {
    const result = Reference.verse(43, 3, 16);
    const responses = new Map<string, readonly ReaderReference[]>([
      ['love', [result]],
      ['missing', []],
    ]);
    const controller = createBibleTopicSearchController({
      search: (query) => {
        if (query === 'failure') return Promise.reject(new Error('network down'));
        return Promise.resolve(responses.get(query) ?? []);
      },
      debounceMs: 0,
    });

    controller.update('?love');
    expect(controller.loading()).toBe(true);
    expect(controller.state()).toEqual({ query: 'love', request: { _tag: 'Loading' } });
    await settleTimer();
    expect(controller.state()).toEqual({
      query: 'love',
      request: { _tag: 'Success', data: [result] },
    });
    expect(controller.results()).toEqual([result]);

    controller.update('?missing');
    await settleTimer();
    expect(controller.empty()).toBe(true);
    expect(controller.state()).toEqual({
      query: 'missing',
      request: { _tag: 'Success', data: [] },
    });

    controller.update('?failure');
    await settleTimer();
    expect(controller.state()).toEqual({
      query: 'failure',
      request: { _tag: 'Failure', error: 'network down' },
    });
    controller.dispose();
  });

  it('ignores an older Search result after a newer query starts', async () => {
    const first = deferred<readonly ReaderReference[]>();
    const second = deferred<readonly ReaderReference[]>();
    const newest = Reference.verse(45, 8, 28);
    const controller = createBibleTopicSearchController({
      search: (query) => (query === 'first' ? first.promise : second.promise),
      debounceMs: 0,
    });

    controller.update('?first');
    await settleTimer();
    controller.update('?second');
    await settleTimer();

    second.resolve([newest]);
    await Promise.resolve();
    expect(controller.state()).toEqual({
      query: 'second',
      request: { _tag: 'Success', data: [newest] },
    });

    first.resolve([]);
    await Promise.resolve();
    expect(controller.state()).toEqual({
      query: 'second',
      request: { _tag: 'Success', data: [newest] },
    });
    controller.dispose();
  });

  it('invalidates in-flight Search results when disposed', async () => {
    const pending = deferred<readonly ReaderReference[]>();
    const controller = createBibleTopicSearchController({
      search: () => pending.promise,
      debounceMs: 0,
    });

    controller.update('?grace');
    await settleTimer();
    controller.dispose();
    pending.resolve([Reference.verse(45, 3, 24)]);
    await Promise.resolve();

    expect(controller.state()).toEqual({ query: null, request: { _tag: 'Idle' } });
  });
});
