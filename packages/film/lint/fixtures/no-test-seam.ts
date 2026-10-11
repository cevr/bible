// Fixture for film/no-test-seam: each line marked RED fires the rule, and
// nothing else does.
import { routesOf } from '../../src/core/testing.ts'; // RED film/no-test-seam
import type { Route } from '../../src/core/testing.ts'; // RED film/no-test-seam
import { memoryLocation } from '@bible/url-state/testing'; // RED film/no-test-seam
import * as wiki from '@bible/core/wiki/testing'; // RED film/no-test-seam
import { declares } from './testing'; // RED film/no-test-seam
export { routesOf as routes } from '../../src/core/testing.ts'; // RED film/no-test-seam
export * from '../../src/tools/testing.ts'; // RED film/no-test-seam

export const later = () => import('../../src/core/testing.ts'); // RED film/no-test-seam
// `packages/core` spells its relative imports `.js`, which resolve to the `.ts` file.
export * from './search/testing.js'; // RED film/no-test-seam
export { seam } from '../../src/core/testing.mjs'; // RED film/no-test-seam

// Another package's `testing`, a module only named like one, and a product module pass.
import { TestClock } from 'effect/testing';
import { attest } from './attesting.ts';
import { notes } from './testing-notes.ts';
import { Location } from '@bible/url-state';
export { Location } from '@bible/url-state';
export const named = 'testing';
export const dynamic = (path: string) => import(path);

export const used = [routesOf, memoryLocation, wiki, declares, TestClock, attest, notes];
export type Used = Route;
