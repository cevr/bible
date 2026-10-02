/* oxlint-disable effect/noAsyncFunction, effect/noNodeBuiltinImport -- the build
 * harness is Promise based, and a scratch directory is a host concern. */
import { describe, expect, test } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import { build } from './build.ts';

describe('server rendering a place', () => {
  test('renders path and query from the request, and the hash at its default', async () => {
    const { render } = await build(await mkdtemp(`${tmpdir()}/atom-solid-ssr-`));
    const html = render('/films/f/lab/s?cue=c#t=2');
    expect(html).toMatch(/<p [^>]*id="film"[^>]*>f<\/p>/);
    expect(html).toMatch(/<p [^>]*id="cue"[^>]*>c<\/p>/);
    expect(html).toMatch(/<i [^>]*id="t"[^>]*>0<\/i>/);
  });
});
