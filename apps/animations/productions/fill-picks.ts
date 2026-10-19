/**
 * `bun run fill-picks`: the owner's picks filed onto each decision on this
 * app's ledgers (here, `productions/`) that names its ask and carries none,
 * from the ask's record in the app's lab (`lab/asks/`), so an override may
 * cite his pick (`@bible/film/tools` `runFillPicks`). A line per such
 * decision, filled or left and why: a decision whose record is not there is
 * left as it is. Run again, it writes nothing. FILMS_PRODUCTIONS and
 * FILMS_LAB move the folders.
 */
import { runFillPicks } from '@bible/film/tools';
import { FOLDERS } from '../cli.ts';

if (import.meta.main) runFillPicks(FOLDERS);
