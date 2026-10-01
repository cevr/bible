// A refusal over a missing render names the command that makes it: run as
// printed, it renders the very scene and variant refused.

import { describe, expect, test } from 'bun:test';
import { SceneNotRendered } from './refusals.ts';

describe('a missing render', () => {
  test('names the render of its scene and variant', () => {
    const refused = SceneNotRendered.make({ film: 'rbf', scene: 'cold', variant: 'tight' });
    expect(refused.message).toContain('run film project render rbf --scene cold --variant tight');
  });
});
