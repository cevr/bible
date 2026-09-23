/**
 * The host's policy table: every policy name a contract or query in this app
 * declares, mapped to its rule.
 *
 * The app has no accounts and no sessions. Searching the writings is open to
 * anyone, so `public` is allow-all, and it is written here by name rather
 * than assumed. A host whose table misses a declared name fails to build with
 * `PolicyNamesMissing`, so a new name added to a contract without a rule here
 * stops the server at start rather than at the first request.
 */

import { Policies, Policy } from 'effect-frame/actor';
import { Layer } from 'effect';

import { PUBLIC_POLICY } from '../src/contract.js';

export const PoliciesLive = Layer.succeed(
  Policies,
  Policies.of({ [PUBLIC_POLICY]: Policy.allowAll }),
);
