// A page's mount in the browser, for its browser entry: hydrated over the
// markup the lab rendered it with on the server (`page-server.tsx`: its root
// marked `PAGE_ROOT`, its styles in the head), or, served as built (no
// server entry, a render that failed or was cut, a kept build), rendered
// anew with its styles added and its root made. Either way the same
// components run.

import { type JSX, hydrate, render } from '@solidjs/web';
import { Option } from 'effect';
import { PAGE_CUT, PAGE_MOUNTED, PAGE_ROOT, PAGE_STYLE } from '../core/page-render.ts';

/** A page as its browser entry mounts it: the same parts its server entry renders (`pageRender`). */
interface MountedPage {
  readonly bodyClass: string;
  readonly rootClass: string;
  readonly style: string;
  readonly app: () => JSX.Element;
}

/** How a page was mounted: over the server's markup, or anew. */
type Mounted = 'hydrated' | 'rendered';

/**
 * Mount `page`: hydrated over the server's markup when the page came with
 * it whole, else rendered. A page whose render the lab cut short (it ends
 * with `PAGE_CUT_MARK`) has its server markup and the mark dropped first: a
 * hydration would wait on parts of it that never came. The body says how
 * once it is (`PAGE_MOUNTED`).
 */
export const mountPage = (page: MountedPage): Mounted => {
  document.body.classList.add(page.bodyClass);
  const served = Option.fromNullishOr(document.querySelector(`[${PAGE_ROOT}]`));
  const cut = Option.fromNullishOr(document.querySelector(`[${PAGE_CUT}]`));
  if (Option.isSome(cut)) for (const node of [...Option.toArray(served), cut.value]) node.remove();
  const whole = Option.filter(served, () => Option.isNone(cut));
  const how = Option.match(whole, {
    onSome: (served): Mounted => {
      hydrate(page.app, served);
      return 'hydrated';
    },
    onNone: (): Mounted => {
      rendered(page);
      return 'rendered';
    },
  });
  document.body.setAttribute(PAGE_MOUNTED, how);
  return how;
};

/** `page` rendered anew: its styles added unless the page has them, its root made. */
const rendered = (page: MountedPage): void => {
  if (Option.isNone(Option.fromNullishOr(document.querySelector(`[${PAGE_STYLE}]`)))) {
    const style = document.createElement('style');
    style.setAttribute(PAGE_STYLE, '');
    style.textContent = page.style;
    document.head.append(style);
  }
  const root = document.createElement('div');
  root.className = page.rootClass;
  document.body.append(root);
  render(page.app, root);
};
