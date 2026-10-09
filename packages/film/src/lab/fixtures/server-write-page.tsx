// Two server entries for the purity guard's own test (`served`, `bundles.ts`):
// one page that writes a signal while the server renders it, which the
// guard must fail, and the same page reading its signal only, which it must
// let through.

import { createSignal } from 'solid-js';
import { pageRender } from '../page-server.tsx';

/** A page whose render sets its own signal: the server write the guard hears. */
export const writingRender = pageRender({
  bodyClass: 'probe',
  rootClass: 'probe-root',
  style: '',
  app: () => {
    const [count, setCount] = createSignal(0);
    setCount(1);
    return <p>{count()}</p>;
  },
});

/** The same page, its state read and never set. */
export const readingRender = pageRender({
  bodyClass: 'probe',
  rootClass: 'probe-root',
  style: '',
  app: () => {
    const [count] = createSignal(1);
    return <p>{count()}</p>;
  },
});
