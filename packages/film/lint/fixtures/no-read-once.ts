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
