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

// A name declared in the file is no host global.
export const shadowed = (window: { readonly name: string }) => {
  const same = window;
  return same.name;
};
const document2 = { title: '' };
export const local = document2;
// Reading a member of a host name is no alias of it (the host bans read the members).
export const title = make() + document.title.length;
