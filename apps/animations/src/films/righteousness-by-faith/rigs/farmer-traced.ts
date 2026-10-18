// The farmer as rain.rain's kept try draws him (try 2), traced by hand inside
// its ink in the panel's own pixels (1536 × 1024): his head turned three-
// quarters to his left (screen right) and tipped up toward the rain, his
// headcloth with its brown band across his brow and its flap down over his
// near shoulder, the dark edge of the cloth down his near cheek, his round
// beard with his mouth in it; his tunic and vest turned with his shoulders;
// his hands free beside him, the far one raised. Each outline is
// a closed smooth path's points (the rig runs a Catmull-Rom path through
// them). Where two papers meet, the one behind runs on under the one in
// front: the face under the band, the cloth and the beard; the cloth under
// the band; the rig tucks each a little further (`tucked`). `farmer-rig.ts`
// takes them to the cast's canon (`PANEL`). Pure.

import type { Pt } from '@bible/film/style';

/**
 * The panel's pixels to the cast's canon: 0.555 units a pixel, about his
 * head's centre (the head's papers) or his feet (the body's), his feet 450
 * units under his headcloth's top as the cast's height band stands him,
 * below the panel's foot (it cuts him at his knees).
 */
export const PANEL = { scale: 0.555, head: [445, 410], feet: [440, 1100.5] } as const satisfies {
  readonly scale: number;
  readonly head: Pt;
  readonly feet: Pt;
};

/** His headcloth, its outer edge on the inner edge of the panel's ink: the cap over his head down to the band, and the flap down his near side over his shoulder, cut square at its foot; its inner edge runs under the band and down his near cheek. */
export const CLOTH: Pt[] = [
  [304, 412],
  [312, 400],
  [314, 385],
  [318, 370],
  [326, 355],
  [336, 343],
  [350, 330],
  [365, 319],
  [380, 310],
  [395, 304],
  [410, 300],
  [425, 298],
  [440, 297],
  [455, 301],
  [470, 306],
  [484, 314],
  [496, 322],
  [500, 332],
  [480, 332],
  [440, 330],
  [405, 336],
  [388, 348],
  [387, 400],
  [385, 460],
  [384, 520],
  [383, 552],
  [345, 560],
  [315, 568],
  [285.8, 601.7],
  [252.5, 651.7],
  [240, 684],
  [236, 695],
  [215, 697],
  [207, 684],
  [208, 660],
  [219, 635],
  [229, 610],
  [241, 585],
  [253, 560],
  [265, 535],
  [273, 520],
  [281, 505],
  [289, 490],
  [296, 475],
  [305, 460],
  [313, 445],
  [311, 430],
];

/**
 * The cloth's dark edge down his near cheek, from the band to his shoulder,
 * as the panel paints it: 9 pixels at his eyes, widening to his jaw beside
 * the beard, then narrowing under the beard so that it and the head's ink
 * read as the one dark band the panel draws down to the vest (19 pixels).
 * A paper of its own over the cloth, its inner side 2 pixels past the
 * cloth's edge, so the face tucks under it and no cloth shows between it
 * and the ink. Its sides carry points along their length so the smooth path
 * keeps to them.
 */
export const CLOTH_EDGE: Pt[] = [
  [374, 372],
  [391, 356],
  [390, 380],
  [389, 420],
  [388, 460],
  [392, 480],
  [393, 500],
  [392, 520],
  [391, 536],
  [389, 548],
  [384, 551],
  [382, 550],
  [382, 530],
  [381, 512],
  [376, 498],
  [370, 485],
  [369, 470],
  [372, 450],
  [374, 430],
  [376, 410],
  [377, 392],
];

/** The band round his head, measured on the panel's columns: across his brow from the knot at his far temple, dropping steeply round his near side, thickening to its end at the back of his head. */
export const BAND: Pt[] = [
  [508, 324],
  [500, 320],
  [485, 315],
  [470, 312],
  [455, 313],
  [440, 315],
  [425, 319],
  [410, 326],
  [395, 330],
  [380, 337],
  [365, 347],
  [352, 357],
  [343, 367],
  [335, 377],
  [327, 385],
  [320, 392],
  [314, 400],
  [309, 411],
  [306, 421],
  [307, 430],
  [312, 433],
  [318, 424],
  [327, 412],
  [336, 405],
  [350, 399],
  [361, 391],
  [370, 383],
  [383, 370],
  [400, 357],
  [418, 347],
  [436, 341],
  [455, 336],
  [470, 333],
  [485, 333],
  [500, 336],
  [509, 337],
];

/** The band's near end, lit on its outer side where it turns round his head toward the window: laid on the band. */
export const BAND_LIT: Pt[] = [
  [352, 352],
  [350, 362],
  [342, 372],
  [335, 382],
  [328, 391],
  [321, 402],
  [316, 414],
  [313, 426],
  [311, 436],
  [298, 436],
  [298, 380],
  [330, 355],
];

/**
 * The headcloth's front edge showing under the band across his brow, as
 * rain.rain paints it: a tan strip 9 pixels deep along the band's lower edge.
 * Laid on his face, under the band.
 */
export const CLOTH_BROW: Pt[] = [
  [383, 368],
  [400, 355],
  [418, 345],
  [436, 339],
  [455, 334],
  [470, 331],
  [485, 331],
  [500, 334],
  [512, 335],
  [512, 346],
  [500, 345],
  [485, 342],
  [470, 342],
  [455, 345],
  [436, 350],
  [418, 356],
  [400, 366],
  [383, 379],
];

/** His face's paper: from under the band, its far edge the silhouette, under the beard and the cloth's edge. */
export const FACE: Pt[] = [
  [401, 338],
  [429, 332],
  [457, 331],
  [484, 332],
  [500, 337],
  [505, 346],
  [506, 357],
  [510, 370],
  [515, 385],
  [520, 400],
  [526, 425],
  [531, 450],
  [537, 470],
  [541, 490],
  [530, 500],
  [500, 505],
  [460, 505],
  [420, 495],
  [390, 480],
  [376, 470],
  [376, 420],
  [378, 370],
  [385, 350],
];

/**
 * The shade down the far side of his nose, the nose turned toward screen
 * right: a chevron under his far eye, its point out toward his far cheek
 * (the panel's: half an eye spacing below the eyes, half an eye spacing
 * across). Laid on his face.
 */
export const NOSE: Pt[] = [
  [494, 401],
  [504, 409],
  [512, 416],
  [517, 424],
  [511, 433],
  [502, 441],
  [494, 448],
  [489, 444],
  [497, 437],
  [504, 431],
  [507, 424],
  [503, 418],
  [497, 412],
  [490, 405],
];

/**
 * The shade down his near cheek, against the cloth's edge: a wedge, 5
 * pixels wide 15 under the band, 8 at his eyes, 16 at mid-nose and about
 * 30 at the beard, its inner edge a slant (the panel's samples). Laid on
 * his face; `CHEEK_SOFT`, a step between it and the lit skin, softens its
 * inner edge.
 */
export const CHEEK_SHADE: Pt[] = [
  [372, 378],
  [388, 381],
  [391, 385],
  [393, 392],
  [395, 400],
  [397, 408],
  [400, 415],
  [403, 421],
  [406, 428],
  [409, 436],
  [412, 444],
  [415, 452],
  [418, 460],
  [421, 468],
  [424, 476],
  [424, 500],
  [372, 500],
  [372, 440],
];

/** The cheek shade's inner edge, 4 pixels wider: a half step from the shade to the lit skin, laid under it. */
export const CHEEK_SOFT: Pt[] = CHEEK_SHADE.map(([x, y], i): Pt =>
  i >= 1 && i <= 15 ? [x + 4, y + (i === 1 ? -1 : 0)] : [x, y],
);

/** His beard: round under his jaw, up his near cheek to the cloth, his moustache over his mouth. */
export const BEARD: Pt[] = [
  [376, 440],
  [385, 441],
  [401, 457],
  [421, 472],
  [443, 487],
  [451, 472],
  [460, 455],
  [477, 444],
  [493, 440],
  [510, 442.5],
  [527, 452],
  [538, 460],
  [543, 470],
  [544, 490],
  [541, 500],
  [532, 509],
  [513, 522],
  [485, 527],
  [457, 526],
  [429, 517.5],
  [402, 502],
  [385, 486],
  [375, 468],
];

/** His lower lip under the smile, in the beard. */
export const LIP: Pt[] = [
  [468, 488],
  [472, 472],
  [485, 463],
  [502, 459],
  [515, 463],
  [523, 471],
  [516, 480],
  [494, 485],
];

/** His face's marks, panel pixels: each eye's centre and size, each brow's ends, the mouth's ends and its middle. */
export const MARKS = {
  eyes: [
    [443.9, 406.4],
    [497.5, 395.3],
  ],
  eye: [12, 26],
  brows: [
    [
      [415, 382],
      [437, 368],
    ],
    [
      [476, 361],
      [497, 363],
    ],
  ],
  brow: 7.8,
  mouth: [
    [480, 472],
    [509, 468],
  ],
  mouthLine: 4.5,
} as const;

/** His tunic: from under his beard, the neck's far side down to his shoulders turned, his near side under his sleeve, his far side straight down past his raised arm to the hem. */
export const TUNIC: Pt[] = [
  [380, 476],
  [420, 492],
  [460, 503],
  [488, 512],
  [496, 532],
  [508, 552],
  [528, 566],
  [548, 580],
  [565, 620],
  [578, 680],
  [588, 760],
  [598, 860],
  [609, 960],
  [616, 1024],
  [618, 1064],
  [430, 1070],
  [240, 1064],
  [240, 1010],
  [238, 950],
  [236, 880],
  [234, 820],
  [236, 760],
  [240, 705],
  [248, 660],
  [264, 622],
  [290, 592],
  [320, 572],
  [350, 548],
];

/** His vest's near front, from his shoulder to the hem, its outer edge where the panel draws it, widening below his hand's height to his side. */
export const VEST_NEAR: Pt[] = [
  [322, 568],
  [345, 558],
  [381, 556],
  [389, 610],
  [393, 660],
  [393, 710],
  [399, 760],
  [401, 885],
  [402, 1080],
  [244, 1080],
  [246, 1010],
  [262, 960],
  [276, 925],
  [300, 895],
  [330, 868],
  [336, 800],
  [336, 720],
  [332, 640],
  [326, 598],
];

/** His vest's far front, turned from the light. */
export const VEST_FAR: Pt[] = [
  [500, 552],
  [512, 580],
  [517, 620],
  [517, 660],
  [524, 710],
  [530, 760],
  [535, 810],
  [543, 885],
  [550, 960],
  [556, 1080],
  [620, 1080],
  [612, 1000],
  [600, 880],
  [590, 780],
  [582, 700],
  [568, 640],
  [548, 592],
  [522, 566],
];

/** The tunic's far half between the vest's fronts, past its crease, which slants from under his neck down toward his near knee as the panel draws it. */
export const TUNIC_FOLD: Pt[] = [
  [476, 600],
  [500, 600],
  [517, 660],
  [524, 710],
  [530, 760],
  [535, 810],
  [543, 885],
  [550, 960],
  [556, 1080],
  [398, 1080],
  [403, 960],
  [421, 885],
  [441, 810],
  [455, 760],
  [468, 710],
  [481, 660],
];

/** His neck in the tunic's V under his beard, the V's point sharp (its points close about it). */
export const NECK: Pt[] = [
  [376, 470],
  [500, 500],
  [497, 555],
  [474, 597],
  [467, 608],
  [461, 603],
  [420, 578],
  [380, 552],
];

/**
 * His hands' centres, free circles as the cast's hands are: the near one
 * over his near vest; the far one over his far vest at rest, clear of his
 * outline, raised to the panel's open hand beside him as the rain comes on.
 */
export const HANDS = {
  near: [330, 815],
  far: [522, 845],
  raised: [690, 655],
} as const satisfies Record<string, Pt>;
