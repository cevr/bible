// Fixture for film/no-host-alias: each line marked RED fires the rule, and
// nothing else does.

declare const make: () => number;

const perf = performance; // RED film/no-host-alias
const doc = document; // RED film/no-host-alias
const w = window; // RED film/no-host-alias
const nav = globalThis; // RED film/no-host-alias
const { now } = performance; // RED film/no-host-alias
let later: Window;
later = window; // RED film/no-host-alias
export const aliased = [perf.now(), doc.title, w.name, nav.name, now(), later.name];

// A type wrapped around the host global is the same alias.
const checked = performance satisfies Performance; // RED film/no-host-alias
const cast = window as Window; // RED film/no-host-alias
const sure = navigator!; // RED film/no-host-alias
const old = <Document>document; // RED film/no-host-alias
const both = self as Window satisfies Window; // RED film/no-host-alias
export const wrapped = [checked.now(), cast.name, sure.language, old.title, both.name];
// A type wrapped around a value of the page's own passes.
const own = { now: () => 0 };
export const typed = own satisfies { readonly now: () => number };

// A name declared in the file is no host global.
export const shadowed = (window: { readonly name: string }) => {
  const same = window;
  return same.name;
};
const document2 = { title: '' };
export const local = document2;
// Reading a member of a host name is no alias of it (the host bans read the members).
export const title = make() + document.title.length;

// A host global held by a place of the page's own is the same alias.
declare const mine: Window | undefined;
declare const take: (w: Window) => number;
export const held = { w: window }; // RED film/no-host-alias
export const answered = () => performance; // RED film/no-host-alias
export const defaulted = (w = window) => w.name; // RED film/no-host-alias
export const listed = [document]; // RED film/no-host-alias
export const either = mine ?? window; // RED film/no-host-alias
export function returned() {
  return navigator; // RED film/no-host-alias
}
// Handing the host to a call builds an adapter; a key named like a host is no host.
export const adapted = take(window);
export const keyed = { window: 1, document: mine };
