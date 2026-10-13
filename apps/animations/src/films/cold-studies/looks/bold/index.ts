// `bold`: the far-out fifth, a kinetic poster. The moment is drawn as a
// title sequence would draw it: flat fields of four inks (bone, slate, deep
// slate, ink) with hard edges, no line, no shadow and no texture of its own;
// people built from discs, bars and chamfered blocks, faces still a dot, a
// brow and a mouth; motion that slams and stops dead instead of drifting;
// hard cuts on the cues; and type used as the picture (the hollow verdict,
// the book and verse set huge, the card). The colour script keeps its
// meanings: scarlet only on the accused's garment, gold only on the verdict
// and the Word. No act light: flat inks are their own light, and the film's
// vignette alone sits over them.

import type { Look } from '../../look.ts';
import { court } from './court.ts';
import { card, job } from './job.ts';

export const bold: Look = { court, job, card };
