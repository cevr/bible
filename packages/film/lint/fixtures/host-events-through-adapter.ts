// Fixture for film/host-events-through-adapter: each line marked RED fires the
// rule, and nothing else does.

declare const page: EventTarget;
declare const hear: () => void;
declare const kind: string;

window.addEventListener('keydown', hear); // RED film/host-events-through-adapter
document.addEventListener('keyup', hear); // RED film/host-events-through-adapter
window.addEventListener('popstate', hear); // RED film/host-events-through-adapter
globalThis.addEventListener('hashchange', hear); // RED film/host-events-through-adapter
document.addEventListener('pointermove', hear); // RED film/host-events-through-adapter
self.addEventListener('pointercancel', hear); // RED film/host-events-through-adapter

// The layout's and the page's own life are not an adapter's.
window.addEventListener('resize', hear);
window.addEventListener('pagehide', hear);
// An adapter listens on the target it is given.
page.addEventListener('keydown', hear);
// A name the rule cannot read is not judged.
window.addEventListener(kind, hear);
