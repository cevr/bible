/**
 * The films the list can send, named as `bun run mail:send` names them: a
 * series' id and a film's number (`path/01`). On the site they are the
 * episodes in `../content.ts` (`layerSite`), so a Worker can send only a film
 * the site it was deployed with lists; the tests name films of their own
 * (`layerOf`).
 */
import { Context, Layer, Option } from 'effect';

import { type Episode, type Series, SERIES } from '../content.ts';

export interface Film {
  /** `<series id>/<no>`, the key its sends are recorded under. */
  readonly ref: string;
  readonly series: Series;
  readonly episode: Episode;
}

export interface FilmsService {
  readonly find: (ref: string) => Option.Option<Film>;
}

export class Films extends Context.Service<Films, FilmsService>()('firsttheblade/Films') {}

/** The film `ref` names among `series`' episodes. */
const filmIn = (series: ReadonlyArray<Series>, ref: string): Option.Option<Film> => {
  const [id, no, ...rest] = ref.split('/');
  if (rest.length > 0) return Option.none();
  const found = Option.fromNullishOr(series.find((candidate) => candidate.id === id));
  return Option.flatMap(found, (one) =>
    Option.map(
      Option.fromNullishOr(one.episodes.find((episode) => episode.no === no)),
      (episode): Film => ({ ref: `${one.id}/${episode.no}`, series: one, episode }),
    ),
  );
};

export const layerOf = (series: ReadonlyArray<Series>) =>
  Layer.succeed(Films, Films.of({ find: (ref) => filmIn(series, ref) }));

export const layerSite = layerOf(SERIES);
