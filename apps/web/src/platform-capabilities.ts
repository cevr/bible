import { CapabilityError, type AppCapabilities } from '@bible/app/platform';
import { Effect } from 'effect';

const failure = (operation: string, cause: unknown) => {
  let capability: 'file-import' | 'file-export' = 'file-export';
  if (operation.startsWith('import')) capability = 'file-import';
  let message = String(cause);
  if (cause instanceof Error) message = cause.message;
  return new CapabilityError({
    capability,
    operation,
    message,
  });
};

export const webCapabilities: AppCapabilities = {
  fileImport: {
    select: ({ accept }) =>
      Effect.callback<
        readonly { readonly name: string; readonly contents: Uint8Array }[],
        CapabilityError
      >((resume) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept.join(',');
        const cancelled = () => resume(Effect.succeed([]));
        const changed = () => {
          const file = input.files?.[0];
          if (file === undefined) {
            resume(Effect.succeed([]));
            return;
          }
          resume(
            Effect.tryPromise({
              try: () => file.arrayBuffer(),
              catch: (cause) => failure('import.select', cause),
            }).pipe(
              Effect.map((buffer) => [{ name: file.name, contents: new Uint8Array(buffer) }]),
            ),
          );
        };
        input.addEventListener('cancel', cancelled, { once: true });
        input.addEventListener('change', changed, { once: true });
        input.click();
        return Effect.sync(() => {
          input.removeEventListener('cancel', cancelled);
          input.removeEventListener('change', changed);
        });
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
