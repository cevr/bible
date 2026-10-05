// What the lab and a build's render worker say to each other
// (`page-render.ts`, `page-render-worker.ts`): the lab asks for a page at a
// URL, the worker answers its head, its markup piece by piece and its end;
// a read the render makes of the lab's API goes to the lab, and its answer
// comes back. Each message names its render (`id`), so one worker renders
// any number of pages at once. Plain values, as a worker's messages are
// copied.

import { Data } from 'effect';

/** What the lab sends a render worker. */
export type ToRender = Data.TaggedEnum<{
  /** Render the page whose server entry is `module` (a path in the worker's build) at `url`. */
  Render: { readonly id: number; readonly module: string; readonly url: string };
  /** The page's request is gone: stop rendering it. */
  Cancel: { readonly id: number };
  /** The answer to the render's read `read`. */
  Answer: {
    readonly read: number;
    readonly status: number;
    readonly headers: ReadonlyArray<readonly [string, string]>;
    readonly body: Uint8Array;
  };
}>;

export const ToRender = Data.taggedEnum<ToRender>();

/** What a render worker sends the lab. */
export type FromRender = Data.TaggedEnum<{
  /** The page's head and its body's class: always a render's first message, or `Failed`. */
  Head: { readonly id: number; readonly html: string; readonly bodyClass: string };
  /** The next piece of the page's markup. */
  Chunk: { readonly id: number; readonly html: string };
  /** The page's markup is whole. */
  End: { readonly id: number };
  /** The render failed, in its words. */
  Failed: { readonly id: number; readonly reason: string };
  /** The render reads `path` of the lab's API (a GET): answered by `Answer` with the same `read`. */
  Read: { readonly id: number; readonly read: number; readonly path: string };
  /** The render, going on, gave up its read `read` (its fetch's signal aborted): the lab stops answering it. */
  ReadCancelled: { readonly id: number; readonly read: number };
}>;

export const FromRender = Data.taggedEnum<FromRender>();
