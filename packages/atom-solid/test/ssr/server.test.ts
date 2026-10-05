/* oxlint-disable effect/noAsyncFunction, effect/noNodeBuiltinImport, effect/noTestLifecycleHooks -- the build
 * harness is Promise based, a scratch directory is a host concern, and the
 * one build lives for the file, its directory removed after it. */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import { Option } from 'effect';

import { build } from './build.ts';

let outdir: string;
let built: Awaited<ReturnType<typeof build>>;

beforeAll(async () => {
  outdir = await mkdtemp(`${tmpdir()}/atom-solid-ssr-`);
  built = await build(outdir);
});

afterAll(() => rm(outdir, { recursive: true, force: true }));

describe('server rendering a place', () => {
  test('renders path and query from the request, and the hash at its default', () => {
    const { html, codes } = built.findings(() => built.render('/films/f/lab/s?cue=c#t=2'));
    expect(html).toMatch(/<p [^>]*id="film"[^>]*>f<\/p>/);
    expect(html).toMatch(/<p [^>]*id="cue"[^>]*>c<\/p>/);
    expect(html).toMatch(/<i [^>]*id="t"[^>]*>0<\/i>/);
    // A server render is pure: a hook seeds its value without writing a
    // signal, which Solid reports as SERVER_WRITE.
    expect(codes).toEqual(Option.some([]));
  });

  test('refuses a hook with no RegistryProvider: requests never share a registry', () => {
    expect(built.renderWithoutProvider).toThrow(/RegistryProvider/);
  });
});

describe("server rendering a viewer's own value", () => {
  test('renders its server value, read and set, and never runs the atom', () => {
    let runs = 0;
    const html = built.ownPage(() => {
      runs += 1;
    });
    expect(html).toMatch(/<p [^>]*id="own"[^>]*>served<\/p>/);
    expect(runs).toBe(0);
  });
});

describe('server rendering a served atom', () => {
  test('waits for its read, renders it, and sends it encoded for the client to adopt', async () => {
    let reads = 0;
    const html = await built.answerPage(async () => {
      reads += 1;
      return '42';
    });
    expect(html).toMatch(/<p [^>]*id="answer"[^>]*>answered 42<\/p>/);
    expect(html).toContain('{_tag:"Success",value:"42",waiting:!1');
    expect(reads).toBe(1);
  });
});
