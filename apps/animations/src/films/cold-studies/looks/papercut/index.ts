// `papercut` and `papercutgl`: the control's courtroom (`cutpaper`) with both
// its people drawn as Rive rigs in the paper-cut figure language (the film
// skill's director vision, "Paper-cut figures (Rive)"): circle hands, a face
// of brow, eye and mouth line, each piece of paper creased once by the light
// and shaded with colour. The accused and the judge act on the court's cues
// (`looks/rive/`). `papercut` draws them with Rive's Canvas 2D renderer on
// our context; `papercutgl` with the Rive Renderer on WebGL 2, composited in
// (where each piece's small cast shadow is soft).
//
// The figures are K1, the owner's pick (2026-10-13), frozen in `figures.riv`:
// a thick outline with a light core, warm ink, a hue per garment, the head
// about ⅓. The props match them (`PROPS`).

import type { RiveEngine } from '@bible/film/rive';
import { LIGHT } from '../../../righteousness-by-faith/light.ts';
import type { Look } from '../../look.ts';
import { hues, ramps } from '../../palette.ts';
import { type Props, courtWith } from '../cutpaper/court.ts';
import { card, job } from '../cutpaper/job.ts';
import { riveAccused } from '../rive/accused.ts';
import { riveJudge } from '../rive/judge.ts';
import { accusedProp, handProp, judgeProp } from '../rive/rigs.ts';

/** The court's props in K1: the bench, its rim, panels and block in walnut, the sheets in their four papers, every line in the figures' warm ink. */
const PROPS: Props = {
  bench: hues.bench,
  rim: hues.rim,
  panel: hues.panel,
  block: hues.block,
  sheets: hues.sheets,
  sheetInk: ramps.ink.base,
  blockInk: ramps.ink.base,
  gavelInk: ramps.ink.base,
};

/** The look on `engine`: the court's two people, and the judge's hand, as rigs, among its props. */
const papercutOn = (engine: RiveEngine): Look => ({
  court: courtWith(riveAccused, riveJudge, PROPS),
  rigs: { accused: accusedProp(engine), judge: judgeProp(engine), hand: handProp(engine) },
  job,
  card,
  light: LIGHT.room,
});

export const papercut = papercutOn('canvas');
export const papercutgl = papercutOn('webgl2');
