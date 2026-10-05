// A film's Scenes and Play pages' server entry: the lab renders the
// studio's shell around them with it first (`LAB_SERVERS`), and `play.ts`
// hydrates it and stages the film. It imports none of the app's films: the
// server draws no film.

export { playRender as default } from '@bible/film/lab-server';
