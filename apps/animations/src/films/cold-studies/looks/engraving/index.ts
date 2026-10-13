// `engraving`: the moment as a plate in an old illustrated Bible, after
// Gustave Doré's wood engravings. Black ink on warm cream rag paper, every
// tone made of lines that follow the forms (`shader.ts`), a shaft of light
// across a dark judgment hall (`world.ts`, `court.ts`); the verse on an old
// Bible's two-column page with a gold wash for its highlight (`page.ts`);
// the card set in the same period serif (`card.ts`).

import type { Look } from '../../look.ts';
import { card } from './card.ts';
import { court } from './court.ts';
import { job } from './page.ts';

/** A print has no vignette: unlit, and none of the film's. */
export const engraving: Look = {
  court,
  job,
  card,
  light: { color: '#ffffff', amount: 0, vignette: 0 },
};
