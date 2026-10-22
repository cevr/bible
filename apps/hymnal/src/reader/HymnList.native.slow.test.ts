/* oxlint-disable effect/noGlobals -- the test runs a Bun script in a process of its own, so its React Native stand-in never reaches the other tests. */

/**
 * The phones' hymn list keeps its rows on screen and reuses their views, so
 * a value a row reads from outside its item reaches the rows only if the
 * list is told. Each case changes one such value while the list is mounted
 * (`src/test/phone-list.tsx`) and holds the rows on screen to what a list
 * mounted under the new value draws.
 */

import { describe, expect, it } from 'bun:test';

interface Rows {
  readonly hymns: Readonly<
    Record<string, { readonly href: string; readonly colour: string; readonly height: string }>
  >;
  readonly topics: Readonly<Record<string, { readonly height: string }>>;
}

interface Seen {
  readonly before: Rows;
  readonly live: Rows;
  readonly fresh: Rows;
}

type Change = 'scheme' | 'fontScale' | 'hrefOf';

const run = Bun.spawnSync(['bun', Bun.resolveSync('../test/phone-list.tsx', import.meta.dir)], {
  stderr: 'pipe',
});
const seen: Partial<Record<Change, Seen>> = JSON.parse(run.stdout.toString() || '{}');

/** The rows of `kind` on screen both live and fresh, by label, as each draws them. */
const shared = (rows: Seen, kind: keyof Rows) => {
  const labels = Object.keys(rows.live[kind]).filter((label) => label in rows.fresh[kind]);
  return {
    labels,
    before: labels.map((label) => rows.before[kind][label]),
    live: labels.map((label) => rows.live[kind][label]),
    fresh: labels.map((label) => rows.fresh[kind][label]),
  };
};

const empty: Rows = { hymns: {}, topics: {} };

describe('the phones’ hymn list, changed while mounted', () => {
  it('mounts and changes with nothing on its error stream', () => {
    expect(run.stderr.toString()).toBe('');
    expect(Object.keys(seen)).toEqual(['scheme', 'fontScale', 'hrefOf']);
  });

  it.each<Change>(['scheme', 'fontScale', 'hrefOf'])(
    'draws its rows on screen after a change of %s as a list mounted under it does',
    (change) => {
      const rows = seen[change] ?? { before: empty, live: empty, fresh: empty };
      const hymns = shared(rows, 'hymns');
      const topics = shared(rows, 'topics');
      expect(hymns.labels.length).toBeGreaterThan(10);
      expect(topics.labels.length).toBeGreaterThan(0);
      expect(hymns.live).toEqual(hymns.fresh);
      expect(topics.live).toEqual(topics.fresh);
      // The change shows: no hymn row on screen still draws as it did before
      // it (a topic row reads only its height).
      expect(hymns.live.filter((row, i) => Bun.deepEquals(row, hymns.before[i]))).toEqual([]);
    },
  );
});
