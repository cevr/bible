import { describe, expect, it } from 'bun:test';

import { makeWorkerTopicsDatabase } from './topics-database.js';
import type { DatabaseFileDownloader } from './database-file-downloader.js';
import type { SqliteDatabase, SqliteRow } from './sqlite-database.js';

const makeDatabase = (rows: readonly SqliteRow[], events: string[]): SqliteDatabase => ({
  isOpen: false,
  open: async (flags) => {
    events.push(`open:${String(flags)}`);
  },
  close: async () => {
    events.push('close');
  },
  query: async () => rows,
  write: async () => 0,
  exec: async () => {},
});

const makeDownloader = (events: string[]): DatabaseFileDownloader => ({
  download: async (url, filename, onProgress) => {
    events.push(`download:${url}:${filename}`);
    onProgress(100);
  },
});

describe('worker Topics database', () => {
  it('keeps an existing catalog open without downloading it again', async () => {
    const events: string[] = [];
    const database = makeWorkerTopicsDatabase({
      database: makeDatabase([{ cnt: 1 }], events),
      downloader: makeDownloader(events),
    });

    await database.initialize(() => {});

    expect(events).toHaveLength(1);
    expect(events[0]).toStartWith('open:');
  });

  it('replaces an empty catalog and reopens it read-only', async () => {
    const events: string[] = [];
    const progress: number[] = [];
    const database = makeWorkerTopicsDatabase({
      database: makeDatabase([{ cnt: 0 }], events),
      downloader: makeDownloader(events),
    });

    await database.initialize((value) => progress.push(value));

    expect(events[0]).toStartWith('open:');
    expect(events.slice(1, 3)).toEqual(['close', 'download:/api/db/topics:topics.db']);
    expect(events[3]).toStartWith('open:');
    expect(events[3]).not.toBe(events[0]);
    expect(progress).toEqual([0, 100]);
  });
});
