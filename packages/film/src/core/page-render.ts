// What a page's server entry is to the lab: the lab builds each page it
// renders on the server from a `*.server.tsx` entry beside its HTML entry
// (`LabPage`'s server bundle), whose default export is a `PageRender`. The
// lab runs it in a worker of the build (`PageRenderer`), hands it the URL the
// page was asked at and the page's reads of the lab's own API, and splices
// what it writes into the page's HTML: the head before `</head>`, the body's
// class on `<body>`, and the markup first in the body, where the browser's
// copy of the same components hydrates it. Types only: the server entry and
// the lab's worker both read them, and neither imports the other.

/** The request a page is rendered for. */
export interface PageRequest {
  /** The URL the page was asked at, whole, without its hash (a browser never sends it). */
  readonly url: string;
  /**
   * The page's reads of the lab's API: a GET by its path, answered in the
   * lab's process as the page's own request would be (through the gate, the
   * same handlers); any other method is refused, as a render only reads.
   */
  readonly fetch: typeof globalThis.fetch;
  /** Aborted when the page's request is gone: the render stops. */
  readonly signal: AbortSignal;
}

/** Where a render writes the page, in order: its head once, its markup, then its end or its failure. */
export interface PageSink {
  /** What the page's head holds beside the HTML entry's: the hydration script, the page's styles. */
  readonly head: (html: string) => void;
  /** The next piece of the page's markup. */
  readonly write: (html: string) => void;
  /** The markup is whole. */
  readonly end: () => void;
  /** The render failed, in its words: what it wrote is all there is. */
  readonly fail: (reason: string) => void;
}

/** A page's server entry's default export: how the lab renders the page. */
export interface PageRender {
  /** The class the page's body carries (its styles are scoped to it), there before the first paint. */
  readonly bodyClass: string;
  /** Render the page `request` asks for into `sink`. */
  readonly render: (request: PageRequest, sink: PageSink) => void;
}

/** The attribute a server-rendered page's root carries: where the browser's copy hydrates. */
export const PAGE_ROOT = 'data-page-root';
