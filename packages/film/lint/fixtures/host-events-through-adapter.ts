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

// A press is owned and ended by Pointer.press alone, on whatever it was pressed on.
el.addEventListener('pointerup', hear); // RED film/host-events-through-adapter
document.body.addEventListener('pointercancel', hear); // RED film/host-events-through-adapter
el.addEventListener('lostpointercapture', hear); // RED film/host-events-through-adapter
el.setPointerCapture(id); // RED film/host-events-through-adapter
el.releasePointerCapture(id); // RED film/host-events-through-adapter

// Every other spelling of the same listener.
const UP = 'pointerup';
const KEY = `keydown`;
const host = window;
host.addEventListener('keydown', hear); // RED film/host-events-through-adapter
window.addEventListener(KEY, hear); // RED film/host-events-through-adapter
el.addEventListener(UP, hear); // RED film/host-events-through-adapter
window.addEventListener(`popstate`, hear); // RED film/host-events-through-adapter
for (const type of ['focus', 'keydown']) document.addEventListener(type, hear); // RED film/host-events-through-adapter
addEventListener('popstate', hear); // RED film/host-events-through-adapter
EventTarget.prototype.addEventListener.call(window, 'hashchange', hear); // RED film/host-events-through-adapter
EventTarget.prototype.addEventListener.apply(document, ['keyup', hear]); // RED film/host-events-through-adapter
document.defaultView?.addEventListener('popstate', hear); // RED film/host-events-through-adapter
window.top?.addEventListener('keydown', hear); // RED film/host-events-through-adapter
Element.prototype.setPointerCapture.call(el, id); // RED film/host-events-through-adapter
// A handler property is a listener too.
window.onpopstate = hear; // RED film/host-events-through-adapter
document.onkeydown = hear; // RED film/host-events-through-adapter
onhashchange = hear; // RED film/host-events-through-adapter
el.onpointerup = hear; // RED film/host-events-through-adapter
el.onlostpointercapture = hear; // RED film/host-events-through-adapter
// On the host, a name the rule cannot read may be any event an adapter owns.
window.addEventListener(kind, hear); // RED film/host-events-through-adapter

// The layout's and the page's own life are not an adapter's.
window.addEventListener('resize', hear);
window.addEventListener('pagehide', hear);
for (const type of ['focus', 'blur']) window.addEventListener(type, hear);
window.onresize = hear;
// An adapter listens on the target it is given.
page.addEventListener('keydown', hear);
// A press, a hover and a move over an element are the element's own.
el.addEventListener('pointerdown', hear);
el.addEventListener('pointerover', hear);
el.addEventListener('pointermove', hear);
el.onpointerdown = hear;
// Off the host, a name the rule cannot read is not judged.
el.addEventListener(kind, hear);
// A function the file declares is its own, whatever its name.
export const own = () => {
  const addEventListener = (type: string, f: () => void) => page.addEventListener(type, f);
  addEventListener('popstate', hear);
};
