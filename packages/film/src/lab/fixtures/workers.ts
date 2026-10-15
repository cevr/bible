// How many workers the e2e suite runs (`run-suite.ts`'s `--parallel`), pure.
// On CI the runner is the suite's own, so it keeps its count: at most 8, at
// most the cores. On a shared machine (the laptop, the Workbox) the suite
// takes the capacity free when it starts: the cores less the one-minute
// load, at least 2, at most the cores; a suite started beside other work
// then times its own cases out less.

import { Match } from 'effect';

/** What the host is: its cores, its one-minute load, and whether it is CI. */
interface Host {
  readonly cores: number;
  readonly load: number;
  readonly ci: boolean;
}

/** The e2e suite's workers on `host`. */
export const workersFor = (host: Host): number =>
  Match.value(host.ci).pipe(
    Match.when(true, () => Math.min(8, host.cores)),
    Match.orElse(() => Math.max(2, Math.min(host.cores, Math.floor(host.cores - host.load)))),
  );
