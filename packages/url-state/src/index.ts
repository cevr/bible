/**
 * URL state as Effect Schemas: the address a page is on (`Location`), what
 * its parts mean (`Codec`, `Field`, `Place`), and the writes to it
 * (`UrlState`). Depends on `effect` alone; `@bible/url-state/atom` binds it to
 * Effect atoms.
 */

export * as Codec from './codec.js';
export * as Field from './field.js';
export { Entry, Location, type LocationService, parseHref } from './location.js';
export { layerBrowser, type BrowserOptions } from './location-browser.js';
export { layerMemory, LocationHistory, type LocationHistoryService } from './location-memory.js';
export { layerServer } from './location-server.js';
export * as Place from './place.js';
export * as UrlState from './url-state.js';
