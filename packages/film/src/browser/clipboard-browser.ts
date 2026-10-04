// The browser's own clipboard (`clipboard.ts`): `navigator.clipboard`, a link
// resolved against the page's own address. Its refusal (a permission, an
// unfocused page, an origin that is not secure, no clipboard at all) fails
// the write in the browser's words.

import { Effect, Layer } from 'effect';
import { Clipboard, ClipboardRefused } from './clipboard.ts';

/** This page's clipboard. */
export const clipboardLayer: Layer.Layer<Clipboard> = Layer.succeed(
  Clipboard,
  Clipboard.of({
    copyLink: (href) =>
      Effect.tryPromise({
        try: () => navigator.clipboard.writeText(new URL(href, location.href).href),
        catch: (cause) => new ClipboardRefused({ reason: String(cause) }),
      }),
  }),
);
