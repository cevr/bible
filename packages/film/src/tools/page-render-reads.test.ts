// A render's reads of the lab, in its worker: a GET sent as a `Read` and
// resolved by its answer; a read held when its render is over (ended,
// failed or cancelled) is aborted and dropped, as is one whose fetch's own
// signal aborts; an answer to a dropped read is no one's; any other method is
// refused.

import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';
import { type FromRender, ToRender } from './page-render-protocol.ts';
import { renderReads } from './page-render-reads.ts';

const LAB = 'http://127.0.0.1:8229';

/** The bridge, and every message it sent. */
const bridge = () => {
  const sent: Array<FromRender> = [];
  return { sent, reads: renderReads((message) => sent.push(message)) };
};

/** The answer to read `read`: `text`, a 200. */
const answerOf = (read: number, text: string) =>
  ToRender.Answer({ read, status: 200, headers: [], body: new TextEncoder().encode(text) });

/** How a fetch settled: its body's text, or its error as a string. */
const settled = (fetched: Promise<Response>) =>
  Effect.promise(() =>
    fetched.then(
      (response) => response.text(),
      (error: unknown) => String(error),
    ),
  );

describe("a render's reads", () => {
  it.live('sends a GET as a read of its path, and resolves it with the answer', () =>
    Effect.gen(function* () {
      const { sent, reads } = bridge();
      const got = reads.open(1)(`${LAB}/api/films?x=1`);
      expect(sent).toEqual([
        expect.objectContaining({ _tag: 'Read', id: 1, read: 1, path: '/api/films?x=1' }),
      ]);
      expect(reads.held(1)).toBe(1);
      yield* reads.answer(answerOf(1, 'the films'));
      expect(yield* settled(got)).toBe('the films');
      expect(reads.held(1)).toBe(0);
    }),
  );

  it.live('aborts and drops a read held when its render is over; its late answer is no one’s', () =>
    Effect.gen(function* () {
      const { reads } = bridge();
      const held = reads.open(1)(`${LAB}/api/held`);
      const other = reads.open(2)(`${LAB}/api/other`);
      reads.close(1);
      expect(yield* settled(held)).toContain('AbortError');
      expect(reads.held(1)).toBe(0);
      yield* reads.answer(answerOf(1, 'late'));
      expect(reads.held(2)).toBe(1);
      yield* reads.answer(answerOf(2, 'still read'));
      expect(yield* settled(other)).toBe('still read');
    }),
  );

  it.live("aborts and drops a read whose fetch's own signal aborts", () =>
    Effect.gen(function* () {
      const { sent, reads } = bridge();
      const giving = new AbortController();
      const held = reads.open(1)(`${LAB}/api/held`, { signal: giving.signal });
      giving.abort();
      expect(yield* settled(held)).toContain('AbortError');
      expect(reads.held(1)).toBe(0);
      // The lab hears it, and stops answering it.
      expect(sent).toEqual([
        expect.objectContaining({ _tag: 'Read', id: 1, read: 1 }),
        expect.objectContaining({ _tag: 'ReadCancelled', id: 1, read: 1 }),
      ]);
    }),
  );

  it.live('refuses a read of a render that is over, and any method but GET', () =>
    Effect.gen(function* () {
      const { sent, reads } = bridge();
      const fetch = reads.open(1);
      const posted = fetch(`${LAB}/api/notes`, { method: 'POST', body: '{}' });
      expect(yield* settled(posted)).toContain('only reads');
      reads.close(1);
      expect(yield* settled(fetch(`${LAB}/api/films`))).toContain('AbortError');
      expect(sent).toEqual([]);
    }),
  );
});
