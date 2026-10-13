// The ps1 verse and card. Job 9:2 lies open in a low-poly Bible on the
// court's clerk desk, its page pixel type painted into the page's texture,
// the camera settling over it on `page` and drifting in. The phrase is
// highlighted in the card's blue as "Job asked it" is said; the engine floods
// that blue out over the frame from the highlight's last line, and the card
// is the reference's: bold sans, lower case but for "God", flush left on the
// flat blue, every word on its word, "just" three times the size in the
// colour script's gold with a gold bar wiped under it. The card is crisp,
// set at the frame's own resolution: the cut from the low-res world to it
// is the reference's cut from its 3D to its cards.

import {
  type Box,
  type CardStyle,
  type CardWord,
  type Hex,
  type VerseStyle,
  fullCard,
  verse,
} from '@bible/film/canvas';
import { clamp, lerp } from '@bible/film/core';
import {
  CanvasTexture,
  Group,
  type Mesh,
  NearestFilter,
  PerspectiveCamera,
  Scene,
  Vector3,
} from 'three';
import { fonts } from '../../palette.ts';
import { VERSE } from '../../look.ts';
import type { JobFrame } from '../../scenes/job.ts';
import { box, put, sheet, slab } from './build.ts';
import { ROOM } from './court.ts';
import { type Rig, keptFor, present, rigOf } from './rig.ts';
import { ps1, rgb } from './shade.ts';
import { PAGE, paintPage, pageCanvas } from './type.ts';

/** The card's colours: the highlight's blue is its ground, so the flood is the highlight grown. */
export const CARD = {
  ground: '#1f3570',
  ink: '#f2e9d7',
  gold: '#e6b347',
} as const satisfies Record<string, Hex>;

/** The page's type: pixel-sized, in the page's texels. */
const PAGE_STYLE: VerseStyle = {
  type: { family: fonts.body, size: 23, weight: 600, color: '#2a2420', leading: 1.35 },
  width: 206,
  highlight: CARD.ground,
  lit: CARD.ink,
};

/** The page in the world: its size, and where the book lies. */
const LEAF = { w: 1.0, h: 1.4 } as const;

interface Desk {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly page: Mesh;
  readonly texture: CanvasTexture;
  readonly canvas: HTMLCanvasElement;
}

const build = (r: Rig): Desk => {
  const w = r.world;
  const t = r.tex;
  const scene = new Scene();
  // The desk top, its front edge, and the book: a leather cover, two leaves open.
  const desk = ps1(w, { map: t.desk });
  put(scene, box(6, 0.12, 3.4, 0.9), desk, 0, -0.06, 0);
  const book = new Group();
  scene.add(book);
  put(book, box(2.3, 0.08, 1.56), ps1(w, { tint: '#3a2418' }), 0, 0.04, 0);
  put(book, box(2.1, 0.06, 1.46), ps1(w, { tint: '#d8ceb4' }), 0, 0.1, 0);
  const left = put(
    book,
    slab(LEAF.w, LEAF.h, 1, 0.35),
    ps1(w, { map: t.paper, tint: '#efe6d0' }),
    -0.52,
    0.16,
    0,
  );
  left.rotation.set(-Math.PI / 2, -0.09, 0);
  const canvas = pageCanvas();
  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  const page = put(book, sheet(LEAF.w, LEAF.h, 0.35), ps1(w, { map: texture }), 0.52, 0.16, 0);
  page.rotation.set(-Math.PI / 2, 0.09, 0);
  // A ribbon marker across the left leaf.
  put(book, box(0.05, 0.01, 1.5), ps1(w, { tint: '#6a5a8a' }), -0.25, 0.2, 0.02);
  const camera = new PerspectiveCamera(42, 16 / 9, 0.05, 30);
  return { scene, camera, page, texture, canvas };
};

const deskSet = keptFor(build);

/** A point on the page (in its texels) as the frame's own pixels: through the 3D camera, the low-res grid and `ctx`. */
const onFrame = (f: JobFrame, d: Desk, px: number, py: number) => {
  const p = new Vector3((px / PAGE.w - 0.5) * LEAF.w, (0.5 - py / PAGE.h) * LEAF.h, 0);
  p.applyMatrix4(d.page.matrixWorld).project(d.camera);
  const x = ((p.x + 1) / 2) * f.w;
  const y = ((1 - p.y) / 2) * f.h;
  const m = f.ctx.getTransform();
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
};

/** The highlight's box on the page, as a box on the frame. */
const boxOnFrame = (f: JobFrame, d: Desk, b: Box): Box => {
  const corners = [
    onFrame(f, d, b.x, b.y),
    onFrame(f, d, b.x + b.w, b.y),
    onFrame(f, d, b.x, b.y + b.h),
    onFrame(f, d, b.x + b.w, b.y + b.h),
  ];
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
};

const stage = (f: JobFrame, r: Rig, d: Desk): Box => {
  const w = r.world;
  w.ambient.value.copy(rgb('#8a8f98'));
  w.sunDir.value.set(-0.3, 0.9, 0.35).normalize();
  w.sunColor.value.copy(rgb('#7c7a74'));
  w.glowColor.value.set(0, 0, 0);
  w.fogColor.value.copy(rgb(ROOM.fog));
  w.fogNear.value = 3;
  w.fogFar.value = 9;

  const lit = paintPage(d.canvas, f.at('sweep'), PAGE_STYLE, f.hand('verse'));
  d.texture.needsUpdate = true;

  // The camera settles over the verse on `page`, then pushes slowly in and across it.
  const settle = f.at('page');
  const drift = f.t * 0.018;
  d.camera.position.set(
    lerp(0.85, 0.47, settle) + drift,
    lerp(1.8, 1.0, settle) - drift * 1.6,
    lerp(1.2, 0.42, settle) - drift,
  );
  d.camera.lookAt(0.5 + drift * 0.5, 0.17, -0.1);
  d.camera.updateProjectionMatrix();

  r.renderer.setClearColor(ROOM.fog, 1);
  r.renderer.render(d.scene, d.camera);
  return boxOnFrame(f, d, lit);
};

/** Where no WebGL 2 can be had (`check --draw`): the page flat on the frame, the verse set on it. */
const fallback = (f: JobFrame): Box => {
  const { ctx, w, h } = f;
  ctx.fillStyle = ROOM.fog;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = PAGE.paper;
  ctx.fillRect(w * 0.2, h * 0.1, w * 0.6, h * 0.8);
  return verse(
    ctx,
    VERSE,
    { ...PAGE_STYLE, type: { ...PAGE_STYLE.type, size: 64 }, width: w * 0.5 },
    { x: w * 0.25, y: h * 0.35, highlight: f.at('sweep') },
    f.hand('verse'),
  );
};

export const job = (f: JobFrame): Box => {
  const r = rigOf();
  if (r === undefined) return fallback(f);
  const box = stage(f, r, deskSet(r));
  present(f.ctx, r.canvas, f.w, f.h);
  return box;
};

/** The card's face: the reference's bold sans, cream on the blue, "just" gold. */
const CARD_STYLE: CardStyle = {
  ground: CARD.ground,
  type: {
    family: fonts.body,
    size: 118,
    weight: 700,
    color: CARD.ink,
    leading: 1.12,
    tracking: -0.02,
  },
  payoffScale: 2.8,
  payoffColor: CARD.gold,
  payoffType: { weight: 700, tracking: -0.03 },
  case: 'said',
  align: 'left',
  treatment: {
    // A gold bar wiped in under the word, quick, in hard steps.
    draw: (ctx, b, since) => {
      const wipe = Math.ceil(clamp(since / 0.1) * 6) / 6;
      ctx.fillStyle = CARD.gold;
      ctx.fillRect(b.x, b.y + b.h * 0.93, b.w * wipe, b.h * 0.05);
    },
  },
};

/** The reference's lower case, but "God" keeps its capital. */
const lowered = (word: CardWord): CardWord =>
  /^\W*God\b/.test(word.text) ? word : { ...word, text: word.text.toLowerCase() };

export const card = (f: JobFrame, words: ReadonlyArray<CardWord>) =>
  fullCard(f, words.map(lowered), CARD_STYLE);
