// Fixture for film/no-read-once: each line marked RED fires the rule, and
// nothing else does.
import type { Page } from 'playwright-core';

declare const page: Page;

export const reads = [
  page.textContent('.lab-status'), // RED film/no-read-once
  page.inputValue('.lab-compose textarea'), // RED film/no-read-once
  page.getAttribute('.lab-lookbook', 'href'), // RED film/no-read-once
  page.locator('.lab-cue').first().getAttribute('class'), // RED film/no-read-once
  page.locator('.lab-cue').count(), // RED film/no-read-once
  page.$eval('[data-role="review"]', (a) => a.id), // RED film/no-read-once
  page.$$eval('.lab-cue', (els) => els.length), // RED film/no-read-once
  page.locator('.lab-cue').isVisible(), // RED film/no-read-once
  page.waitForFunction(() => document.querySelector('.lab-status')?.getAttribute('data-tone')),
  page.waitForSelector('.lab-status'),
  page.evaluate(() => document.body.getAttribute('class')),
];

declare const expect: (value: unknown) => { toBe: (want: unknown) => void };
declare const promise: <A>(run: () => Promise<A>) => A;
const evaluate = <A>(script: string) => page.evaluate(script) as Promise<A>;

// A value `evaluate` answers is a read once when a test asserts it.
export async function evaluated() {
  expect(await page.evaluate('document.title')).toBe('lab'); // RED film/no-read-once
  expect(await evaluate<string>('document.title')).toBe('lab'); // RED film/no-read-once
  expect(promise(() => page.evaluate('document.title'))).toBe('lab'); // RED film/no-read-once
  // An evaluate run for what it does, not read: an action.
  await page.evaluate('window.clip = document.querySelector("video")');
  promise(() => page.evaluate('window.scrollTo(0, 0)'));
}
