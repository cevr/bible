export interface DatabaseFileDownloader {
  readonly download: (
    url: string,
    filename: string,
    onProgress: (progress: number) => void,
  ) => Promise<void>;
}

interface DatabaseFileWriter {
  readonly write: (data: Uint8Array) => Promise<void>;
  readonly close: () => Promise<void>;
  readonly abort: (reason?: unknown) => Promise<void>;
}

interface DatabaseFileHandle {
  readonly createWritable: () => Promise<DatabaseFileWriter>;
}

export interface DatabaseFileDirectory {
  readonly getFileHandle: (
    filename: string,
    options: { readonly create: true },
  ) => Promise<DatabaseFileHandle>;
}

/** Replace one OPFS database file from a streamed HTTP response. */
export const makeDatabaseFileDownloader = (options?: {
  readonly fetch?: (url: string) => Promise<Response>;
  readonly getStorageRoot?: () => Promise<DatabaseFileDirectory>;
}): DatabaseFileDownloader => {
  const fetchResponse = options?.fetch ?? globalThis.fetch;
  const getStorageRoot = options?.getStorageRoot ?? (() => navigator.storage.getDirectory());

  const download = async (
    url: string,
    filename: string,
    onProgress: (progress: number) => void,
  ): Promise<void> => {
    const response = await fetchResponse(url);
    if (!response.ok) throw new Error(`Failed to download ${filename}: ${response.statusText}`);
    if (response.body === null) throw new Error(`No response body for ${filename} download`);

    const contentLength = Number(response.headers.get('Content-Length') ?? 0);
    const root = await getStorageRoot();
    const fileHandle = await root.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    const reader = response.body.getReader();
    let received = 0;

    try {
      // eslint-disable-next-line no-constant-condition -- stream termination is signaled by done
      while (true) {
        // eslint-disable-next-line no-await-in-loop -- response chunks must be written in order
        const { done, value } = await reader.read();
        if (done) break;
        // eslint-disable-next-line no-await-in-loop -- OPFS writes must preserve response order
        await writable.write(value);
        received += value.byteLength;
        if (contentLength > 0) {
          onProgress(Math.round((received / contentLength) * 100));
        }
      }
      await writable.close();
    } catch (error) {
      await writable.abort(error);
      throw error;
    }
  };

  return { download };
};
