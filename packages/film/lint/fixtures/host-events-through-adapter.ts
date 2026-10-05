// Fixture for film/host-events-through-adapter: each line marked RED fires the
// rule, and nothing else does.

declare const page: EventTarget;
declare const el: Element;
declare const id: number;
declare const hear: () => void;
declare const kind: string;

window.addEventListener('keydown', hear); // RED film/host-events-through-adapter
document.addEventListener('keyup', hear); // RED film/host-events-through-adapter
window.addEventListener('popstate', hear); // RED film/host-events-through-adapter
globalThis.addEventListener('hashchange', hear); // RED film/host-events-through-adapter
document.addEventListener('pointermove', hear); // RED film/host-events-through-adapter
self.addEventListener('pointercancel', hear); // RED film/host-events-through-adapter

// A press is owned and ended by Pointer.drag alone, on whatever it was pressed on.
el.addEventListener('pointerup', hear); // RED film/host-events-through-adapter
document.body.addEventListener('pointercancel', hear); // RED film/host-events-through-adapter
el.addEventListener('lostpointercapture', hear); // RED film/host-events-through-adapter
el.setPointerCapture(id); // RED film/host-events-through-adapter
el.releasePointerCapture(id); // RED film/host-events-through-adapter

// The layout's and the page's own life are not an adapter's.
window.addEventListener('resize', hear);
window.addEventListener('pagehide', hear);
// An adapter listens on the target it is given.
page.addEventListener('keydown', hear);
// A press, a hover and a move over an element are the element's own.
el.addEventListener('pointerdown', hear);
el.addEventListener('pointerover', hear);
el.addEventListener('pointermove', hear);
// A name the rule cannot read is not judged.
window.addEventListener(kind, hear);
