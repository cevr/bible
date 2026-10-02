/**
 * URL state as Effect Schemas: the address a page is on (`Location`), what
 * its parts mean (`Codec`, `Field`, `Place`), and the writes to it
 * (`UrlState`). Depends on `effect` alone; `@bible/url-state/atom` binds it to
 * Effect atoms.
 */

export * from './location.js';
export { layerBrowser, type BrowserOptions } from './location-browser.js';
export { layerMemory, LocationHistory, type LocationHistoryService } from './location-memory.js';
export { layerServer, SERVER_ENTRY_KEY } from './location-server.js';
