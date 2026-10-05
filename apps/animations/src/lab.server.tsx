// The lab page's server entry: the lab renders the studio's shell around a
// film's Lab with it first (`LAB_SERVERS`), and `lab.ts` hydrates it and
// stages the film. It imports none of the app's films: the server draws no
// film.

export { labRender as default } from '@bible/film/lab-server';
