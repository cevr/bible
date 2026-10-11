// Upstream: packages/react/src/separator/Separator.test.tsx
//
// The separator: a `role="separator"` that says its orientation to
// assistive tech (`aria-orientation`) and to a stylesheet (`data-orientation`).
import { describe, it } from 'bun:test';

import { expect as see } from '@playwright/test';

import { harness } from './harness.ts';

const h = harness('separator.tsx');

describe('Separator', () => {
  it('renders a div with the separator role', async () => {
    const page = await h.open('separators');
    await see(page.getByRole('separator')).toHaveCount(3);
    await see(page.locator('#vertical')).toHaveJSProperty('tagName', 'DIV');
  });

  it.each([
    ['vertical', 'vertical'],
    ['horizontal', 'horizontal'],
    ['default', 'horizontal'],
  ])('%s says its orientation, %s', async (id, orientation) => {
    const page = await h.open('separators');
    const separator = page.locator(`#${id}`);
    await see(separator).toHaveAttribute('aria-orientation', orientation);
    await see(separator).toHaveAttribute('data-orientation', orientation);
  });
});
