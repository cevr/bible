import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const read = (relativePath: string): Promise<string> =>
  readFile(new URL(relativePath, import.meta.url), 'utf-8');

const matches = (source: string, pattern: RegExp): readonly string[] =>
  Array.from(source.matchAll(pattern), (match) => match[1]).filter(
    (channel): channel is string => channel !== undefined,
  );

const sortedUnique = (channels: readonly string[]): readonly string[] =>
  Array.from(new Set(channels)).sort();

describe('Electron IPC invoke contract', () => {
  it('covers every preload invocation and main registration exactly once', async () => {
    const [contract, preload, main, bible, egw, storage] = await Promise.all([
      read('../electron/ipc-contract.ts'),
      read('../electron/preload.ts'),
      read('../electron/main.ts'),
      read('../electron/ipc/bible-handlers.ts'),
      read('../electron/ipc/egw-handlers.ts'),
      read('../electron/ipc/storage-handlers.ts'),
    ]);

    const declared = matches(contract, /^  readonly '([^']+)': Invoke</gm);
    const invoked = matches(preload, /\binvoke\(\s*'([^']+)'/g);
    const handled = matches([main, bible, egw, storage].join('\n'), /\bhandleIpc\(\s*'([^']+)'/g);

    expect(invoked).toHaveLength(declared.length);
    expect(handled).toHaveLength(declared.length);
    expect(sortedUnique(invoked)).toEqual(sortedUnique(declared));
    expect(sortedUnique(handled)).toEqual(sortedUnique(declared));
  });

  it('keeps raw Electron invoke and handle calls inside their typed adapters', async () => {
    const [preload, handle, main, bible, egw, storage] = await Promise.all([
      read('../electron/preload.ts'),
      read('../electron/ipc/handle.ts'),
      read('../electron/main.ts'),
      read('../electron/ipc/bible-handlers.ts'),
      read('../electron/ipc/egw-handlers.ts'),
      read('../electron/ipc/storage-handlers.ts'),
    ]);

    expect(preload.match(/ipcRenderer\.invoke/g)).toHaveLength(1);
    expect(handle.match(/ipcMain\.handle\(/g)).toHaveLength(1);
    expect(handle).toContain('ipcMain.handle(channel, handler)');
    expect([main, bible, egw, storage].join('\n')).not.toMatch(/ipcMain\.handle\(/);
  });
});
