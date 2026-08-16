/** The Topics verifier's contract, as one matrix both adapters are run against.
 *
 *  The native and browser gates must refuse exactly the same candidates: a gate
 *  that holds on desktop and leaks in the browser is no gate. The two suites
 *  previously restated the cases separately and had already drifted — the native
 *  side asserted a "too new" message the browser side did not produce, and
 *  covered cases the browser matrix omitted. One shared matrix removes the
 *  possibility: a case added here is a case both adapters must satisfy, and
 *  neither suite can quietly stop testing it.
 *
 *  Not a `.test.ts` file, so it imports cleanly from both `packages/core` and
 *  `apps/web` without either test runner trying to execute it as a suite. */

import { TOPICS_VERIFY_MESSAGES } from './topics-verifier.js';

/** The artifact state a case installs before the verifier runs. `schemaMajor` is
 *  a string because `meta.value` is a TEXT column: a corrupt version field is a
 *  value the artifact can really hold, and the strict parse only has something
 *  to catch if the fixture can write one. */
export interface TopicsVerifierFixture {
  readonly schemaMajor: string;
  readonly topics: number;
  readonly aliases: number;
}

/** `accepted` carries the page count the verifier must return; `refused` carries
 *  the exact message it must report. Both are asserted, so a case cannot pass by
 *  failing for the wrong reason. */
export type TopicsVerifierOutcome =
  | { readonly kind: 'accepted'; readonly installed: number }
  | { readonly kind: 'refused'; readonly message: string };

export interface TopicsVerifierCase {
  readonly name: string;
  readonly fixture: TopicsVerifierFixture;
  readonly outcome: TopicsVerifierOutcome;
}

const accepted = (installed: number): TopicsVerifierOutcome => ({ kind: 'accepted', installed });
const refused = (message: string): TopicsVerifierOutcome => ({ kind: 'refused', message });

/** Every value that must not read as a usable schema major.
 *
 *  `Number.parseInt('1junk', 10)` is 1, so a lenient parse reads each of these
 *  as a version this build can serve and installs a file whose version field is
 *  nonsense. The strict parse is the only thing standing between this build and
 *  a file it cannot interpret. */
const UNREADABLE_SCHEMA_MAJORS: readonly string[] = [
  '1junk',
  '',
  ' 1',
  '1.5',
  'NaN',
  '-1',
  '9'.repeat(30),
];

export const TOPICS_VERIFIER_CASES: readonly TopicsVerifierCase[] = [
  {
    name: 'accepts an artifact with pages and a phrase dictionary',
    fixture: { schemaMajor: '1', topics: 4, aliases: 7 },
    outcome: accepted(4),
  },
  {
    name: 'accepts a schema major older than this build',
    fixture: { schemaMajor: '0', topics: 2, aliases: 2 },
    outcome: accepted(2),
  },
  {
    // A compile where every authored core is still `status: draft` produces this
    // file honestly, but it can never answer a lookup — so it is refused rather
    // than swapped over a generation that can.
    name: 'rejects an empty artifact',
    fixture: { schemaMajor: '1', topics: 0, aliases: 0 },
    outcome: refused(TOPICS_VERIFY_MESSAGES.noPages),
  },
  {
    name: 'rejects an artifact with no pages',
    fixture: { schemaMajor: '1', topics: 0, aliases: 3 },
    outcome: refused(TOPICS_VERIFY_MESSAGES.noPages),
  },
  {
    name: 'rejects pages with no phrase dictionary',
    fixture: { schemaMajor: '1', topics: 4, aliases: 0 },
    outcome: refused(TOPICS_VERIFY_MESSAGES.noAliases),
  },
  {
    name: 'rejects a schema major beyond this build',
    fixture: { schemaMajor: '99', topics: 1, aliases: 1 },
    outcome: refused(TOPICS_VERIFY_MESSAGES.schemaTooNew(99)),
  },
  ...UNREADABLE_SCHEMA_MAJORS.map((schemaMajor): TopicsVerifierCase => ({
    name: `rejects the schema_major '${schemaMajor}'`,
    fixture: { schemaMajor, topics: 1, aliases: 1 },
    outcome: refused(TOPICS_VERIFY_MESSAGES.unreadableSchemaMajor),
  })),
];
