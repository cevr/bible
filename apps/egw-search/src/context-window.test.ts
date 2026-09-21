import { describe, expect, test } from 'bun:test';

import { contextSide } from './context-window.js';

/** A context paragraph, named so a failure says which one leaked. */
const para = (id: string, isHeading = false) => ({ id, isHeading });

const ids = (rows: readonly { readonly id: string }[]): readonly string[] =>
  rows.map((row) => row.id);

describe('contextSide', () => {
  test('shows one neighbour and offers the rest', () => {
    const side = contextSide([para('p1'), para('p2'), para('p3')], false, 1);
    expect(ids(side.shown)).toEqual(['p1']);
    expect(side.more).toBe(2);
  });

  test('reveals everything available once expanded, and stops offering', () => {
    const side = contextSide([para('p1'), para('p2'), para('p3')], true, 1);
    expect(ids(side.shown)).toEqual(['p1', 'p2', 'p3']);
    expect(side.more).toBe(0);
  });

  // The rule this module exists for. `book_id` bounds the server's window, so
  // context can never cross into another book — but a book is many chapters,
  // and the paragraphs past a heading are about something else.
  test('stops after a chapter heading rather than reading into the next one', () => {
    const rows = [para('p1'), para('The Loud Cry', true), para('next-chapter')];
    const expanded = contextSide(rows, true, 1);
    expect(ids(expanded.shown)).toEqual(['p1', 'The Loud Cry']);
    expect(expanded.more).toBe(0);
  });

  // The heading is orientation: it names the chapter the hit sits under. The
  // cut is *after* it, which is what separates this from dropping it.
  test('keeps the heading itself when it is the nearest neighbour', () => {
    const side = contextSide([para('The Loud Cry', true), para('next')], true, 1);
    expect(ids(side.shown)).toEqual(['The Loud Cry']);
  });

  // `more` counts what is reachable, not what was fetched. Offering "2 more"
  // and then revealing one is a worse promise than offering nothing.
  test('counts only reachable paragraphs, so the control never over-promises', () => {
    const rows = [para('p1'), para('heading', true), para('unreachable')];
    const collapsed = contextSide(rows, false, 1);
    expect(ids(collapsed.shown)).toEqual(['p1']);
    expect(collapsed.more).toBe(1);
    // And expanding delivers exactly what was promised.
    const expanded = contextSide(rows, true, 1);
    expect(expanded.shown.length).toBe(collapsed.shown.length + collapsed.more);
  });

  test('offers no control when a heading sits immediately beside the match', () => {
    const side = contextSide([para('heading', true), para('unreachable')], false, 1);
    expect(ids(side.shown)).toEqual(['heading']);
    expect(side.more).toBe(0);
  });

  test('handles an empty side without offering a control', () => {
    const side = contextSide([], false, 1);
    expect(side.shown).toEqual([]);
    expect(side.more).toBe(0);
  });
});
