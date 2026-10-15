// Server-render parity of the behaviour mixins (after Remix's
// `mix-ssr-parity.test.tsx`): the attributes prop mixins give an element are
// the same in the server's markup as in the browser's DOM; the ref factories,
// made in the body, are made on both sides, and the server calls no ref
// callback and runs no `onElement` setup. The server half is compiled by
// Solid's compiler for its server build (`fixtures/mix-server.tsx`, built by
// the harness's `buildServer`); the browser half is the `parity` fixture.
// Both are read by the same parser: the server's markup is parsed in the page.
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import type { Page } from '@playwright/test';

import type * as ServerEntry from './fixtures/mix-server.tsx';
import { buildServer, harness, logOf, type ServerBuild } from './harness.ts';

const h = harness('mix.tsx');

let build: ServerBuild<typeof ServerEntry>;
let server: typeof ServerEntry;

beforeAll(async () => {
  build = await buildServer(`${import.meta.dir}/fixtures/mix-server.tsx`);
  server = build.module;
});

afterAll(async () => {
  await build.dispose();
});

/** The markers Solid's server build adds for hydration: not attributes a mixin gives. */
const HYDRATION_MARKERS = ['_hk', 'data-hk'];

/** Each element's attributes, `style` as the browser serializes the declarations it parsed. */
const attributesIn = (
  page: Page,
  html: string | null,
  ids: ReadonlyArray<string>,
): Promise<Record<string, Record<string, string>>> =>
  page.evaluate(
    ([markup, wanted, markers]) => {
      let root: ParentNode = document;
      if (markup !== null) {
        const template = document.createElement('template');
        template.innerHTML = markup;
        root = template.content;
      }
      const out: Record<string, Record<string, string>> = {};
      for (const id of wanted) {
        const el = root.querySelector<HTMLElement>(`#${id}`);
        const attributes: Record<string, string> = {};
        for (const attribute of Array.from(el?.attributes ?? [])) {
          if (!markers.includes(attribute.name)) {
            attributes[attribute.name] =
              attribute.name === 'style' ? el!.style.cssText : attribute.value;
          }
        }
        out[id] = attributes;
      }
      return out;
    },
    [html, ids, HYDRATION_MARKERS] as const,
  );

/** The attributes the button mixin gives a toggle (its `tabindex` is the toggle group's). */
const buttonAttributes = (attributes: Record<string, string> | undefined) => ({
  type: attributes?.['type'],
  role: attributes?.['role'],
  'aria-pressed': attributes?.['aria-pressed'],
});

describe('mix server-render parity', () => {
  it("renders a prop mixin's attributes the same on the server as in the browser", async () => {
    const page = await h.open('parity');
    const { html } = server.render();
    const client = await attributesIn(page, null, ['parity', 'one', 'two']);
    const served = await attributesIn(page, html, ['parity', 'one', 'two']);
    expect(served['parity']).toEqual(client['parity']);
    expect(client['parity']).toEqual({
      id: 'parity',
      role: 'switch',
      tabindex: '0',
      'aria-checked': 'true',
      'data-on': '',
      'aria-label': 'parity',
      title: 'right',
      'data-caller': 'yes',
      class: 'caller base',
      style: 'color: red; margin: 1px;',
    });
    for (const id of ['one', 'two']) {
      expect(buttonAttributes(served[id])).toEqual(buttonAttributes(client[id]));
    }
    expect(buttonAttributes(client['two'])).toEqual({
      type: 'button',
      role: undefined,
      'aria-pressed': 'true',
    });
  });

  it('makes the ref factories on both sides, and calls and sets them up in the browser alone', async () => {
    const page = await h.open('parity');
    expect(server.render().reported).toEqual(['made']);
    expect(await logOf(page)).toEqual(['made', 'ref parity', 'setup parity']);
  });
});
