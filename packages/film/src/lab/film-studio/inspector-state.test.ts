// What the inspector opens of a selection: the section of the kind clicked
// (Words for a beat, Board for a panel); the sections the owner opened or
// shut stay so while that selection stands, and a new one opens afresh. And
// the counts a closed section's row says.

import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import type { BoardClip } from '../../core/timeline-schema.ts';
import { boardText, openSections, toggle, wordsText } from './inspector-state.ts';

const BEAT = { kind: 'beat', sel: 'beat:cold' } as const;
const PANEL = { kind: 'panel', sel: 'panel:cold.start' } as const;

const clip = (panel: string, state: BoardClip['state'], card: boolean): BoardClip => ({
  start: 0,
  dur: 1,
  state,
  clock: 'measured',
  panel,
  beat: 'cold',
  mark: 'start',
  markAt: 0,
  card,
});

describe('the sections a selection opens', () => {
  test('a beat opens on its Words, a panel on its Board', () => {
    expect([...openSections(BEAT, Option.none())]).toEqual(['Words']);
    expect([...openSections(PANEL, Option.none())]).toEqual(['Board']);
  });

  test('a section opened or shut stays so while the selection stands', () => {
    const opened = toggle(BEAT, Option.none(), 'Voice', true);
    expect([...openSections(BEAT, Option.some(opened))].toSorted()).toEqual(['Voice', 'Words']);
    const shut = toggle(BEAT, Option.some(opened), 'Words', false);
    expect([...openSections(BEAT, Option.some(shut))]).toEqual(['Voice']);
  });

  test('another selection opens afresh, whatever was toggled before it', () => {
    const toggled = toggle(BEAT, Option.none(), 'Code', true);
    expect([...openSections(PANEL, Option.some(toggled))]).toEqual(['Board']);
  });
});

describe("a closed section's count", () => {
  test('the words a line says, one word or many', () => {
    expect(wordsText('  Is it  just?\nIt is. ')).toBe('5 words');
    expect(wordsText('Righteous')).toBe('1 word');
    expect(wordsText('How should man be just')).toBe('5 words');
  });

  test('the picture panels that keep a try, of them all; a card is no picture', () => {
    expect(
      boardText([
        clip('cold.start', 'kept', false),
        clip('cold.job', 'approved', false),
        clip('cold.card', 'made', true),
        clip('cold.end', 'made', false),
      ]),
    ).toBe('2 of 3 kept');
  });
});
