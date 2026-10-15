// What a fixture reports to its test: lines pushed to `window.__log`, read by
// the harness's `logOf`, and the URL params the test opened the page with.
// It loads on the server too (a hydrated fixture's server render), where it
// keeps the lines on `globalThis` and reads no params.
const store = globalThis as unknown as { __log: Array<string> };
store.__log = [];

export const log = (line: string): void => {
  store.__log.push(line);
};

/** A URL param the test passed in `open(…, { query })`. */
export const param = (name: string): string | null =>
  new URLSearchParams(window.location.search).get(name);
