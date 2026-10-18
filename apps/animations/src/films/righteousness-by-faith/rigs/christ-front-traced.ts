// Christ's head turned to us, as court.you's kept try draws it (try 2),
// traced by hand inside its ink in the panel's own pixels (1536 × 1024): His
// hair parted a little right of the middle and falling past both ears to His
// shoulders, both ears showing, a full beard round His chin with His mouth
// open in a smile, His eyes and brows a little tipped with His head. Each
// outline is a closed smooth path's points; the face's paper is the whole
// head, the hair, ears and beard laid over it, the beard over the hair.
// `christ-rig.ts` takes them to the cast's canon (`FRONT_PANEL`). Pure.

import type { Pt } from '@bible/film/style';

/**
 * The panel's pixels to the cast's canon: 0.35 units a pixel, which makes
 * the head as tall as court-12's (hair to the beard's foot, 137 units), about
 * the head's middle inside its ink.
 */
export const FRONT_PANEL = { scale: 0.35, head: [892, 296] } as const satisfies {
  readonly scale: number;
  readonly head: Pt;
};

/**
 * The head on court.you's ink's inner edge (the rig lays its ink outside the
 * paper): the hair's crown, its locks down both sides to the shoulders, the
 * beard's foot between them, the foot on the ink's top where the beard meets it.
 */
export const FRONT_REGION: Pt[] = [
  [880, 92],
  [905, 91],
  [931, 101],
  [950, 110],
  [970, 116],
  [986, 121],
  [1001, 131],
  [1010, 140],
  [1017, 150],
  [1022, 160],
  [1026, 170],
  [1029, 180],
  [1031, 190],
  [1033, 200],
  [1036, 210],
  [1042, 220],
  [1047, 230],
  [1051, 240],
  [1052, 255],
  [1051, 270],
  [1049, 285],
  [1050, 300],
  [1052, 315],
  [1051, 330],
  [1048, 340],
  [1046, 352],
  [1046, 365],
  [1050, 378],
  [1057, 390],
  [1058, 402],
  [1056, 412],
  [1051, 422],
  [1042, 432],
  [1028, 441],
  [1008, 446],
  [988, 448],
  [975, 456],
  [958, 468],
  [940, 475.5],
  [927, 479.5],
  [914, 480.5],
  [900, 480.5],
  [882, 477.5],
  [858, 470],
  [836, 463],
  [810, 466],
  [788, 465],
  [772, 457],
  [765, 445],
  [764, 430],
  [766, 418],
  [767, 405],
  [763, 392],
  [757, 380],
  [752, 368],
  [750, 352],
  [745, 336],
  [737, 323],
  [730, 310],
  [727, 297],
  [726, 284],
  [727, 270],
  [730, 259],
  [735, 249],
  [738, 236],
  [738, 220],
  [740, 200],
  [744, 182],
  [749, 170],
  [755, 159],
  [763, 149],
  [773, 139],
  [786, 129],
  [806, 120],
  [838, 110],
  [856, 102],
];

/**
 * The region a little larger about the head's middle (2%, 3 to 4 pixels at
 * the silhouette): the hair runs out past the face's paper to it, so no edge
 * of the face shows under the ink round it.
 */
const OVER: Pt[] = FRONT_REGION.map(([x, y]): Pt => [
  +(FRONT_PANEL.head[0] + (x - FRONT_PANEL.head[0]) * 1.02).toFixed(1),
  +(FRONT_PANEL.head[1] + (y - FRONT_PANEL.head[1]) * 1.02).toFixed(1),
]);
const at = (x: number, y: number) => FRONT_REGION.findIndex((p) => p[0] === x && p[1] === y);

/**
 * His hair: the region's crown and locks, its inner edge round His face (the
 * parting's peak at 946,150), and under the beard from cheek to cheek, where
 * the beard covers it.
 */
export const FRONT_HAIR: Pt[] = [
  ...OVER.slice(0, at(988, 448) + 1),
  [998, 425],
  [1006, 400],
  [998, 380],
  [992, 370],
  [998, 360],
  [1003, 350],
  [1007, 340],
  [1010, 330],
  [1012, 320],
  [1013, 305],
  [1012, 285],
  [1010, 270],
  [1008, 255],
  [1004, 242],
  [1001, 230],
  [998, 220],
  [995, 210],
  [991, 200],
  [981, 190],
  [969, 180],
  [960, 170],
  [953, 160],
  [946, 150],
  [941, 152],
  [933, 160],
  [921, 170],
  [905, 180],
  [883, 190],
  [851, 200],
  [812, 213],
  [789, 228],
  [777, 237],
  [772, 242],
  [771, 260],
  [772, 280],
  [772, 300],
  [774, 312],
  [777, 325],
  [781, 340],
  [784, 350],
  [788, 360],
  [793, 370],
  [800, 386],
  [808, 405],
  [822, 428],
  [836, 450],
  [836, 463],
  ...OVER.slice(at(810, 466)),
];

/**
 * His beard: up each cheek to the hair, the moustache over His mouth, round
 * under His chin on the region's own foot, so its ink's top is court.you's.
 */
export const FRONT_BEARD: Pt[] = [
  [776, 362],
  [788, 360],
  [793, 370],
  [800, 380],
  [808, 390],
  [819, 400],
  [830, 407],
  [842, 406],
  [850, 399],
  [857, 386],
  [868, 375],
  [880, 368],
  [905, 362],
  [932, 357],
  [950, 362],
  [966, 370],
  [977, 380],
  [981, 385],
  [986, 378],
  [992, 370],
  [998, 360],
  [1004, 352],
  [1016, 355],
  [1018, 375],
  [1016, 392],
  [1012, 405],
  [1004, 420],
  [992, 440],
  ...FRONT_REGION.slice(at(975, 456), at(858, 470) + 1),
  [837, 461],
  [828, 451],
  [816, 441],
  [808, 428],
  [800, 412],
  [788, 392],
  [778, 375],
];

/** His lower lip under the open smile, in the beard. */
export const FRONT_LIP: Pt[] = [
  [877.0, 399],
  [885.0, 394],
  [897.7, 392],
  [911.0, 391],
  [922.3, 388],
  [931.7, 385],
  [933.0, 393],
  [929.0, 403],
  [921.7, 412],
  [909.7, 419],
  [897.0, 422],
  [886.3, 418],
  [879.0, 409],
];

/** His ears in the hair: the near one (screen left) by His cheek, the far one at the hair's edge. */
export const FRONT_EARS = {
  near: [
    [757, 326],
    [764, 325],
    [768, 332],
    [770, 345],
    [772, 358],
    [775, 370],
    [777, 381],
    [771, 388],
    [763, 383],
    [756, 370],
    [751, 354],
    [751, 338],
  ],
  far: [
    [1033, 284],
    [1042, 286],
    [1047, 295],
    [1048, 312],
    [1046, 328],
    [1041, 342],
    [1034, 346],
    [1031, 335],
    [1030, 315],
    [1030, 295],
  ],
} satisfies Record<'near' | 'far', Pt[]>;

/**
 * The light on the hair toward the window (screen left), soft: the crown's
 * left and down the outer edge of the near lock, about a tenth of the hair.
 */
export const FRONT_SHEEN: Pt[] = [
  [758, 160],
  [784, 136],
  [820, 120],
  [856, 112],
  [870, 118],
  [846, 128],
  [812, 144],
  [790, 166],
  [776, 198],
  [766, 232],
  [760, 270],
  [758, 310],
  [752, 340],
  [738, 330],
  [730, 290],
  [732, 250],
  [742, 210],
  [750, 180],
];

/**
 * The hair's lit chestnut, cut: the band court.you paints just inside the
 * ink on the crown's left and down the near side to the ear's top
 * (878,100 to 727,280), 35 pixels wide on the crown and 10 down the side,
 * #d08445 at its peak (0.82 in value); FRONT_SHEEN's soft light falls off
 * inside it. Clipped to the hair.
 */
export const FRONT_LIT: Pt[] = [
  [860, 94],
  [838, 103],
  [806, 113],
  [783, 124],
  [767, 134],
  [756, 145],
  [748, 156],
  [742, 167],
  [737, 178],
  [734, 190],
  [733, 200],
  [732, 240],
  [728, 250],
  [722, 262],
  [720, 284],
  [731, 284],
  [735, 270],
  [741, 260],
  [747, 250],
  [749, 240],
  [748, 225],
  [750, 210],
  [753, 200],
  [757, 190],
  [762, 180],
  [775, 170],
  [787, 160],
  [789, 150],
  [803, 140],
  [828, 130],
  [845, 120],
  [859, 110],
  [878, 100],
  [882, 94],
];

/**
 * The shade the beard lays on the locks beside it: court.you's dark band
 * between the beard's edge and each lock (0.13 to 0.17 in value, about 12
 * pixels wide), near from 798,404 down to the jaw's ink and far from 1017,378
 * down to it, both starting clear of the ears and the cheeks' skin. Each band's inner edge runs under the
 * beard, which covers it; clipped to the hair.
 */
export const FRONT_BEARD_SHADOW = {
  near: [
    [798, 404],
    [803, 412],
    [812, 430],
    [820, 441],
    [832, 451],
    [842, 462],
    [848, 482],
    [838, 482],
    [828, 470],
    [818, 460],
    [810, 450],
    [803, 440],
    [797, 429],
    [792, 418],
  ],
  far: [
    [1017, 378],
    [1013, 386],
    [1012, 392],
    [1008, 405],
    [1000, 420],
    [988, 440],
    [982, 452],
    [978, 470],
    [960, 478],
    [972, 480],
    [990, 466],
    [998, 452],
    [1006, 440],
    [1014, 430],
    [1019, 420],
    [1023, 410],
    [1026, 400],
    [1029, 390],
    [1027, 382],
  ],
} satisfies Record<'near' | 'far', Pt[]>;

/**
 * The locks beside the beard, a darker brown than the hair, the beard's shade
 * band (FRONT_BEARD_SHADOW) between each and the beard, so the beard reads as
 * a U inside them by value (hair has no ink of its own): each runs
 * from the silhouette to the beard's edge; the beard, laid over the hair,
 * covers what lies past its edge.
 */
export const FRONT_LOCKS = {
  near: [
    [736, 352],
    [776, 360],
    [778, 375],
    [788, 392],
    [800, 412],
    [808, 428],
    [816, 441],
    [828, 451],
    [837, 461],
    [842, 484],
    [736, 484],
  ],
  far: [
    [1004, 346],
    [1016, 352],
    [1018, 375],
    [1016, 392],
    [1012, 405],
    [1004, 420],
    [992, 440],
    [986, 452],
    [984, 476],
    [1072, 476],
    [1072, 340],
  ],
} satisfies Record<'near' | 'far', Pt[]>;

/** The beard's lit third toward the window (screen left), soft. */
export const FRONT_BEARD_LIT: Pt[] = [
  [760, 340],
  [826, 352],
  [842, 400],
  [846, 500],
  [760, 500],
];

/**
 * His skin in the robe's V under the beard, as court.you draws it: 131
 * pixels across 4 under the beard's foot, narrowing to its point at
 * (928, 556); its top runs up under the beard.
 */
export const FRONT_NECK: Pt[] = [
  [833, 468],
  [1023, 468],
  [993.5, 500],
  [984, 510],
  [973.5, 520],
  [963, 530],
  [951.5, 540],
  [939, 550],
  [928, 556],
  [917, 550],
  [904.5, 540],
  [893, 530],
  [882.5, 520],
  [872, 510],
  [862.5, 500],
];

/**
 * The robe's sides under His locks, as court.you draws them on its ink's
 * inner edge (the rig lays its ink outside the paper): the far shoulder
 * (screen right) from under the far lock down to where His far hand covers
 * it, and the near shoulder from where His held-out hand covers it up under
 * the near lock.
 */
export const FRONT_ROBE_SIDES = {
  far: [
    [1070, 480],
    [1085, 490],
    [1096, 500],
    [1105, 510],
    [1111, 520],
    [1123, 540],
    [1133, 560],
    [1142, 580],
    [1150, 600],
    [1158, 620],
    [1165, 640],
    [1172, 660],
    [1178, 680],
  ],
  near: [
    [703, 600],
    [711, 580],
    [719, 560],
    [729, 540],
    [742, 520],
    [750, 510],
    [760, 500],
    [773, 490],
    [790, 480],
  ],
} satisfies Record<'far' | 'near', Pt[]>;

/**
 * The gold sash's edges as court.you draws them, from the far shoulder
 * across the chest toward the near hip: the right edge on the robe's own
 * edge to 530, then away from it; the left edge until the held-out hand
 * covers it; each again under the dock's rail, between its balusters.
 */
export const FRONT_SASH = {
  right: [
    [1118, 480],
    [1112, 510],
    [1104, 530],
    [1102, 550],
    [1099, 570],
    [1095, 590],
    [1092, 610],
    [1087, 630],
    [1082, 650],
    [1077, 670],
    [1071, 690],
    [1064, 710],
    [1058, 730],
    [1051, 750],
    [1044, 770],
    [1036, 790],
    [940, 990],
  ],
  left: [
    [1007, 470],
    [1002, 490],
    [994, 510],
    [987, 530],
    [979, 550],
    [970, 570],
    [961, 590],
    [951, 610],
    [941, 630],
    [930, 650],
    [919, 670],
    [907, 690],
    [735, 960],
    [706, 1005],
  ],
} satisfies Record<'right' | 'left', Pt[]>;

/** The neck's top in the beard's shadow. */
export const FRONT_NECK_SHADE: Pt[] = [
  [833, 468],
  [1023, 468],
  [988, 506],
  [867, 506],
];

/** His face's marks, panel pixels: each eye's centre and size, each brow's ends and stroke, the mouth's ends and stroke. */
export const FRONT_MARKS = {
  eyes: [
    [845, 315],
    [939.5, 295.5],
  ],
  eye: [24, 38.5],
  brows: [
    [
      [806, 273],
      [850, 257],
    ],
    [
      [915, 248],
      [963, 246],
    ],
  ],
  brow: 12,
  mouth: [
    [878, 395],
    [932, 388],
  ],
  mouthLine: 10,
} as const;
