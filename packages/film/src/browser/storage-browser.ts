// The browser's storage as the page's two stores (`storage.ts`): the tab's
// session and the browser's local storage, each a store in memory when the
// page may not use it.

import { type StoreRuntime, storeOver } from './storage.ts';

/** The tab's session: what a reload keeps and a new tab does not (the lab's view). */
export const TabStore: StoreRuntime = storeOver(() => sessionStorage);

/** The browser's local storage: what every visit from this browser keeps (the microphone, the review's quality and filter). */
export const ViewerStore: StoreRuntime = storeOver(() => localStorage);
