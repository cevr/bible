// The review page's server entry: the lab renders the review with it first
// (`LAB_SERVERS`), and `review.ts` hydrates it. It imports none of the app's
// films: a film's Project draws its stills in the browser.

export { reviewRender as default } from '@bible/film/review-server';
