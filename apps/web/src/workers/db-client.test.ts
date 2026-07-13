import { describe, expect, test } from 'bun:test';

import { createDbClient, type DbWorkerPort } from './db-client';
import type { WorkerRequest } from './db-protocol';

class TestWorker implements DbWorkerPort {
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  readonly sent: WorkerRequest[] = [];

  postMessage(message: WorkerRequest): void {
    this.sent.push(message);
  }

  respond(data: unknown): void {
    this.onmessage?.(new MessageEvent('message', { data }));
  }
}

describe('database worker client', () => {
  test('correlates concurrent requests of the same operation', async () => {
    const worker = new TestWorker();
    const client = createDbClient(worker);
    const first = client.exportState();
    const second = client.exportState();

    expect(worker.sent).toEqual([
      { type: 'export-state', id: 1 },
      { type: 'export-state', id: 2 },
    ]);

    const firstData = new ArrayBuffer(1);
    const secondData = new ArrayBuffer(2);
    worker.respond({ type: 'export-state-result', id: 2, data: secondData });
    worker.respond({ type: 'export-state-result', id: 1, data: firstData });

    expect(await first).toBe(firstData);
    expect(await second).toBe(secondData);
  });

  test('uses the same correlation registry across different operations', async () => {
    const worker = new TestWorker();
    const client = createDbClient(worker);
    const dirty = client.isDirty();
    const topics = client.initTopics();

    worker.respond({ type: 'init-topics-complete', id: 2 });
    worker.respond({ type: 'is-dirty-result', id: 1, dirty: true });

    expect(await dirty).toBe(true);
    expect(await topics).toBeUndefined();
  });

  test('rejects every pending request after an invalid response', async () => {
    const worker = new TestWorker();
    const client = createDbClient(worker);
    const first = client.isDirty();
    const second = client.initTopics();

    worker.respond({ type: 'is-dirty-result', id: 0, dirty: true });

    const results = await Promise.allSettled([first, second]);
    for (const result of results) {
      expect(result.status).toBe('rejected');
      if (result.status === 'rejected') {
        expect(result.reason).toHaveProperty(
          'message',
          expect.stringContaining('invalid protocol message'),
        );
      }
    }
  });
});
