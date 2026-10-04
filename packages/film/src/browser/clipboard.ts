// The page's clipboard: where Copy link puts a link. The pages' hrefs are
// paths (`@bible/url-state` keeps no origin), so the link is written whole,
// resolved against the page's own origin, and pastes anywhere. A write the
// browser refuses (no permission, the page not focused, an origin that is
// not secure) fails with `ClipboardRefused`, in the browser's words, so the
// receipt says why. The live adapter is `clipboard-browser.ts`; a test
// reads what was written from `Clipboard.memory`.

import { Context, Data, Effect, Layer } from 'effect';

/** The browser would not take the text. */
export class ClipboardRefused extends Data.TaggedError('ClipboardRefused')<{
  readonly reason: string;
}> {}

interface ClipboardOps {
  /** Put the link to `href` (a path of this site, `/films/a/lab/b?cue=c#t=1`) on the clipboard, whole. */
  readonly copyLink: (href: string) => Effect.Effect<void, ClipboardRefused>;
}

export class Clipboard extends Context.Service<Clipboard, ClipboardOps>()(
  '@bible/film/browser/Clipboard',
) {
  /** A clipboard in memory at `origin`: each link written is pushed onto `written`. */
  static readonly memory = (written: Array<string>, origin: string): Layer.Layer<Clipboard> =>
    Layer.succeed(
      Clipboard,
      Clipboard.of({
        copyLink: (href) =>
          Effect.sync(() => {
            written.push(new URL(href, origin).href);
          }),
      }),
    );
}
