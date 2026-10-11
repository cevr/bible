// The engraved courtroom, built once: a stone judgment hall in the manner of
// an old illustrated Bible. A tall arched window high in the left wall
// throws a shaft across the dark hall onto the floor between the accused and
// the bench; a rose window in the back wall, behind and above the judge, is
// the verdict's light. Massive turned columns stand in two rows; the judge
// sits enthroned on a dais behind his bench, bearded and turbaned, a gavel
// in his hand; the accused stands below on the flags, wrists bound, the
// stain on his robe the print's one hand-tinted colour, the evidence piling
// on a stone table at his side. Metres; +z toward the eye, y up.

import {
  Group,
  Mesh,
  type BufferGeometry,
  type Material,
  type Object3D,
  TorusGeometry,
} from 'three';
import { rng } from '@bible/film/core';
import { type HallLight, burin } from './burin.ts';
import {
  type Profile,
  block,
  folds,
  path,
  head as sculpted,
  swept,
  taper,
  turned,
} from './shapes.ts';

/** The colour script's scarlet, as a watercolour wash on the print. */
const SCARLET: readonly [number, number, number] = [0.72, 0.13, 0.1];

/** Where the people stand. */
export const ACCUSED_AT = [-2.4, 0, -0.6] as const;
export const JUDGE_AT = [2.5, 0.75, -7.0] as const;
/** The judgment seat's height over the dais, and the bench's. */
const SEAT = 0.6;
const BENCH = 0.95;
/** The evidence table's top. */
export const EVIDENCE_AT = [-3.55, 0.5, -1.2] as const;

/** The accused, posed each frame through these. */
export interface Accused {
  readonly root: Group;
  readonly torso: Group;
  readonly head: Group;
}

/** The judge, posed each frame through these. */
export interface Judge {
  readonly root: Group;
  readonly torso: Group;
  readonly head: Group;
  readonly arm: Group;
}

/** One item of evidence and where it comes to rest. */
export interface Exhibit {
  readonly mesh: Mesh;
  readonly rest: readonly [number, number, number];
  readonly yaw: number;
  readonly roll: number;
}

export interface World {
  readonly scene: Group;
  /** What casts the window's shadow (the walls and ceiling do not). */
  readonly casters: ReadonlyArray<Object3D>;
  readonly blind: ReadonlyArray<Object3D>;
  readonly accused: Accused;
  readonly judge: Judge;
  readonly evidence: ReadonlyArray<Exhibit>;
}

const mesh = (g: BufferGeometry, m: Material, x = 0, y = 0, z = 0): Mesh => {
  const o = new Mesh(g, m);
  o.position.set(x, y, z);
  return o;
};

/** A column: base, shaft with its swell, capital. */
const COLUMN: Profile = [
  [0, 0],
  [0.78, 0],
  [0.78, 0.32],
  [0.66, 0.4],
  [0.7, 0.52],
  [0.56, 0.62],
  [0.52, 0.8],
  [0.54, 3.5],
  [0.5, 7.6],
  [0.56, 7.8],
  [0.66, 8.1],
  [0.8, 8.5],
  [0.86, 8.7],
  [0.86, 9.0],
  [0, 9.0],
];

/** A head, egg-shaped, chin at 0. */
const HEAD: Profile = [
  [0, 0],
  [0.04, 0.008],
  [0.062, 0.04],
  [0.084, 0.09],
  [0.094, 0.14],
  [0.09, 0.19],
  [0.07, 0.232],
  [0.04, 0.256],
  [0, 0.262],
];

const accused = (light: HallLight, seed: number): Accused => {
  const r = rng(seed);
  const cloth = burin(light, {
    albedo: 0.62,
    mode: 2,
    radius: 0.28,
    spacing: 0.045,
    rot: 0,
    cross: 1.25,
    rim: 0.35,
    seed: r() * 10,
    tint: { rgb: SCARLET, amount: 0.62, at: [0.06, 0.5, 0.26], r: 0.2 },
  });
  const upper = burin(light, {
    albedo: 0.62,
    mode: 2,
    radius: 0.22,
    spacing: 0.04,
    rim: 0.35,
    seed: r() * 10,
    tint: { rgb: SCARLET, amount: 0.55, at: [0.08, -0.02, 0.2], r: 0.12 },
  });
  const sleeve = burin(light, { albedo: 0.6, mode: 5, spacing: 0.035, rot: 0, rim: 0.3 });
  const skin = burin(light, {
    albedo: 0.78,
    mode: 2,
    radius: 0.09,
    spacing: 0.016,
    rot: 0.6,
    cross: 1.3,
    rim: 0.5,
  });
  const hair = burin(light, {
    albedo: 0.3,
    mode: 2,
    radius: 0.1,
    spacing: 0.018,
    rot: 1.45,
    cross: 0.5,
    rim: 0.3,
  });
  const rope = burin(light, { albedo: 0.55, mode: 0, spacing: 0.01, rot: 0.8 });
  const cape = burin(light, {
    albedo: 0.4,
    mode: 2,
    radius: 0.25,
    spacing: 0.035,
    rot: 0.15,
    cross: 1.3,
    rim: 0.4,
    seed: r() * 10,
  });

  const root = new Group();
  root.add(
    mesh(
      turned(
        [
          [0, 0.02],
          [0.34, 0.02],
          [0.335, 0.1],
          [0.3, 0.36],
          [0.26, 0.62],
          [0.215, 0.86],
          [0.2, 1.0],
          [0, 1.02],
        ],
        72,
        folds(6, 0.11, 1.0, r() * 6, 2.2),
        0.82,
      ),
      cloth,
    ),
  );
  // A rope girdle at the waist.
  const girdle = new Mesh(new TorusGeometry(0.205, 0.016, 8, 40), rope);
  girdle.position.set(0, 0.95, 0);
  girdle.rotation.set(Math.PI / 2, 0, 0);
  girdle.scale.set(1, 0.82, 1);
  root.add(girdle);
  const torso = new Group();
  torso.position.set(0, 0.95, 0);
  root.add(torso);
  torso.add(
    mesh(
      turned(
        [
          [0, -0.1],
          [0.2, -0.1],
          [0.205, 0.1],
          [0.22, 0.3],
          [0.235, 0.42],
          [0.205, 0.5],
          [0.13, 0.565],
          [0.06, 0.6],
          [0, 0.61],
        ],
        48,
        folds(4, 0.04, 0.6, r() * 6),
        0.7,
      ),
      upper,
    ),
  );
  // A short cape over his shoulders, falling in folds.
  torso.add(
    mesh(
      turned(
        [
          [0.09, 0.6],
          [0.17, 0.57],
          [0.27, 0.5],
          [0.31, 0.38],
          [0.32, 0.22],
          [0.335, 0.12],
        ],
        64,
        folds(7, 0.09, 0.6, r() * 6, 1.5),
        0.78,
      ),
      cape,
    ),
  );
  // The arms, the wrists bound before him.
  for (const side of [-1, 1]) {
    const arm = swept(
      path(
        [
          [side * 0.2, 0.46, 0],
          [side * 0.26, 0.26, 0.03],
          [side * 0.19, 0.08, 0.16],
          [side * 0.05, 0.04, 0.25],
        ],
        5,
      ),
      [...taper(14, 0.075, 0.06), 0.072, 0.074],
      14,
    );
    torso.add(mesh(arm, sleeve));
    const hand = turned(
      [
        [0, -0.05],
        [0.03, -0.04],
        [0.04, 0],
        [0.034, 0.03],
        [0, 0.045],
      ],
      12,
      undefined,
      0.7,
    );
    const h = mesh(hand, skin, side * 0.03, 0.0, 0.29);
    h.rotation.set(1.3, 0, side * 0.4);
    torso.add(h);
  }
  const knot = new Mesh(new TorusGeometry(0.06, 0.012, 6, 18), rope);
  knot.position.set(0, 0.03, 0.26);
  knot.rotation.set(0.2, Math.PI / 2, 0);
  torso.add(knot);

  const head = new Group();
  head.position.set(0, 0.6, 0.02);
  torso.add(head);
  head.add(mesh(sculpted(1), skin));
  head.add(
    mesh(
      turned(
        [
          [0.06, 0.08],
          [0.092, 0.12],
          [0.1, 0.17],
          [0.092, 0.22],
          [0.07, 0.255],
          [0.04, 0.272],
          [0, 0.276],
        ],
        32,
        (a, y) =>
          1.04 -
          0.62 * Math.max(0, Math.cos(a) - 0.2) * Math.max(0, Math.min(1, (0.215 - y) / 0.04)),
        1.1,
      ),
      hair,
    ),
  );
  // A short beard along the jaw.
  head.add(
    mesh(
      turned(
        [
          [0, -0.025],
          [0.035, -0.02],
          [0.06, 0.02],
          [0.07, 0.06],
        ],
        24,
        (a) => 0.85 + 0.25 * Math.max(0, Math.cos(a)),
        1.15,
      ),
      hair,
      0,
      0.01,
      0.012,
    ),
  );
  // The hood: round the head and falling to the shoulders, open at the face.
  head.add(
    mesh(
      turned(
        [
          [0.2, -0.13],
          [0.17, -0.06],
          [0.135, 0.02],
          [0.125, 0.1],
          [0.13, 0.19],
          [0.12, 0.27],
          [0.08, 0.32],
          [0.03, 0.34],
          [0, 0.342],
        ],
        48,
        (a, y) => {
          const front = Math.max(0, Math.cos(a) - 0.42) / 0.58;
          const face =
            Math.max(0, Math.min(1, (0.25 - y) / 0.05)) *
            Math.max(0, Math.min(1, (y + 0.08) / 0.06));
          return (
            (1 + 0.05 * Math.sin(9 * a + 1.1) * Math.max(0, 0.15 - y) * 4) *
            (1 - 0.5 * front * face)
          );
        },
        1.12,
      ),
      cape,
      0,
      0,
      -0.008,
    ),
  );
  root.position.set(...ACCUSED_AT);
  return { root, torso, head };
};

const judge = (light: HallLight, seed: number): Judge => {
  const r = rng(seed);
  const robe = burin(light, {
    albedo: 0.2,
    mode: 2,
    radius: 0.3,
    spacing: 0.05,
    rim: 0.3,
    seed: r() * 10,
  });
  const mantle = burin(light, {
    albedo: 0.28,
    mode: 2,
    radius: 0.36,
    spacing: 0.05,
    rot: 0,
    rim: 0.45,
    seed: r() * 10,
  });
  const sleeve = burin(light, { albedo: 0.3, mode: 5, spacing: 0.04, rim: 0.4 });
  const skin = burin(light, {
    albedo: 0.78,
    mode: 2,
    radius: 0.1,
    spacing: 0.018,
    rot: 0.6,
    cross: 1.3,
    rim: 0.5,
  });
  const beard = burin(light, {
    albedo: 0.85,
    mode: 5,
    spacing: 0.022,
    rot: Math.PI / 2,
    cross: 0.4,
    rim: 0.4,
  });
  const turban = burin(light, {
    albedo: 0.82,
    mode: 2,
    radius: 0.12,
    spacing: 0.024,
    rot: 0.35,
    cross: 1.4,
    rim: 0.4,
  });
  const wood = burin(light, { albedo: 0.22, mode: 2, radius: 0.03, spacing: 0.012, rim: 0.5 });

  const root = new Group();
  const torso = new Group();
  root.add(torso);
  torso.add(
    mesh(
      turned(
        [
          [0, -0.4],
          [0.36, -0.4],
          [0.34, 0.1],
          [0.3, 0.45],
          [0.31, 0.7],
          [0.28, 0.8],
          [0.16, 0.87],
          [0.07, 0.9],
          [0, 0.91],
        ].map(([a = 0, b = 0]) => [a * 0.86, b] as const),
        56,
        folds(6, 0.05, 0.9, r() * 6),
        0.75,
      ),
      robe,
    ),
  );
  // The mantle over his shoulders, open at the front.
  torso.add(
    mesh(
      turned(
        [
          [0.1, 0.93],
          [0.22, 0.88],
          [0.36, 0.78],
          [0.42, 0.55],
          [0.44, 0.2],
          [0.47, -0.4],
        ].map(([a = 0, b = 0]) => [a * 0.86, b] as const),
        64,
        (a, y) =>
          (1 + 0.07 * Math.sin(7 * a + 1.3) * Math.max(0, (0.8 - y) / 1.2)) *
          (1 - 0.95 * Math.max(0, Math.cos(a) - 0.5) * Math.max(0, Math.min(1, (0.86 - y) / 0.12))),
        0.82,
      ),
      mantle,
    ),
  );
  const head = new Group();
  head.position.set(0, 0.88, 0.03);
  torso.add(head);
  const s = 1.12;
  head.add(mesh(sculpted(s), skin));
  // The beard, falling on his chest.
  head.add(
    mesh(
      swept(
        path(
          [
            [0, 0.07, 0.04],
            [0, -0.05, 0.1],
            [0, -0.2, 0.13],
            [0, -0.34, 0.12],
          ],
          5,
        ),
        [
          0.085, 0.092, 0.095, 0.09, 0.085, 0.078, 0.07, 0.06, 0.05, 0.04, 0.03, 0.022, 0.014,
          0.008, 0.004, 0.002,
        ],
        16,
        0.62,
      ),
      beard,
    ),
  );
  // The turban.
  head.add(
    mesh(
      turned(
        [
          [0.098, 0.15],
          [0.122, 0.19],
          [0.13, 0.25],
          [0.124, 0.31],
          [0.1, 0.36],
          [0.05, 0.39],
          [0, 0.395],
        ],
        40,
        folds(9, 0.05, 0.4, r() * 6),
        1.08,
      ),
      turban,
    ),
  );
  // The left arm laid along the bench.
  torso.add(
    mesh(
      swept(
        path(
          [
            [-0.3, 0.74, 0],
            [-0.36, 0.52, 0.16],
            [-0.3, 0.42, 0.4],
            [-0.22, 0.4, 0.62],
          ],
          5,
        ),
        [...taper(13, 0.075, 0.1), 0.112, 0.116, 0.108],
        14,
      ),
      sleeve,
    ),
  );
  // The gavel arm, turned at the shoulder.
  const arm = new Group();
  arm.position.set(0.3, 0.74, 0);
  torso.add(arm);
  arm.add(
    mesh(
      swept(
        path(
          [
            [0, 0, 0],
            [0.08, -0.24, 0.12],
            [0.06, -0.3, 0.38],
            [0.02, -0.32, 0.58],
          ],
          5,
        ),
        [...taper(13, 0.07, 0.08), 0.09, 0.098, 0.1],
        14,
      ),
      sleeve,
    ),
  );
  const fist = mesh(
    turned(
      HEAD.map(([a, b]) => [a * 0.5, b * 0.5] as const),
      12,
    ),
    skin,
    0.02,
    -0.33,
    0.66,
  );
  fist.rotation.set(1.4, 0, 0);
  arm.add(fist);
  // The gavel held out ahead of the fist, its head across the handle's end.
  const handle = mesh(
    turned(
      [
        [0, 0],
        [0.016, 0],
        [0.014, 0.3],
        [0, 0.3],
      ],
      10,
    ),
    wood,
    0.02,
    -0.33,
    0.62,
  );
  handle.rotation.set(Math.PI / 2, 0, 0);
  arm.add(handle);
  const mallet = mesh(
    turned(
      [
        [0, -0.09],
        [0.05, -0.09],
        [0.055, -0.06],
        [0.05, 0.06],
        [0.055, 0.06],
        [0.05, 0.09],
        [0, 0.09],
      ],
      16,
    ),
    wood,
    0.02,
    -0.33,
    0.92,
  );
  mallet.rotation.set(0, 0, Math.PI / 2);
  arm.add(mallet);
  root.scale.setScalar(1.35);
  root.position.set(JUDGE_AT[0], JUDGE_AT[1] + SEAT, JUDGE_AT[2]);
  return { root, torso, head, arm };
};

/** Nine exhibits: scrolls and tablets, each its own place on the pile. */
const exhibits = (light: HallLight, seed: number): Exhibit[] => {
  const r = rng(seed);
  const parchment = burin(light, { albedo: 0.88, mode: 2, radius: 0.06, spacing: 0.012, rim: 0.5 });
  const tablet = burin(light, { albedo: 0.8, mode: 0, spacing: 0.012, rot: 0.1, rim: 0.2 });
  return Array.from({ length: 9 }, (_, i) => {
    const scroll = i % 3 !== 1;
    const g = scroll
      ? turned(
          [
            [0, -0.24],
            [0.05, -0.24],
            [0.055, -0.2],
            [0.055, 0.2],
            [0.05, 0.24],
            [0, 0.24],
          ],
          16,
        )
      : block(0.34, 0.035, 0.26, false);
    const m = new Mesh(g, scroll ? parchment : tablet);
    const layer = Math.floor(i / 3);
    return {
      mesh: m,
      rest: [
        EVIDENCE_AT[0] + (r() - 0.5) * 0.36,
        EVIDENCE_AT[1] + 0.05 + layer * 0.085 + (scroll ? 0.03 : 0),
        EVIDENCE_AT[2] + (r() - 0.5) * 0.28,
      ] as const,
      yaw: (r() - 0.5) * 1.2,
      roll: scroll ? Math.PI / 2 : (r() - 0.5) * 0.12,
    };
  });
};

export const world = (light: HallLight): World => {
  const scene = new Group();
  const stone = (albedo: number, rot = 0, joints?: readonly [number, number, number]) =>
    burin(light, { albedo, mode: 0, rot, spacing: 0.16, joints, cross: 1.1 });
  const floorCut = burin(light, {
    albedo: 0.62,
    mode: 0,
    rot: 0,
    spacing: 0.14,
    joints: [1.1, 1.1, 0.9],
    cross: 1.3,
  });
  const wallCut = stone(0.5, 0, [0.55, 1.2, 0.8]);
  const sideCut = burin(light, {
    albedo: 0.5,
    mode: 0,
    spacing: 0.16,
    joints: [0.55, 1.2, 0.8],
    glow: true,
  });
  const backCut = burin(light, {
    albedo: 0.48,
    mode: 0,
    spacing: 0.16,
    joints: [0.55, 1.2, 0.8],
    glow: true,
  });
  const columnCut = burin(light, {
    albedo: 0.66,
    mode: 2,
    radius: 0.55,
    spacing: 0.06,
    rot: 0,
    cross: 1.45,
    rim: 0.45,
  });
  const stepCut = stone(0.6, 0, [0.25, 1.4, 0.7]);
  const woodCut = burin(light, {
    albedo: 0.42,
    mode: 0,
    rot: Math.PI / 2,
    spacing: 0.04,
    cross: 1.4,
  });
  const panelCut = burin(light, {
    albedo: 0.32,
    mode: 0,
    rot: Math.PI / 2,
    spacing: 0.035,
    cross: 1.4,
  });

  // The room's six sides, each overlapping its neighbours so no seam lets the paper through.
  const floor = mesh(block(15, 0.4, 21), floorCut, 0, -0.4, 0);
  const back = mesh(block(15, 12, 0.4), backCut, 0, -0.5, -9.7);
  const left = mesh(block(0.4, 12, 21), sideCut, -7.2, -0.5, 0);
  const right = mesh(block(0.4, 12, 21), wallCut, 7.2, -0.5, 0);
  const ceiling = mesh(block(15, 0.4, 21), stone(0.3), 0, 11, 0);
  const front = mesh(block(15, 12, 0.4), wallCut, 0, -0.5, 9.7);
  scene.add(floor, back, left, right, ceiling, front);

  const casters: Object3D[] = [];
  for (const x of [-5.6, 5.6])
    for (const z of [-6.6, -1.2, 4.2]) {
      const c = mesh(turned(COLUMN, 48), columnCut, x, 0, z);
      scene.add(c);
      casters.push(c);
    }
  // The dais: three steps up to the judgment seat.
  [
    [6.2, 0.25, 4.4, -6.3],
    [5.6, 0.5, 3.8, -6.6],
    [5.0, 0.75, 3.2, -6.9],
  ].forEach(([w = 0, h = 0, d = 0, z = 0]) => {
    const s = mesh(block(w, h, d), stepCut, 2.5, 0, z);
    scene.add(s);
    casters.push(s);
  });
  // The throne's high back, its crest and its finials.
  const throneBack = mesh(
    block(1.7, 3.6, 0.3),
    woodCut,
    JUDGE_AT[0],
    JUDGE_AT[1],
    JUDGE_AT[2] - 0.75,
  );
  const crest = mesh(
    block(2.1, 0.35, 0.42),
    woodCut,
    JUDGE_AT[0],
    JUDGE_AT[1] + 3.6,
    JUDGE_AT[2] - 0.75,
  );
  scene.add(throneBack, crest);
  casters.push(throneBack, crest);
  for (const side of [-1, 1]) {
    const post = mesh(
      turned(
        [
          [0, 0],
          [0.12, 0],
          [0.1, 0.3],
          [0.08, 2.2],
          [0.13, 2.35],
          [0.15, 2.5],
          [0.1, 2.65],
          [0, 2.72],
        ],
        20,
      ),
      columnCut,
      JUDGE_AT[0] + side * 0.95,
      JUDGE_AT[1],
      JUDGE_AT[2] - 0.6,
    );
    scene.add(post);
    casters.push(post);
  }
  // The bench before him, panelled, the gavel's block on it.
  const bench = mesh(block(3.0, BENCH, 0.8), woodCut, JUDGE_AT[0], JUDGE_AT[1], JUDGE_AT[2] + 1.0);
  const top = mesh(
    block(3.2, 0.08, 1.0),
    woodCut,
    JUDGE_AT[0],
    JUDGE_AT[1] + BENCH,
    JUDGE_AT[2] + 1.0,
  );
  scene.add(bench, top);
  casters.push(bench, top);
  for (const k of [-1, 0, 1]) {
    const p = mesh(
      block(0.78, 0.56, 0.04),
      panelCut,
      JUDGE_AT[0] + k * 0.95,
      JUDGE_AT[1] + 0.16,
      JUDGE_AT[2] + 1.41,
    );
    scene.add(p);
  }
  const strike = mesh(
    block(0.2, 0.06, 0.2),
    woodCut,
    JUDGE_AT[0] + 0.25,
    JUDGE_AT[1] + BENCH + 0.08,
    JUDGE_AT[2] + 0.7,
  );
  scene.add(strike);
  // The evidence table.
  const table = mesh(block(1.0, 0.5, 0.7), stepCut, EVIDENCE_AT[0], 0, EVIDENCE_AT[2]);
  scene.add(table);
  casters.push(table);

  const a = accused(light, 1889);
  const j = judge(light, 1888);
  scene.add(a.root, j.root);
  casters.push(a.root, j.root);
  const evidence = exhibits(light, 1844);
  for (const e of evidence) {
    scene.add(e.mesh);
    casters.push(e.mesh);
  }
  return {
    scene,
    casters,
    blind: [floor, back, left, right, ceiling, front],
    accused: a,
    judge: j,
    evidence,
  };
};
