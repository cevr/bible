/**
 * Moving between screens on the web: a row opens its hymn inside the app,
 * never by loading the page anew, and coming back to the search finds it as
 * the reader left it. The screens are mounted in a browser's document
 * (`src/test/setup.ts`), with `one` as the web build has it
 * (`src/test/one.tsx`). On the web a screen is mounted anew when the reader
 * comes back to it, so the test unmounts the search and mounts it again.
 */

import { describe, expect, it } from 'bun:test';
import { RegistryProvider } from '@effect/atom-react';
import { Option } from 'effect';
import type { ReactNode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import Search from '../../app/(hymnal)/index';
import { opened } from '../test/one';
import { readerOn } from '../test/reader';
import { hymnAt, hymns } from '~/hymns/hymns';

import { HymnList } from './HymnList';
import { HymnPage } from './HymnPage';
import { hymnsOffset } from './place';

/**
 * The app mounted in the document with `node` on screen, nothing opened
 * yet; it unmounts when the test's `using` ends.
 */
const mount = (node: ReactNode) => {
  opened.splice(0);
  const host = document.createElement('div');
  document.body.append(host);
  const root: Root = createRoot(host);
  act(() => root.render(node));
  return {
    root,
    host,
    [Symbol.dispose]: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
};

/** A left click on `element`; true when the page handled it (the browser follows nothing). */
const click = (element: Element, keys: { readonly metaKey?: boolean } = {}) => {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...keys });
  act(() => void element.dispatchEvent(event));
  return event.defaultPrevented;
};

const row = (host: HTMLElement, label: string) =>
  Option.getOrThrow(Option.fromNullishOr(host.querySelector(`[aria-label="${label}"]`)));

const rows = (host: HTMLElement) =>
  [...host.querySelectorAll('[role="link"][aria-label]')].map((r) => r.getAttribute('aria-label'));

/**
 * Types `text` into the search field as a reader does: the field's value,
 * set as the browser sets it (past React's own record of it), then its
 * input event.
 */
const type = (host: HTMLElement, text: string) => {
  const field = Option.getOrThrow(Option.fromNullishOr(host.querySelector('input')));
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    setValue?.call(field, text);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('moving between screens on the web', () => {
  it('opens a hymn from its row inside the app, never by loading the page anew', () => {
    using app = mount(
      <RegistryProvider>
        <HymnList hymns={hymns.slice(0, 3)} hrefOf={(n) => `/hymns/${n}`} offset={hymnsOffset} />
      </RegistryProvider>,
    );
    const handled = click(row(app.host, '2, All Creatures of Our God and King'));
    expect({ handled, opened }).toEqual({ handled: true, opened: ['/hymns/2'] });
  });

  it('leaves a Cmd-click on a row to the browser, which opens the hymn in a new tab', () => {
    using app = mount(
      <RegistryProvider>
        <HymnList hymns={hymns.slice(0, 3)} hrefOf={(n) => `/hymns/${n}`} offset={hymnsOffset} />
      </RegistryProvider>,
    );
    const link = row(app.host, '2, All Creatures of Our God and King');
    const handled = click(link, { metaKey: true });
    expect({ tag: link.tagName, href: link.getAttribute('href'), handled, opened }).toEqual({
      tag: 'A',
      href: '/hymns/2',
      handled: false,
      opened: [],
    });
  });

  it('comes back from a hymn to the search as the reader left it', () => {
    const inApp = (screen: ReactNode) => <RegistryProvider>{screen}</RegistryProvider>;
    using app = mount(inApp(<Search />));
    const { root, host } = app;
    type(host, 'shepherd');
    const left = rows(host);
    expect(left[0]).toBe('55, Jesus Tender Shepherd Hear Me');

    // The hymn shows in the search's place, then Back shows the search again.
    act(() =>
      root.render(inApp(<HymnPage hymn={Option.getOrThrow(hymnAt('545'))} reader={readerOn()} />)),
    );
    act(() => root.render(inApp(<Search />)));

    expect(host.querySelector('input')?.value).toBe('shepherd');
    expect(rows(host)).toEqual(left);
  });
});
