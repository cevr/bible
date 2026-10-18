// A film's studio page's server entry: the lab renders the studio's frame
// with it first (`LAB_SERVERS`), and `play.ts` hydrates it and stages the
// film. It imports none of the app's films: the server draws no film.

export { studioRender as default } from '@bible/film/play-server';
