// The ps1 world's people: low-poly, about three and a half heads tall, the
// head a faceted ball with a cap of hair and a fringe of spikes, a face of
// flat pieces (two tall dark eyes with a glint, two brows, a mouth), a
// tapered drum for the body, block arms with block hands. Built once; a
// pose (`pose`) sets every joint and the face from the frame, so nothing
// carries over from one frame to the next.

import {
  CircleGeometry,
  ConeGeometry,
  Group,
  Mesh,
  type Object3D,
  PlaneGeometry,
  SphereGeometry,
} from 'three';
import { box, post, put } from './build.ts';
import { type World, ps1 } from './shade.ts';
import type { Textures } from './textures.ts';

/** The head's radius: big, as the reference's people are. */
const R = 0.27;

/** How a person is dressed and made. */
export interface Build {
  readonly skin: string;
  readonly hair: string;
  /** The fringe's spikes over the brow, and how far the cap sits back (0 a full head of hair, 1 receding). */
  readonly fringe: number;
  readonly recede: number;
  /** The body's cloth, its tint, and the legs' colour (hidden under a robe). */
  readonly cloth: keyof Textures;
  readonly clothTint?: string;
  /** The sleeves' cloth, where it differs from the body's (a stain that stops at the shoulders). */
  readonly sleeve?: keyof Textures;
  readonly legs: string;
  /** A robe to the floor in place of legs. */
  readonly robe?: boolean;
  /** Height, as a scale on the whole figure. */
  readonly scale?: number;
  /** A white band at the collar (the judge's). */
  readonly bands?: boolean;
  readonly browColor?: string;
}

export interface Person {
  readonly root: Group;
  /** At the hips: leans the body. */
  readonly body: Group;
  /** At the neck: nods and turns the head. */
  readonly head: Group;
  readonly brows: readonly [Mesh, Mesh];
  readonly eyes: readonly [Mesh, Mesh];
  readonly mouth: Mesh;
  /** At the shoulders: left (the figure's own) then right. */
  readonly arms: readonly [Group, Group];
  /** What the right hand holds hangs here. */
  readonly grip: Group;
}

/** A face piece at (x, y) on the head's front, turned to sit flat on the ball. */
const onFace = (head: Object3D, mesh: Mesh, x: number, y: number, lift = 0.006) => {
  const z = Math.sqrt(Math.max(R * R - x * x - y * y, 0)) + lift;
  mesh.position.set(x, R + y, z);
  mesh.rotation.set(-Math.asin(y / R), Math.asin(x / R), 0);
  head.add(mesh);
  return mesh;
};

export const person = (w: World, tex: Textures, b: Build): Person => {
  const skin = ps1(w, { tint: b.skin });
  const hair = ps1(w, { tint: b.hair });
  const cloth = ps1(w, { map: tex[b.cloth], tint: b.clothTint ?? '#ffffff' });
  const sleeve =
    b.sleeve === undefined ? cloth : ps1(w, { map: tex[b.sleeve], tint: b.clothTint ?? '#ffffff' });
  const ink = ps1(w, { tint: '#16141c' });
  const browInk = ps1(w, { tint: b.browColor ?? '#2a2018' });
  const glint = ps1(w, { tint: '#ffffff', emissive: 0.7 });
  const legs = ps1(w, { tint: b.legs });

  const root = new Group();
  const body = new Group();
  body.position.y = 0.6;
  root.add(body);
  root.scale.setScalar(b.scale ?? 1);

  if (b.robe === true) put(root, post(0.25, 0.32, 0.62, 7), cloth, 0, 0.31, 0);
  else for (const x of [-0.1, 0.1]) put(root, box(0.15, 0.6, 0.17), legs, x, 0.3, 0);
  // The body: a drum, narrow at the shoulders. Its sides wear the cloth and
  // its caps the sleeves' (a cap samples the texture's middle, and a dyed
  // panel there would show as flecks at the collar).
  const torso = new Mesh(post(0.2, 0.25, 0.6, 7, 2, 1), [cloth, sleeve, sleeve]);
  torso.position.set(0, 0.3, 0);
  body.add(torso);
  put(body, post(0.07, 0.07, 0.1, 5), skin, 0, 0.64, 0);
  if (b.bands === true)
    for (const x of [-0.035, 0.035]) put(body, box(0.05, 0.14, 0.02), glint, x, 0.53, 0.19);

  const head = new Group();
  head.position.y = 0.66;
  body.add(head);
  put(head, new SphereGeometry(R, 10, 8), skin, 0, R, 0).scale.set(1, 1.04, 0.96);
  // The hair: a cap tipped back by how far it recedes, and a fringe of spikes.
  const cap = put(
    head,
    new SphereGeometry(R * 1.1, 9, 5, 0, Math.PI * 2, 0, Math.PI * 0.5),
    hair,
    0,
    R * 1.08,
    -0.01,
  );
  cap.rotation.x = -0.45 - 0.4 * b.recede;
  for (let i = 0; i < b.fringe; i++) {
    const x = (i / Math.max(b.fringe - 1, 1) - 0.5) * R * 1.25;
    const spike = put(head, new ConeGeometry(0.06, 0.15, 4), hair, x, R * 1.62, R * 0.78);
    spike.rotation.set(Math.PI - 0.55, 0, -x * 1.8);
  }
  // The face: flat pieces on the ball's front.
  const eye = new CircleGeometry(1, 6);
  const eyes = [-1, 1].map((s) => {
    const e = onFace(head, new Mesh(eye, ink), s * 0.095, -0.01);
    e.scale.set(0.034, 0.055, 1);
    // The glint rides on the eye, so it closes and looks down with it.
    put(e, new PlaneGeometry(0.62, 0.45), glint, 0.35, 0.36, 0.004);
    return e;
  });
  const brows = [-1, 1].map((s) =>
    onFace(head, new Mesh(box(0.1, 0.024, 0.01), browInk), s * 0.1, 0.105),
  );
  const mouth = onFace(head, new Mesh(new PlaneGeometry(1, 1), ink), 0, -0.13);

  const arms = [-1, 1].map((s) => {
    const arm = new Group();
    arm.position.set(s * 0.27, 0.56, 0);
    body.add(arm);
    put(arm, box(0.11, 0.5, 0.12), sleeve, 0, -0.25, 0);
    put(arm, box(0.11, 0.11, 0.11), skin, 0, -0.55, 0.01);
    return arm;
  });
  const grip = new Group();
  grip.position.set(0, -0.56, 0.02);
  arms[1]?.add(grip);

  return {
    root,
    body,
    head,
    brows: [brows[0] ?? mouth, brows[1] ?? mouth],
    eyes: [eyes[0] ?? mouth, eyes[1] ?? mouth],
    mouth,
    arms: [arms[0] ?? grip, arms[1] ?? grip],
    grip,
  };
};

/** A face and a stance, every value set each frame. */
export interface Pose {
  /** The head's nod (down +) and turn (to its left +), radians. */
  readonly nod: number;
  readonly turn: number;
  /** The body's lean forward, radians. */
  readonly lean: number;
  /** Brows: their inner ends raised (worry +, anger −) and the whole brow raised. */
  readonly worry: number;
  readonly raise: number;
  /** Eyes open (1) to shut (0), and looking down (+). */
  readonly open: number;
  readonly down: number;
  /** The mouth: wide and open, in head units. */
  readonly mouthW: number;
  readonly mouthH: number;
  /** The arms' swing forward (+, up) at the shoulder, left then right, and their spread out. */
  readonly armL: number;
  readonly armR: number;
  readonly spread: number;
}

export const REST: Pose = {
  nod: 0,
  turn: 0,
  lean: 0,
  worry: 0.15,
  raise: 0,
  open: 1,
  down: 0,
  mouthW: 0.07,
  mouthH: 0.016,
  armL: 0,
  armR: 0,
  spread: 0.08,
};

export const pose = (p: Person, s: Pose) => {
  p.head.rotation.set(s.nod, s.turn, 0);
  p.body.rotation.x = s.lean;
  p.brows.forEach((b, i) => {
    const side = i === 0 ? -1 : 1;
    b.rotation.z = -side * s.worry * 0.6;
    b.position.y = R + 0.105 + s.raise * 0.03;
  });
  for (const e of p.eyes) {
    e.scale.y = 0.055 * Math.max(s.open, 0.12);
    // The glint goes with the eye's light: none on an eye nearly shut.
    for (const g of e.children) g.visible = s.open > 0.4;
    e.position.y = R - 0.01 - s.down * 0.015;
  }
  p.mouth.scale.set(s.mouthW, s.mouthH, 1);
  p.arms[0].rotation.set(-s.armL, 0, -s.spread);
  p.arms[1].rotation.set(-s.armR, 0, s.spread);
};
