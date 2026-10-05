// The browser's own clipboard (`clipboard.ts`): `navigator.clipboard`, a link
// resolved as the page resolves its own links (against `document.baseURI`,
// never the address bar's `location`, which is `Location`'s). Its refusal (a
// permission, an unfocused page, an origin that is not secure, no clipboard
// at all) fails the write in the browser's words.

import { Effect, Layer } from 'effect';
import { Clipboard, ClipboardRefused } from './clipboard.ts';

/** This page's clipboard. */
export const clipboardLayer: Layer.Layer<Clipboard> = Layer.succeed(
  Clipboard,
  Clipboard.of({
    copyLink: (href) =>
      Effect.tryPromise({
        try: () => navigator.clipboard.writeText(new URL(href, document.baseURI).href),
        catch: (cause) => new ClipboardRefused({ reason: String(cause) }),
      }),
  }),
);
