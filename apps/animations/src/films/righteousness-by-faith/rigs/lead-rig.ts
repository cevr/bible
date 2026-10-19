// The plain lead (character-design 2.3), composed of the house's parts
// (`figure`): a round head on a tunic, stub legs, one lilac-grey paper, no
// hair, no neck; Kit A at his size; the stain on his tunic and the white
// robe he is given over it. His circle hands are drawn by the host where they
// work (on the dock's rail, over the stain), each from its own artboard
// (`drawHand`), so the rig is the body alone. How each part is cut, lit and
// drawn is the house's (`drawFigure`). The owner locked him (ask
// `a92f276635e`, 2026-10-17): `lead.lock.json` holds his print, and only an
// override citing the owner's decision on him, filed after the lock, frees
// a change to it (FigureLock, `@bible/film/style`'s `lock.ts`).
//
// Units are the Board's pixels (a panel is 1536 × 1024): in `cold.evidence`
// he stands 373 tall, his head 146 across. His feet are the artboard's
// origin.
//
// The host poses him by the view model `Lead`, every frame:
// - the face kit's numbers (`FACE`), and `faceY`, units, the marks slid down
//   the round as he bows (the face drawn on a flat head turns by its marks);
// - `lean`, radians about his feet; `tilt`, radians, his head about his
//   neck; `nod`, units, his head sinking toward his tunic (a bow);
// - `stain`, the scarlet blot on his tunic, 0..1; `robe`, the white tunic
//   laid over his own, 0..1.
// The rig keeps its `breath` and the paper's `boil`.

import {
  GivenRobe,
  Hands,
  Head,
  KitA,
  Stain,
  Stance,
  Stature,
  StubLegs,
  Tunic,
  figure,
  tunicOutline,
} from '@bible/film/style';
import LEAD_LOCK from './lead.lock.json' with { type: 'json' };
import { PAPERS, STAIN } from './papers.ts';

/** His measures, units: height, head (its middle, half-width and half-height), neck (the tunic's top under the head), hem. */
export const LEAD = {
  height: 373,
  head: { y: -300, r: [73, 72] },
  neck: -236,
  hem: -42,
  /** Where the stain's middle sits on his tunic, and its half-width and half-height. */
  stain: { x: -6, y: -168, rx: 31, ry: 42 },
} as const;

/**
 * The stain's soaked edge: each ring's size against the blot and its
 * opacity, inner first. Every ring wanders as the blot does (one seed), so
 * the rings nest into one feathered edge.
 */
const SOAK = [
  [1.03, 0.5],
  [1.06, 0.3],
  [1.09, 0.15],
] as const;

/** His breath: 4 s in and out, his trunk 1.2% taller from the hem at its top, his neck 2 units up with it. */
const BREATH = { period: 4, trunk: 1.012, neck: -2 } as const;

/** His tunic: narrow at the neck (0.62 of his head across), wide at the hem, its sides bowed out, its corners rounded. */
const TUNIC_PART = Tunic({
  neck: LEAD.neck,
  hem: LEAD.hem,
  half: { neck: 41, hem: 75 },
  radius: 22,
  bow: 4,
  paper: PAPERS.lead,
});

/** His tunic's outline, units from his feet, as the house cuts it: the within scene traces inside it. */
export const TUNIC = tunicOutline(TUNIC_PART);

/**
 * The plain lead. His face is Kit A's marks as his sheet draws them
 * (`1-the-lead-sheet`, by its head's width) at cold-34's size: tall oval
 * eyes 0.09 across and 0.17 high, 0.30 apart, at the head's middle; short
 * brows 0.13 long and 0.04 thick, 0.25 above it; the mouth a quarter of its
 * width below it. His face is drawn on a flat round, so it turns by its
 * marks alone: they slide up to 0.11 of the head across toward what he
 * watches (`turn`), as cold-34 carries them toward the bench; at rest his
 * eyes are on us. His tunic is narrow at the neck (0.62 of his head across)
 * and wide at the hem, cold-34 widening it fast below the shoulders and
 * slower to the hem; his legs stand under it as cold-34 stands them, each
 * 28 units across, their inner edges all but touching, their feet round.
 * His hands are 0.34 of his head across, as the concept draws them.
 */
export const lead = figure({
  // The owner locked him (ask `a92f276635e`): his print is the one this lock holds.
  lock: LEAD_LOCK,
  // `film match`'s concept: the plain lead's model sheet, his front view.
  concept: {
    image: { set: 'rbf-v3-concepts-2026-10-15', file: 'images/0-plain-lead-sheet.png' },
    box: [165, 370, 455, 785],
  },
  // Room round him for his head's tilt and his outline; his feet are the rig's origin.
  art: { width: 360, height: 470, feet: [180, 440] },
  stature: Stature.PlainLead(),
  stance: Stance.Standing({ breath: BREATH }),
  head: Head.Round({ y: LEAD.head.y, r: LEAD.head.r, neck: LEAD.neck, paper: PAPERS.leadHead }),
  face: KitA({
    x: 0,
    y: 12,
    scale: 1.75,
    shape: {
      eye: [7.9, 13.9],
      eyes: [-14.2, 15.2],
      brows: [-15.2, 16.2],
      browY: -29.9,
      browHalf: 5.3,
      brow: 3.15,
      turn: 9.2,
    },
    gaze: [0, 12],
  }),
  body: TUNIC_PART,
  states: [
    GivenRobe(PAPERS.robe),
    Stain({
      at: [LEAD.stain.x, LEAD.stain.y],
      r: [LEAD.stain.rx, LEAD.stain.ry],
      soak: SOAK,
      seed: 11,
      paper: STAIN,
    }),
  ],
  feet: StubLegs({ x: 23.5, r: 14, paper: PAPERS.lead }),
  hands: Hands({ paper: { ...PAPERS.lead, rim: 3.5 }, share: 0.34 }),
});

/** The view model's numbers at rest: the face kit's, his eyes on us, upright, stained, in his own tunic. */
export const LEAD_KNOBS = lead.knobs;

/** The face `check` reads (`RivePropSpec.face`): its node, and his head's height, its width as the sheet measures it. */
export const LEAD_FACE_CHECK = { node: 'face', height: 2 * LEAD.head.r[0] } as const;
