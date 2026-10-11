// The oil pass: what turns the painted frame into a painting. The frame the
// brush has painted is read into a WebGL 2 texture and drawn back through one
// fragment shader that
//
// 1. pushes the paint about like a loaded brush: a Kuwahara filter (four
//    overlapping quadrants, each pixel taking the calmest quadrant's mean,
//    softly weighted), so gradients break into flat strokes and edges stay
//    sharp;
// 2. inks the forms: a dark teal line where the value turns, found by a Sobel
//    on the frame, whose reach and weight grow as the paint darkens, so edges
//    thicken in shadow and thin to nothing in the light;
// 3. raises the paint off the canvas: a little relief lit from the upper left
//    (impasto), and the canvas's plain weave under it all, fixed to the frame
//    as a painting's canvas is;
// 4. lays the gold leaf: wherever the brush used the one gold paint (`GOLD`),
//    the shader lays beaten leaf instead, sheets with seams and a sheen that
//    travels across it with the frame's time.
//
// Everything is set from the frame (its size, its time), so the pass is a pure
// function of the painted frame and T. Where no WebGL 2 canvas can be made
// (`check --draw`'s stand-in) the frame stays as the brush left it.

import { glCanvas } from '@bible/film/canvas';
import { P } from './palette.ts';

/** How strongly a frame is painted over. */
export interface Oil {
  /** The Kuwahara's sample pitch, px at 1920 wide: its reach is three of these. */
  readonly brush: number;
  /** The ink's weight, 0 none. */
  readonly ink: number;
  /** The canvas weave's depth, 0 none. */
  readonly weave: number;
  /** The paint's relief, 0 flat. */
  readonly impasto: number;
  /** How deep each stroke's bristle streaks are, 0 none. */
  readonly bristles: number;
  /** The frame's time, seconds: the leaf's sheen travels with it. */
  readonly t: number;
}

const VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** What both passes share: the frame, its size, and how they read it. */
const COMMON = `#version 300 es
precision highp float;
uniform sampler2D src;
uniform vec2 res;
uniform float pitch;
out vec4 outColor;

// A texel read whole (no filtering: the cheapest read a software GL has), held inside the frame.
vec3 tap(vec2 p) { return texelFetch(src, ivec2(clamp(p, vec2(0.0), res - 1.0)), 0).rgb; }
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`;

/**
 * The first pass, at half the frame's size (a quarter of its pixels, and the
 * filter the costliest part): a Kuwahara over one 5 x 5 grid of taps, 1.5
 * pitch apart (a reach of three pitches), each tap counted in every quadrant
 * it falls in (3 x 3 each), so the shared middle row and column are read once.
 */
const KUWAHARA = `${COMMON}
void main() {
  vec2 p = gl_FragCoord.xy * 2.0;
  vec3 m0 = vec3(0.0), m1 = vec3(0.0), m2 = vec3(0.0), m3 = vec3(0.0);
  vec3 s0 = vec3(0.0), s1 = vec3(0.0), s2 = vec3(0.0), s3 = vec3(0.0);
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      vec3 c = tap(p + vec2(float(i), float(j)) * pitch * 1.5);
      vec3 c2 = c * c;
      if (i <= 0 && j <= 0) { m0 += c; s0 += c2; }
      if (i >= 0 && j <= 0) { m1 += c; s1 += c2; }
      if (i <= 0 && j >= 0) { m2 += c; s2 += c2; }
      if (i >= 0 && j >= 0) { m3 += c; s3 += c2; }
    }
  }
  m0 /= 9.0; m1 /= 9.0; m2 /= 9.0; m3 /= 9.0;
  float v0 = dot(s0 / 9.0 - m0 * m0, vec3(1.0));
  float v1 = dot(s1 / 9.0 - m1 * m1, vec3(1.0));
  float v2 = dot(s2 / 9.0 - m2 * m2, vec3(1.0));
  float v3 = dot(s3 / 9.0 - m3 * m3, vec3(1.0));
  float w0 = 1.0 / pow(max(v0, 0.0) + 0.0004, 2.0);
  float w1 = 1.0 / pow(max(v1, 0.0) + 0.0004, 2.0);
  float w2 = 1.0 / pow(max(v2, 0.0) + 0.0004, 2.0);
  float w3 = 1.0 / pow(max(v3, 0.0) + 0.0004, 2.0);
  outColor = vec4((m0 * w0 + m1 * w1 + m2 * w2 + m3 * w3) / (w0 + w1 + w2 + w3), 1.0);
}`;

/** The second pass, at the frame's size: the Kuwahara's paint drawn up, then ink, bristles, relief, weave and leaf. */
const FRAGMENT = `${COMMON}
uniform sampler2D paint;
uniform float unit;
uniform float inkAmount;
uniform float weave;
uniform float impasto;
uniform float bristles;
uniform float time;
uniform vec3 gold;
uniform vec3 inkColor;

void main() {
  vec2 p = gl_FragCoord.xy;
  vec3 src0 = tap(p);
  // 1. The Kuwahara's paint, drawn up from half size; but where gold paint lies
  // within the filter's reach, the frame as painted, so lettering in leaf keeps
  // its cut (the filter would smear its strokes into the ground round it).
  vec3 col = texture(paint, p / res).rgb;
  float r = pitch * 3.0;
  float goldNear = 0.0;
  goldNear = max(goldNear, 1.0 - smoothstep(0.035, 0.09, distance(src0, gold)));
  goldNear = max(goldNear, 1.0 - smoothstep(0.035, 0.09, distance(tap(p + vec2(r, 0.0)), gold)));
  goldNear = max(goldNear, 1.0 - smoothstep(0.035, 0.09, distance(tap(p - vec2(r, 0.0)), gold)));
  goldNear = max(goldNear, 1.0 - smoothstep(0.035, 0.09, distance(tap(p + vec2(0.0, r)), gold)));
  goldNear = max(goldNear, 1.0 - smoothstep(0.035, 0.09, distance(tap(p - vec2(0.0, r)), gold)));
  col = mix(col, src0, goldNear);

  // 2. Ink: a Sobel whose reach grows in shadow.
  float L = lum(col);
  float dark = 1.0 - smoothstep(0.08, 0.55, L);
  float e = unit * mix(1.4, 3.2, dark);
  float tl = lum(tap(p + vec2(-e, e))), tc = lum(tap(p + vec2(0.0, e))), tr = lum(tap(p + vec2(e, e)));
  float ml = lum(tap(p + vec2(-e, 0.0))), mr = lum(tap(p + vec2(e, 0.0)));
  float bl = lum(tap(p + vec2(-e, -e))), bc = lum(tap(p + vec2(0.0, -e))), br = lum(tap(p + vec2(e, -e)));
  float gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
  float gy = (tl + 2.0 * tc + tr) - (bl + 2.0 * bc + br);
  float g = length(vec2(gx, gy));
  float edge = smoothstep(mix(0.22, 0.12, dark), mix(0.55, 0.32, dark), g);
  // Only the darker side of a turn takes the line, so it sits in the shadow.
  float darker = step(lum(src0), (tl + tc + tr + ml + mr + bl + bc + br) / 8.0 + 0.01);
  // (Not round the leaf: its cut edge is its own line.)
  col = mix(col, inkColor, clamp(edge * darker * inkAmount * mix(0.55, 1.0, dark) * (1.0 - goldNear), 0.0, 0.92));

  // 3. Bristles: each stroke's streaks, running along the form (across the
  // value's turn, read off the Sobel), or along a slow field of directions
  // where the paint is flat.
  vec2 qn = p / unit;
  vec2 cellA = floor(qn / 90.0);
  float field = 6.2832 * mix(hash(cellA), hash(cellA + 1.0), 0.5);
  float ang = g > 0.06 ? atan(gy, gx) + 1.5708 : field;
  vec2 dirv = vec2(cos(ang), sin(ang));
  float along = dot(qn, dirv);
  float across = dot(qn, vec2(-dirv.y, dirv.x));
  float lane = floor(across / 2.2);
  float bristle = hash(vec2(lane, floor(along / 26.0 + hash(vec2(lane, 7.0)))));
  col *= 1.0 + bristles * (bristle - 0.5);

  // 4. Impasto and the weave, on the frame's own grid at 1920 wide.
  vec2 d = vec2(-1.0, 1.0) * unit * 1.5;
  float relief = lum(tap(p + d)) - lum(tap(p - d));
  col += relief * impasto;
  vec2 q = p / unit / 7.0;
  vec2 cell = floor(q);
  vec2 f = fract(q);
  float over = mod(cell.x + cell.y, 2.0);
  float warp = sin(f.x * 3.14159) * (0.75 + 0.25 * sin(f.y * 3.14159));
  float weft = sin(f.y * 3.14159) * (0.75 + 0.25 * sin(f.x * 3.14159));
  float thread = mix(warp, weft, over) + (hash(cell) - 0.5) * 0.35;
  col *= 1.0 + weave * (thread - 0.55);

  // 5. Gold leaf where the gold paint is.
  float leaf = 1.0 - smoothstep(0.035, 0.09, distance(src0, gold));
  if (leaf > 0.0) {
    // Sheets laid in courses like brick, each row set off by its own amount, the
    // seams thin and broken, each sheet its own warmth, and a crinkle over all.
    vec2 lg = p / unit / 46.0;
    float lrow = floor(lg.y);
    lg.x += 0.5 * mod(lrow, 2.0) + 0.3 * hash(vec2(lrow, 3.0));
    vec2 sheet = floor(lg);
    vec2 inSheet = fract(lg);
    float tone = 0.9 + 0.14 * hash(sheet);
    float ledge = min(min(inSheet.x, 1.0 - inSheet.x), min(inSheet.y, 1.0 - inSheet.y));
    float broken = step(0.35, hash(floor(p / unit / 9.0)));
    float crinkle = 0.06 * (hash(floor(p / unit / 3.0)) - 0.5);
    float seam = 1.0 - 0.16 * broken * (1.0 - smoothstep(0.0, 0.025, ledge)) + crinkle;
    float band = (p.x / res.x) * 1.3 + (1.0 - p.y / res.y) * 0.5 - fract(time * 0.25) * 2.6 + 0.4;
    float sheen = exp(-band * band * 18.0);
    vec3 leafColor = gold * tone * seam * (0.9 + 0.25 * (1.0 - p.y / res.y));
    leafColor += vec3(1.0, 0.92, 0.66) * sheen * 0.55;
    leafColor += vec3(0.25, 0.2, 0.08) * relief * 3.0;
    col = mix(col, leafColor, leaf);
  }
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

/** A linked program and its uniforms, looked up once each. */
interface Program {
  readonly program: WebGLProgram;
  readonly at: (name: string) => WebGLUniformLocation | null;
}

/**
 * A context's compiled pass: its two programs, the texture the frame is read
 * into, and the half-size texture (and its framebuffer) the Kuwahara paints.
 */
interface Pass {
  readonly kuwahara: Program;
  readonly finish: Program;
  readonly vao: WebGLVertexArrayObject;
  readonly texture: WebGLTexture;
  readonly half: WebGLTexture;
  readonly fbo: WebGLFramebuffer;
}

/** Each WebGL 2 context's pass, compiled the first time it paints; none where it would not compile. */
const passes = new WeakMap<WebGL2RenderingContext, Pass | null>();

const shader = (gl: WebGL2RenderingContext, kind: number, source: string) => {
  const s = gl.createShader(kind);
  if (s === null) return null;
  gl.shaderSource(s, source);
  gl.compileShader(s);
  return gl.getShaderParameter(s, gl.COMPILE_STATUS) === true ? s : null;
};

const link = (gl: WebGL2RenderingContext, fragment: string): Program | null => {
  const vs = shader(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = shader(gl, gl.FRAGMENT_SHADER, fragment);
  const program = gl.createProgram();
  if (vs === null || fs === null || program === null) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) return null;
  const locations = new Map<string, WebGLUniformLocation | null>();
  const at = (name: string) => {
    if (!locations.has(name)) locations.set(name, gl.getUniformLocation(program, name));
    return locations.get(name) ?? null;
  };
  return { program, at };
};

/** A texture read smoothly and held at its edges. */
const smoothTexture = (gl: WebGL2RenderingContext) => {
  const texture = gl.createTexture();
  if (texture === null) return null;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
};

const compile = (gl: WebGL2RenderingContext): Pass | null => {
  const kuwahara = link(gl, KUWAHARA);
  const finish = link(gl, FRAGMENT);
  const vao = gl.createVertexArray();
  const texture = smoothTexture(gl);
  const half = smoothTexture(gl);
  const fbo = gl.createFramebuffer();
  if (
    kuwahara === null ||
    finish === null ||
    vao === null ||
    texture === null ||
    half === null ||
    fbo === null
  )
    return null;
  return { kuwahara, finish, vao, texture, half, fbo };
};

/** A hex colour as the shader's three floats. */
const rgb = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const GOLD = rgb(P.gold);
const INK = rgb(P.ink);

/**
 * The frame on `ctx` painted over in oil, in place: read whole, drawn back
 * through the pass (inside any clip `ctx` holds). False where no WebGL 2
 * canvas can be made, the frame left as it was.
 */
export const oil = (ctx: CanvasRenderingContext2D, o: Oil): boolean => {
  const { width, height } = ctx.canvas;
  if (width <= 0 || height <= 0) return false;
  const made = glCanvas('painterly-oil', width, height);
  if (made === undefined) return false;
  const { gl, canvas } = made;
  let pass = passes.get(gl);
  if (pass === undefined) {
    pass = compile(gl);
    passes.set(gl, pass);
  }
  if (pass === null) return false;
  const unit = width / 1920;
  const pitch = Math.max(0.5, o.brush * unit);
  const hw = Math.ceil(width / 2);
  const hh = Math.ceil(height / 2);
  gl.bindVertexArray(pass.vao);
  // The frame, read in.
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, pass.texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, ctx.canvas);
  // The Kuwahara, at half size, into its texture.
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, pass.half);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, hw, hh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, pass.fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pass.half, 0);
  gl.viewport(0, 0, hw, hh);
  const k = pass.kuwahara;
  gl.useProgram(k.program);
  gl.uniform1i(k.at('src'), 0);
  gl.uniform2f(k.at('res'), width, height);
  gl.uniform1f(k.at('pitch'), pitch);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  // The finish, at full size, onto the canvas.
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, width, height);
  const f = pass.finish;
  gl.useProgram(f.program);
  gl.uniform1i(f.at('src'), 0);
  gl.uniform1i(f.at('paint'), 1);
  gl.uniform2f(f.at('res'), width, height);
  gl.uniform1f(f.at('unit'), unit);
  gl.uniform1f(f.at('pitch'), pitch);
  gl.uniform1f(f.at('inkAmount'), o.ink);
  gl.uniform1f(f.at('weave'), o.weave);
  gl.uniform1f(f.at('impasto'), o.impasto);
  gl.uniform1f(f.at('bristles'), o.bristles);
  gl.uniform1f(f.at('time'), o.t);
  gl.uniform3f(f.at('gold'), ...GOLD);
  gl.uniform3f(f.at('inkColor'), ...INK);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, 0, 0, width, height);
  ctx.restore();
  return true;
};
