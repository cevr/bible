// Fixture for film/no-read-once: each line marked RED fires the rule, and
// nothing else does.

/** The lab's tab (`lab/fixtures/tab.ts`), as far as the rule reads it. */
interface Tab {
  readonly evaluate: <A = unknown>(script: string) => Promise<A>;
  readonly until: (script: string) => Promise<void>;
  readonly waitFor: (selector: string) => Promise<void>;
  readonly click: (selector: string) => Promise<void>;
}

declare const page: Tab;

export const actions = [
  page.until("document.querySelector('.lab-status')?.getAttribute('data-tone') === 'ok'"),
  page.waitFor('.lab-status'),
  page.click('.lab-cue'),
  page.evaluate("document.body.getAttribute('class')"),
];

declare const expect: (value: unknown) => { toBe: (want: unknown) => void };
declare const promise: <A>(run: () => Promise<A>) => A;
const evaluate = <A>(script: string) => page.evaluate<A>(script); // RED film/no-read-once

// A value `evaluate` answers is a read once when a test asserts it.
export async function evaluated() {
  expect(await page.evaluate('document.title')).toBe('lab'); // RED film/no-read-once
  expect(await evaluate<string>('document.title')).toBe('lab'); // RED film/no-read-once
  expect(promise(() => page.evaluate('document.title'))).toBe('lab'); // RED film/no-read-once
  // An evaluate run for what it does, not read: an action.
  await page.evaluate('window.clip = document.querySelector("video")');
  promise(() => page.evaluate('window.scrollTo(0, 0)'));
}

// An answer kept and asserted later: bound to a name, answered by a local
// helper, read in part, held in a literal, or the value a matcher compares with.
export async function kept() {
  const title = await page.evaluate('document.title'); // RED film/no-read-once
  expect(title).toBe('lab');
  const shown = () => promise(() => page.evaluate<string>('location.hash')); // RED film/no-read-once
  const at = shown();
  const box = { at, size: [at.length] };
  expect(box.size[0]).toBe(2);
  const rate = await page.evaluate('new AudioContext().sampleRate'); // RED film/no-read-once
  expect({ rate: 48_000 }).toBe({ rate });
  // A value computed from kept answers: arithmetic, a test, a template.
  const from = await page.evaluate<number>('scrollY'); // RED film/no-read-once
  const to = await page.evaluate<number>('scrollY'); // RED film/no-read-once
  expect(to - from).toBe(0);
  const open = await page.evaluate('document.hidden'); // RED film/no-read-once
  expect(!open ? 'shown' : 'hidden').toBe('shown');
  const hash = await page.evaluate('location.hash'); // RED film/no-read-once
  expect(`at ${hash}`).toBe('at #T');
  // A kept answer handed only to a wait, as its baseline: no read is asserted.
  const before = await page.evaluate('document.title');
  await page.until(`document.title !== ${JSON.stringify(before)}`);
}
