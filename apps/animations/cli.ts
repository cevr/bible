// The `film` CLI for this app's films: the framework's commands over
// `src/films` (`bun cli.ts --help`).

import { runFilmCli } from '@bible/film/tools';

runFilmCli({ films: `${import.meta.dir}/src/films` });
