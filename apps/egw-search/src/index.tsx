/** The production browser entry: the page and nothing else. */

import { Effect } from 'effect';

import { boot } from './boot.js';

boot(Effect.void);
