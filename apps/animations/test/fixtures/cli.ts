// The app's `film` CLI over the fixture films (`films/`), so the framework's
// commands are tested on a synthetic film, never on a real one. The player
// page knows only the app's own films: drive the legs that need no page.

import { appCli } from '../../cli.ts';

/** The fixture films folder. */
export const FIXTURE_FILMS = `${import.meta.dir}/films`;

if (import.meta.main) appCli(FIXTURE_FILMS, import.meta.path);
