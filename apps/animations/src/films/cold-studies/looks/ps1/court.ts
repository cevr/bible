// The ps1 courtroom: a level built from boxes. Cut stone walls with tall pale
// windows and a round one over the bench, a plank floor, a teal runner up
// the aisle, pews behind the bar with a few onlookers, the judge's tall
// bench on its dais and, in the well, the accused in a stained tunic beside
// a table the evidence piles onto. Five game-camera shots, each one drifting
// slowly, cut on the take's marks: the crane in ("Imagine standing in a
// courtroom"), the evidence falling (`evidence`), the face going down (`did`),
// the judge leaning in with the gavel (`judge`), and the verdict from over
// the accused's shoulder (`righteous`), the plate stamped gold on the bench
// and the head coming up.
//
// Screen direction holds through every shot (DIRECTION's staging grammar):
// the accused screen-left, the bench centre-high; every camera stays on one
// side of the line between them.

import type { Hex } from '@bible/film/canvas';
import { type Key, clamp, ease, lerp, rng } from '@bible/film/core';
import { CanvasTexture, Group, NearestFilter, PerspectiveCamera, Scene, Vector3 } from 'three';
import type { CourtFrame } from '../../scenes/court.ts';
import { box, post, put, sheet, slab } from './build.ts';
import { type Person, REST, person, pose } from './people.ts';
import { type Rig, keptFor, present, rigOf } from './rig.ts';
import { ps1, rgb } from './shade.ts';
import { verdictPlate } from './type.ts';

/** The room's colours: a cool, even light, no sun (the cold open's act light). */
export const ROOM = {
  fog: '#aab4bf',
  gold: '#e6b347',
} as const satisfies Record<string, Hex>;

/** The evidence: file boxes and paper stacks, where each comes to rest on the table or the floor beside it. */
interface Item {
  readonly kind: 'box' | 'stack';
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly turn: number;
}

/** The table's top. */
const TABLE = { x: 0.9, z: 0.35, top: 0.82 } as const;

/** How many pieces land on the table before the rest spill to the floor. */
const ON_TABLE = 24;

const ITEMS: ReadonlyArray<Item> = (() => {
  const r = rng(1889);
  // Six stacks on the table, two deep and three across, piled in turn; the overflow on the floor.
  const stacks = [-0.55, 0, 0.55].flatMap((x) => [-0.2, 0.2].map((z) => [x, z] as const));
  const heights: number[] = stacks.map(() => TABLE.top);
  return Array.from({ length: ON_TABLE + 3 }, (_, i): Item => {
    const kind = r() < 0.62 ? 'box' : 'stack';
    const tall = kind === 'box' ? 0.32 : 0.1;
    const turn = (r() - 0.5) * 0.45;
    const jx = (r() - 0.5) * 0.08;
    const jz = (r() - 0.5) * 0.06;
    if (i >= ON_TABLE) {
      const k = i - ON_TABLE;
      return {
        kind,
        x: TABLE.x + 0.75 - k * 0.5,
        y: tall / 2,
        z: TABLE.z - 0.75 - k * 0.12,
        turn: turn * 3,
      };
    }
    const s = (i * 5) % stacks.length;
    const [sx, sz] = stacks[s] ?? [0, 0];
    const y = (heights[s] ?? 0) + tall / 2;
    heights[s] = (heights[s] ?? 0) + tall;
    return { kind, x: TABLE.x + sx + jx, y, z: TABLE.z + sz + jz, turn };
  });
})();

/** Where the people stand. */
const ACCUSED = new Vector3(-1.3, 0, 0.5);
const JUDGE = new Vector3(0, 1.5, -5.9);
/** The verdict plate's place on the bench front. */
const PLATE = new Vector3(0, 1.62, -4.16);

interface Set {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly accused: Person;
  readonly judge: Person;
  readonly items: ReadonlyArray<Group>;
  readonly plate: Group;
}

/** A placer: `geo` in `mat` at (x, y, z) in one scene. */
type Placer = (
  geo: Parameters<typeof put>[1],
  mat: Parameters<typeof put>[2],
  x: number,
  y: number,
  z: number,
) => ReturnType<typeof put>;

/** The room's shell: floor, runner, stone walls with their pilasters and windows, the doors. */
const shell = (r: Rig, at: Placer) => {
  const w = r.world;
  const t = r.tex;
  const floor = ps1(w, { map: t.floor });
  const wall = ps1(w, { map: t.wall });
  const pew = ps1(w, { map: t.pew });
  const carpet = ps1(w, { map: t.carpet });
  const glass = ps1(w, { tint: '#e4ecef', emissive: 0.85 });
  const trim = ps1(w, { tint: '#3a3e48' });

  // The floor and the runner up the aisle.
  at(slab(20, 22, 0.5), floor, 0, 0, 1).rotation.x = -Math.PI / 2;
  at(slab(1.8, 12, 1), carpet, 0, 0.01, 7).rotation.x = -Math.PI / 2;
  // The walls: the back behind the bench, the two sides, pilasters along them.
  at(slab(20, 9, 0.4), wall, 0, 4.5, -7.6);
  for (const s of [-1, 1]) {
    const side = at(slab(22, 9, 0.4), wall, s * 9, 4.5, 1);
    side.rotation.y = -s * (Math.PI / 2);
    for (let z = -6; z <= 10; z += 4) at(box(0.6, 9, 0.6, 0.4), wall, s * 8.7, 4.5, z);
    // A tall window between each pair of pilasters on the side walls.
    for (let z = -4; z <= 8; z += 4) {
      const win = at(slab(1.4, 3.4, 1), glass, s * 8.95, 3.9, z);
      win.rotation.y = -s * (Math.PI / 2);
      at(box(0.1, 3.4, 0.1), trim, s * 8.9, 3.9, z);
      for (const y of [3.0, 4.6]) at(box(0.1, 0.1, 1.4), trim, s * 8.9, y, z);
    }
  }
  // Two tall windows and a round one on the back wall, a cornice over all.
  for (const x of [-5, 5]) {
    at(slab(1.6, 4, 1), glass, x, 3.8, -7.55);
    at(box(0.1, 4, 0.1), trim, x, 3.8, -7.5);
    for (const y of [2.8, 4.3]) at(box(1.6, 0.1, 0.1), trim, x, y, -7.5);
  }
  at(post(1.1, 1.1, 0.05, 12), glass, 0, 5.6, -7.55).rotation.x = Math.PI / 2;
  at(box(20, 0.35, 0.5), trim, 0, 7.2, -7.4);
  // The entrance wall behind the gallery, its double doors shut.
  at(slab(20, 9, 0.4), wall, 0, 4.5, 12).rotation.y = Math.PI;
  at(box(2.4, 3.2, 0.2, 0.8), pew, 0, 1.6, 11.9);
  at(box(0.06, 3.2, 0.24), trim, 0, 1.6, 11.88);
};

const build = (r: Rig): Set => {
  const w = r.world;
  const t = r.tex;
  const scene = new Scene();
  const at: Placer = (geo, mat, x, y, z) => put(scene, geo, mat, x, y, z);
  shell(r, at);
  const bench = ps1(w, { map: t.bench });
  const pew = ps1(w, { map: t.pew });
  const trim = ps1(w, { tint: '#3a3e48' });
  const leather = ps1(w, { tint: '#2f4a3e' });

  // The dais, the judge's high chair and the bench in front of it.
  at(box(8, 0.5, 3.4, 0.6), bench, 0, 0.25, -5.7);
  at(box(1.5, 3.6, 0.3, 0.8), leather, 0, 2.3, -6.75);
  at(box(1.7, 0.3, 0.4, 0.8), bench, 0, 4.15, -6.75);
  at(box(6.4, 2.3, 1.2, 0.8), bench, 0, 1.15, -4.8);
  at(box(6.8, 0.14, 1.5, 0.8), bench, 0, 2.37, -4.8);
  for (const x of [-2.1, 2.1]) at(box(1.6, 1.3, 0.06, 1.2), trim, x, 1.2, -4.18);
  // The gavel's block, under the judge's gavel hand.
  at(post(0.16, 0.18, 0.07, 6), bench, 0.36, 2.48, -4.78);

  // The bar: a rail on posts between the well and the gallery.
  for (const s of [-1, 1]) {
    at(box(6.5, 0.08, 0.1), bench, s * 4.6, 1.0, 3.0);
    for (let x = 1.6; x <= 7.6; x += 0.75) at(box(0.06, 1.0, 0.06), bench, s * x, 0.5, 3.0);
  }
  // The pews.
  for (let row = 0; row < 4; row++)
    for (const s of [-1, 1]) {
      const z = 4.4 + row * 1.5;
      at(box(5.2, 0.45, 0.5, 0.8), pew, s * 4.0, 0.42, z);
      at(box(5.2, 0.9, 0.12, 0.8), pew, s * 4.0, 0.9, z + 0.32);
    }

  // The evidence table.
  at(box(1.8, 0.08, 0.9, 1.2), bench, TABLE.x, TABLE.top - 0.04, TABLE.z);
  for (const [dx, dz] of [
    [-0.8, -0.38],
    [0.8, -0.38],
    [-0.8, 0.38],
    [0.8, 0.38],
  ] as const)
    at(
      box(0.08, TABLE.top - 0.08, 0.08),
      bench,
      TABLE.x + dx,
      (TABLE.top - 0.08) / 2,
      TABLE.z + dz,
    );

  // The evidence, each piece in its own group so it can fall.
  const paper = ps1(w, { map: t.paper });
  const card = ps1(w, { map: t.box });
  const items = ITEMS.map((item) => {
    const g = new Group();
    if (item.kind === 'box') put(g, box(0.46, 0.32, 0.34, 2.2), card, 0, 0, 0);
    else put(g, box(0.4, 0.1, 0.3, 2.5), paper, 0, 0, 0);
    scene.add(g);
    return g;
  });

  // The verdict plate, stamped on the bench front.
  const plate = new Group();
  const word = new CanvasTexture(verdictPlate());
  word.magFilter = NearestFilter;
  word.minFilter = NearestFilter;
  word.generateMipmaps = false;
  put(plate, sheet(3.6, 0.9), ps1(w, { map: word, emissive: 0.55 }), 0, 0, 0);
  plate.position.copy(PLATE);
  scene.add(plate);

  // The people.
  const accused = person(w, t, {
    skin: '#d9a682',
    hair: '#2a1d16',
    fringe: 5,
    recede: 0,
    cloth: 'tunic',
    legs: '#4a4038',
  });
  accused.root.position.copy(ACCUSED);
  accused.root.rotation.y = Math.PI;
  scene.add(accused.root);
  const judge = person(w, t, {
    skin: '#c08a66',
    hair: '#b9b6b0',
    browColor: '#e8e4dc',
    fringe: 0,
    recede: 1,
    cloth: 'robe',
    legs: '#121318',
    robe: true,
    bands: true,
    scale: 1.15,
  });
  judge.root.position.copy(JUDGE);
  scene.add(judge.root);
  // The gavel in his hand: a turned head on a handle, set at the angle that
  // lays it flat on the block when the arm comes down.
  judge.grip.rotation.x = 1.15;
  const wood = ps1(w, { map: t.desk });
  put(judge.grip, post(0.025, 0.025, 0.42, 5), wood, 0, 0, 0.18).rotation.x = Math.PI / 2;
  put(judge.grip, post(0.075, 0.075, 0.26, 7), wood, 0, 0, 0.38).rotation.z = Math.PI / 2;

  // Onlookers in the pews, no two alike.
  const crowd: ReadonlyArray<readonly [number, number, string, string, number, number]> = [
    [-2.4, 4.4, '#8d5a3b', '#16110e', 0.95, 3],
    [-5.1, 5.9, '#efc8a4', '#a8642e', 1.05, 4],
    [3.0, 4.4, '#b07a52', '#2b2b30', 1.0, 0],
    [5.6, 7.4, '#e3b892', '#5a3a22', 0.9, 2],
  ];
  for (const [x, z, skin, hair, scale, fringe] of crowd) {
    const p = person(w, t, {
      skin,
      hair,
      fringe,
      recede: fringe === 0 ? 0.7 : 0.1,
      cloth: 'coat',
      legs: '#2a2a2a',
      scale,
    });
    p.root.position.set(x, -0.25, z);
    p.root.rotation.y = Math.PI;
    pose(p, { ...REST, armL: 0.5, armR: 0.5, spread: 0.02 });
    scene.add(p.root);
  }

  const camera = new PerspectiveCamera(50, 16 / 9, 0.1, 60);
  return { scene, camera, accused, judge, items, plate };
};

const courtSet = keptFor(build);

/** A camera move: where it starts and ends, what it looks at, and its lens. */
interface Shot {
  readonly from: readonly [number, number, number];
  readonly to: readonly [number, number, number];
  readonly look: readonly [number, number, number];
  readonly lookTo: readonly [number, number, number];
  readonly fov: number;
}

const CRANE: Shot = {
  from: [3.2, 7.2, 12.5],
  to: [1.6, 4.0, 8.0],
  look: [-0.6, 1.0, -1.5],
  lookTo: [-0.9, 1.3, -1.0],
  fov: 50,
};

/** The five shots, in order, each cut in on its mark (the first on the scene's start). */
const SHOTS: ReadonlyArray<Shot> = [
  // A slow crane down from over the gallery to the accused alone in the well.
  CRANE,
  // The evidence piling on the table beside them, the camera trucking left.
  {
    from: [1.3, 1.6, -2.3],
    to: [0.9, 1.55, -2.6],
    look: [-0.55, 1.15, 0.45],
    lookTo: [-0.65, 1.1, 0.4],
    fov: 52,
  },
  // The face, from the bench side and a little above: the judge's view.
  {
    from: [-1.0, 1.36, -0.62],
    to: [-1.08, 1.38, -0.45],
    look: [-1.3, 1.5, 0.5],
    lookTo: [-1.3, 1.5, 0.5],
    fov: 50,
  },
  // Up at the judge from where the accused stands, pushing in.
  {
    from: [-0.6, 2.1, 0.0],
    to: [-0.45, 2.2, -0.8],
    look: [0.1, 2.85, -5.6],
    lookTo: [0.1, 2.9, -5.6],
    fov: 32,
  },
  // The verdict, over the accused's shoulder, easing in.
  {
    from: [-0.75, 2.05, 3.9],
    to: [-0.8, 1.95, 3.3],
    look: [-0.15, 1.85, -4.2],
    lookTo: [-0.15, 1.9, -4.2],
    fov: 44,
  },
];

/** The gavel's arc across `gavel`: raised, down hard on the block, a bounce, at rest on it. */
const SWING: ReadonlyArray<Key> = [
  [0, 0.7],
  [0.373, 2.5],
  [0.627, 0.95, 'inCubic'],
  [0.797, 1.25, 'outQuad'],
  [1, 0.97],
];
/** The plate's scale across `stamp`: in large, a give, settled. */
const STAMP_POP: ReadonlyArray<Key> = [
  [0, 1.35],
  [0.6, 0.94, 'outCubic'],
  [1, 1, 'inOutCubic'],
];

const v3 = (
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  k: number,
) => new Vector3(lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k));

/** The shot playing at `f.t` and how far through it, from the marks it cuts on. */
interface Playing {
  readonly shot: Shot;
  /** How far through it, eased. */
  readonly k: number;
}

const shotAt = (f: CourtFrame): Playing => {
  const cuts = [0, f.mark('evidence'), f.mark('did'), f.mark('judge'), f.mark('righteous'), f.dur];
  let i = 0;
  while (i < SHOTS.length - 1 && f.t >= (cuts[i + 1] ?? f.dur)) i++;
  const start = cuts[i] ?? 0;
  const end = cuts[i + 1] ?? f.dur;
  const shot = SHOTS[i] ?? CRANE;
  return { shot, k: ease.inOutSine(clamp((f.t - start) / Math.max(end - start, 1e-3))) };
};

/** Every value the court shows at `f.t`, then the render. */
const stage = (f: CourtFrame, r: Rig, s: Set) => {
  const w = r.world;
  const stamp = f.at('stamp');
  const lift = f.at('lift');
  const bow = f.at('bow') * (1 - lift);
  const lean = f.at('lean');

  // The room's light: cool and even, from the windows; the verdict's gold comes up on the stamp.
  w.ambient.value.copy(rgb('#8e98a4'));
  w.sunDir.value.set(0.35, 0.8, -0.5).normalize();
  w.sunColor.value.copy(rgb('#7a7874'));
  w.glowPos.value.set(0, 2.2, -3.2);
  w.glowColor.value.copy(rgb(ROOM.gold)).multiplyScalar(1.2 * stamp);
  w.glowRange.value = 7.5;
  w.fogColor.value.copy(rgb(ROOM.fog));
  w.fogNear.value = 7;
  w.fogFar.value = 30;

  // The evidence falls, piece after piece, across `drop`.
  s.items.forEach((g, i) => {
    const item = ITEMS[i];
    const k = f.stagger('drop', i, s.items.length);
    g.visible = item !== undefined && k > 0;
    if (item === undefined) return;
    g.position.set(item.x, item.y + lerp(3.2, 0, k), item.z);
    g.rotation.set(0.6 * (1 - k), item.turn + 0.8 * (1 - k), 0.3 * (1 - k));
  });

  // The accused: head down on "you did it", up at the verdict, the face opening.
  pose(s.accused, {
    ...REST,
    nod: 0.42 * bow - 0.12 * lift,
    turn: 0,
    lean: 0.12 * bow,
    worry: 0.35 + 0.35 * bow - 0.1 * lift,
    raise: lift,
    open: 1 - 0.8 * bow + 0.25 * lift,
    down: bow,
    mouthW: lerp(0.07, 0.05, lift),
    mouthH: lerp(0.014, 0.05, lift),
    armL: 0.05,
    armR: 0.05,
    spread: 0.06,
  });

  // The judge leans in, the gavel comes up and down hard across `gavel`.
  const swing = f.keys('gavel', SWING);
  pose(s.judge, {
    ...REST,
    nod: 0.22 * lean,
    turn: 0.12 * lean,
    lean: 0.28 * lean,
    worry: -0.25 + 0.4 * stamp,
    raise: 0.2 * stamp,
    open: 0.85,
    down: 0.6 * lean,
    mouthW: 0.08,
    mouthH: lerp(0.012, 0.03, stamp),
    armL: 0.9,
    armR: swing,
    spread: 0.1,
  });

  // The plate: hidden until the stamp, then slammed onto the bench front.
  s.plate.visible = stamp > 0;
  s.plate.scale.setScalar(f.keys('stamp', STAMP_POP));

  const { shot, k } = shotAt(f);
  s.camera.fov = shot.fov;
  s.camera.updateProjectionMatrix();
  s.camera.position.copy(v3(shot.from, shot.to, k));
  s.camera.lookAt(v3(shot.look, shot.lookTo, k));

  r.renderer.setClearColor(ROOM.fog, 1);
  r.renderer.render(s.scene, s.camera);
};

/** Where no WebGL 2 can be had (`check --draw`): the room in flat blocks, no type. */
const fallback = (f: CourtFrame) => {
  const { ctx, w, h } = f;
  ctx.fillStyle = ROOM.fog;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#5a4030';
  ctx.fillRect(w * 0.3, h * 0.35, w * 0.4, h * 0.3);
  ctx.fillStyle = '#d9cfc0';
  ctx.fillRect(w * 0.18, h * 0.5, w * 0.08, h * 0.4);
};

export const court = (f: CourtFrame): void => {
  const r = rigOf();
  if (r === undefined) return fallback(f);
  stage(f, r, courtSet(r));
  present(f.ctx, r.canvas, f.w, f.h);
};
