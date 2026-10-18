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
 * as narrow as the panel draws it (9 pixels at his eyes, 18 at his jaw):
 * laid on the cloth. Its sides carry points along their length so the smooth
 * path keeps to them.
 */
export const CLOTH_EDGE: Pt[] = [
  [377, 376],
  [386, 372],
  [386, 420],
  [384, 460],
  [385, 490],
  [383, 520],
  [381, 548],
  [364, 548],
  [365, 520],
  [369, 490],
  [372, 460],
  [376, 420],
];

/** The band round his head, measured on the panel's columns: across his brow from the knot at his far temple, dropping steeply round his near side, thickening to its end at the back of his head. */
export const BAND: Pt[] = [
  [508, 328],
  [500, 324],
  [485, 318],
  [470, 314],
  [455, 314],
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
  [455, 337],
  [470, 336],
  [485, 337],
  [500, 340],
  [509, 341],
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

/** The shade down the near side of his nose, the nose turned toward screen right: a crescent on his face. */
export const NOSE: Pt[] = [
  [486, 401],
  [496, 410],
  [504, 421.7],
  [497, 432],
  [486.4, 440],
  [491, 429],
  [495, 421],
  [490, 411],
];

/**
 * The shade down his near cheek, by the cloth's edge: narrow under the band,
 * widening down to his beard, its inner edge a slant (the panel's samples:
 * shade to x 397 at y 400, to 410 at 440, to 425 at 460). Laid on his face.
 */
export const CHEEK_SHADE: Pt[] = [
  [372, 378],
  [386, 380],
  [397, 386],
  [399, 410],
  [404, 432],
  [414, 450],
  [428, 464],
  [440, 476],
  [440, 500],
  [400, 500],
  [372, 486],
  [372, 430],
];

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
  eye: [12, 23],
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
  brow: 6.5,
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
 * His hands' centres, free beside him as the cast's hands are, where the
 * panel draws them: the near one at his near side; the far one low at his
 * far side, raised to the panel's open hand as the rain comes on.
 */
export const HANDS = {
  near: [330, 815],
  far: [600, 830],
  raised: [690, 655],
} as const satisfies Record<string, Pt>;
