// `ps1`: late-90s PlayStation 3D, the world of the owner's editing
// reference ("real life"): a courtroom built from boxes, low-poly people
// with big heads and simple faces, drawn at 320 × 180 and scaled up
// nearest-neighbour, every vertex snapped to that grid, textures mapped
// affinely, lit at the vertices, fogged, dithered to 15-bit colour
// (`shade.ts`); a slow game camera cut on the take's marks (`court.ts`);
// Job's verse in pixel type on a Bible's page, and the reference's card
// (`job.ts`). The look lights itself, so it takes no act light.

import type { Look } from '../../look.ts';
import { court } from './court.ts';
import { card, job } from './job.ts';

export const ps1: Look = { court, job, card };
