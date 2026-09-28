import { describe, expect, test } from 'bun:test';
import { Schema } from 'effect';
import { Timed } from '../core/schema.ts';
import { storyboard } from './storyboard.ts';

describe('storyboard', () => {
  test('a card declares itself, and the tools keep it when they decode the scene', () => {
    const card = { id: 'daily', say: 'words', ...storyboard('daily', 'a brief') };
    expect(Schema.decodeSync(Timed)(card).storyboard).toBe(true);
  });
});
