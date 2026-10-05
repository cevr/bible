// The render page loads no Solid: its module graph, bundled for the browser
// as the renderer loads it, reaches neither `solid-js` nor `@solidjs/*`.

import { expect, test } from 'bun:test';

test('the render page loads no Solid', async () => {
  const out = await Bun.build({
    entrypoints: [new URL('./render.ts', import.meta.url).pathname],
    target: 'browser',
    metafile: true,
    throw: true,
  });
  const inputs = Object.keys(out.metafile?.inputs ?? {});
  expect(inputs.length).toBeGreaterThan(0);
  expect(inputs.filter((input) => /solid-js|@solidjs/.test(input))).toEqual([]);
});
