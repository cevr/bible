// `papercut` and `papercutgl`: the control's courtroom (`cutpaper`) with both
// its people drawn as Rive rigs in the paper-cut figure language (the film
// skill's director vision, "Paper-cut figures (Rive)"): circle hands, a face
// of brow, eye and mouth line, each piece of paper creased once by the light
// and shaded with colour. The accused and the judge are built from the same
// parts (`looks/rive/parts.ts`) and act on the court's cues. `papercut` draws
// them with Rive's Canvas 2D renderer on our context; `papercutgl` with the
// Rive Renderer on WebGL 2, composited in (where each piece's small cast
// shadow is soft).
//
// The figures' edge, ink, colour and head, and the props' colour, follow the
// four art-direction axes in `looks/rive/direction.ts`. PROVISIONAL: they are
// set to K1 (A3 thick outline with a light core, B1 warm ink, C2 garment
// hues, D2 head about ⅓) until the owner picks.

import type { RiveEngine } from '@bible/film/rive';
import { LIGHT } from '../../../righteousness-by-faith/light.ts';
import type { Look } from '../../look.ts';
import { courtWith } from '../cutpaper/court.ts';
import { card, job } from '../cutpaper/job.ts';
import { riveAccused } from '../rive/accused.ts';
import { DIRECTION, propsOf } from '../rive/direction.ts';
import { riveJudge } from '../rive/judge.ts';
import { accusedProp, handProp, judgeProp } from '../rive/rigs.ts';

/** The look on `engine`: the court's two people, and the judge's hand, as rigs, among its props. */
const papercutOn = (engine: RiveEngine): Look => ({
  court: courtWith(riveAccused, riveJudge, propsOf(DIRECTION)),
  rigs: { accused: accusedProp(engine), judge: judgeProp(engine), hand: handProp(engine) },
  job,
  card,
  light: LIGHT.room,
});

export const papercut = papercutOn('canvas');
export const papercutgl = papercutOn('webgl2');
