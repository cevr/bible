import { CapabilityError, type AppCapabilities } from '@bible/app/platform';
import { Effect } from 'effect';

const failure = (operation: string, cause: unknown) =>
  new CapabilityError({
    capability: operation.startsWith('import') ? 'file-import' : 'file-export',
    operation,
    message: cause instanceof Error ? cause.message : String(cause),
  });

export const webCapabilities: AppCapabilities = {
  fileImport: {
    select: ({ accept }) =>
      Effect.tryPromise({
        try: () =>
          new Promise<readonly { readonly name: string; readonly contents: Uint8Array }[]>(
            (resolve, reject) => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = accept.join(',');
              input.addEventListener('cancel', () => resolve([]), { once: true });
              input.addEventListener(
                'change',
                () => {
                  const file = input.files?.[0];
                  if (file === undefined) {
                    resolve([]);
                    return;
                  }
                  void file
                    .arrayBuffer()
                    .then(
                      (buffer) => resolve([{ name: file.name, contents: new Uint8Array(buffer) }]),
                      reject,
                    );
                },
                { once: true },
              );
              input.click();
            },
          ),
        catch: (cause) => failure('import.select', cause),
      }),
  },
  fileExport: {
    save: ({ suggestedName, contents }) =>
      Effect.try({
        try: () => {
          const blob = new Blob([Uint8Array.from(contents).buffer], {
            type: 'application/json',
          });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = suggestedName;
          link.click();
          URL.revokeObjectURL(url);
        },
        catch: (cause) => failure('export.save', cause),
      }),
  },
};
