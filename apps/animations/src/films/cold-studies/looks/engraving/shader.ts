// The burin: one shader every surface of the engraved courtroom is cut with.
// It lights a point as a print maker would study it (a key light through the
// hall's window, a second through the rose window behind the bench, a bounce
// off the lit floor, the air the shafts cross) and turns the light into lines
// only: tone is never grey, it is the width of a line. Each surface carries
// two or three families of parallel lines laid in its own object space,
// around a column or a robe as rings (a cylinder's cross-contours), across a
// wall in courses, so the lines ride the forms as they move and never swim
// in screen space. A line swells where the form darkens and thins to nothing
// in the light; past a middle tone a second family crosses it, and in the
// deepest shadow a third. Line density keeps a printed scale on screen: each
// family picks its octave from how fast its coordinate runs per pixel, and a
// finer octave's lines grow out of nothing between the coarser ones, so a
// push in never pops a line.

/** The vertex stage: object, world and normal for the burin. */
export const VERTEX = /* glsl */ `
attribute vec2 aHatch;
attribute float aShade;
varying vec3 vObj;
varying vec3 vObjN;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vHatch;
varying float vShade;
void main() {
  vObj = position;
  vObjN = normal;
  vHatch = aHatch;
  vShade = aShade;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

/** The fragment stage: light, then lines. */
export const FRAGMENT = /* glsl */ `
precision highp float;
varying vec3 vObj;
varying vec3 vObjN;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vHatch;
varying float vShade;

// The hall's light, shared by every surface.
uniform vec3 uL;          // the window's light, the way it travels
uniform vec4 uWin;        // the window: its wall's x, its centre z and y, its half width
uniform float uWinH;      // the window's half height below its arch
uniform vec3 uL2;         // the rose window's light, the way it travels
uniform vec4 uRose;       // the rose window: its wall's z, its centre x and y, its radius
uniform float uRoseOn;    // how much the rose window gives, 0..1+
uniform float uRoseTurn;  // the rose's tracery, turned
uniform sampler2D uShadow;
uniform mat4 uLightMat;
uniform float uShadowTexel;
uniform vec3 uPool;       // where the window's light lands: the bounce
uniform float uPeriod;    // the closest two lines of a family may stand on screen, px
uniform float uAir;       // how thick the hall's air is with dust
uniform float uKey;
uniform float uFill;

// The surface's own.
uniform float uAlbedo;
uniform int uMode;        // 0 a box's faces, 2 a body turned about its own y, 5 the mesh's own lines (aHatch)
uniform float uRot;       // the first family's turn in the surface's (u, s)
uniform float uCross;     // the second family's turn from the first
uniform float uRadius;    // a turned body's radius: the s of its lines along it
uniform float uSpacing;   // the coarsest line spacing, world units
uniform vec3 uJoints;     // masonry: course height, block length, strength
uniform vec4 uTint;       // a hand-tinted wash: colour and strength
uniform vec4 uTintAt;     // where on the body it is laid (object space) and how wide
uniform float uDark;      // a surface's own darkening
uniform float uRim;       // how strongly its turning edge darkens (a contour)
uniform float uGlow;      // a surface that is light: the windows
uniform float uSeed;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  return 0.5 * vnoise(p) + 0.3 * vnoise(p * 2.1 + 7.3) + 0.2 * vnoise(p * 4.3 + 1.7);
}

// The window: an arched light with a cross of stone bars, in its own plane (q: across, up).
float windowSdf(vec2 q, float hw, float hh) {
  float body = max(abs(q.x) - hw, -hh - q.y);
  float arch = length(q - vec2(0.0, hh)) - hw;
  float d = q.y > hh ? arch : body;
  float bars = min(abs(q.x) - 0.07, abs(q.y - hh * 0.35) - 0.06);
  return max(d, -bars);
}

// The rose: a round light with spokes of tracery.
float roseSdf(vec2 q, float r) {
  float d = length(q) - r;
  float a = atan(q.y, q.x) + uRoseTurn;
  float spoke = abs(sin(a * 4.0)) * length(q) - 0.05;
  float hub = length(q) - r * 0.22;
  return max(d, -min(spoke, max(hub, -(length(q) - r * 0.12))));
}

// How much of the window a world point sees along the light.
float gobo(vec3 p) {
  float t = (p.x - uWin.x) / uL.x;
  if (t < 0.0) return 0.0;
  vec3 q = p - uL * t;
  float pen = 0.02 + t * 0.012;
  return 1.0 - smoothstep(-pen, pen, windowSdf(vec2(q.z - uWin.y, q.y - uWin.z), uWin.w, uWinH));
}

float gobo2(vec3 p) {
  float t = (p.z - uRose.x) / uL2.z;
  if (t < 0.0) return 0.0;
  vec3 q = p - uL2 * t;
  float pen = 0.02 + t * 0.01;
  // The verdict's light is for him: it spends itself past where he stands.
  float spent = 1.0 - 0.8 * smoothstep(10.5, 13.5, t);
  return spent * (1.0 - smoothstep(-pen, pen, roseSdf(vec2(q.x - uRose.y, q.y - uRose.z), uRose.w)));
}

float shadowAt(vec3 p, float bias) {
  vec4 lp = uLightMat * vec4(p, 1.0);
  vec3 s = lp.xyz / lp.w * 0.5 + 0.5;
  if (s.x <= 0.0 || s.x >= 1.0 || s.y <= 0.0 || s.y >= 1.0 || s.z >= 1.0) return 1.0;
  float lit = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 o = vec2(float(i / 2) - 0.5, float(i - (i / 2) * 2) - 0.5) * uShadowTexel;
    lit += s.z - bias > texture2D(uShadow, s.xy + o).r ? 0.0 : 1.0;
  }
  return lit * 0.25;
}

float shadowOne(vec3 p) {
  vec4 lp = uLightMat * vec4(p, 1.0);
  vec3 s = lp.xyz / lp.w * 0.5 + 0.5;
  if (s.x <= 0.0 || s.x >= 1.0 || s.y <= 0.0 || s.y >= 1.0 || s.z >= 1.0) return 1.0;
  return s.z - 0.004 > texture2D(uShadow, s.xy).r ? 0.0 : 1.0;
}

// The dust the shafts light between the eye and the surface.
float air(vec3 from, vec3 to) {
  vec3 d = to - from;
  float len = min(length(d), 40.0);
  vec3 dir = normalize(d);
  float jitter = hash(gl_FragCoord.xy * 0.37);
  float acc = 0.0;
  float acc2 = 0.0;
  const int N = 10;
  for (int i = 0; i < N; i++) {
    vec3 x = from + dir * len * (float(i) + jitter) / float(N);
    acc += gobo(x) * shadowOne(x);
    acc2 += gobo2(x);
  }
  float step = len / float(N);
  // Seen down its length the rose's shaft would fog the whole picture: it is held to a veil.
  return uAir * acc * step + min(uAir * acc2 * uRoseOn * 1.6 * step, 0.22);
}

// How much of a pixel a line covers: a line of half width h (in periods) at
// distance d from the pixel's centre, the pixel pw periods wide.
float cover(float d, float h, float pw) {
  float a = max(-h, d - pw * 0.5);
  float b = min(h, d + pw * 0.5);
  return clamp((b - a) / pw, 0.0, 1.0);
}

// One family of lines along coordinate x (world units), dx its change per
// pixel, laying ink over the share cov of its period.
float family(float x, float dx, float cov) {
  float k = log2(uSpacing / (uPeriod * max(dx, 1e-7)));
  float n = floor(k);
  float t = k - n;
  float S = uSpacing * exp2(-n);
  float xp = x / S;
  float pw = dx / S;
  float even = abs(fract(xp + 0.5) - 0.5);
  float odd = abs(fract(xp) - 0.5);
  float he = cov * (1.0 - 0.5 * t) * 0.5;
  float ho = cov * 0.5 * t * 0.5;
  return max(cover(even, he, pw), cover(odd, ho, pw));
}

// A joint in masonry: a hairline at every course and block.
float joint(vec2 us, vec2 dus) {
  if (uJoints.z <= 0.0) return 0.0;
  float cy = us.x / uJoints.x;
  float row = floor(cy);
  float cx = us.y / uJoints.y + 0.5 * mod(row, 2.0);
  float dy = abs(fract(cy + 0.5) - 0.5) * uJoints.x / max(dus.x, 1e-6);
  float dxx = abs(fract(cx + 0.5) - 0.5) * uJoints.y / max(dus.y, 1e-6);
  float w = 0.9;
  return uJoints.z * max(1.0 - smoothstep(w, w + 1.0, dy), 1.0 - smoothstep(w, w + 1.0, dxx));
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  if (!gl_FrontFacing) N = -N;

  // The surface's own coordinates, in which its lines are laid.
  vec2 us;
  if (uMode == 2) {
    us = vec2(vObj.y, atan(vObj.x, vObj.z) * uRadius);
  } else if (uMode == 5) {
    us = vHatch;
  } else {
    vec3 an = abs(vObjN);
    us = an.y > 0.6 ? vec2(vObj.z, vObj.x) : (an.x > an.z ? vec2(vObj.y, vObj.z) : vec2(vObj.y, vObj.x));
  }

  // The light on it.
  float bias = 0.0025 + 0.004 * (1.0 - abs(dot(N, uL)));
  float key = max(dot(N, -uL), 0.0) * gobo(vWorld) * shadowAt(vWorld, bias);
  float key2 = max(dot(N, -uL2), 0.0) * gobo2(vWorld) * uRoseOn;
  vec3 toPool = uPool - vWorld;
  float pd = length(toPool);
  float bounce = max(dot(N, toPool / pd), 0.0) * 1.0 / (1.0 + pd * pd * 0.06);
  float sky = 0.5 + 0.5 * N.y;
  // The hall's dark gathers overhead and far off.
  float high = mix(1.0, 0.45, smoothstep(3.5, 10.5, vWorld.y));
  float lum = uAlbedo * (uKey * key + 1.15 * key2 + 0.9 * bounce + uFill * sky * high);
  float dist = length(cameraPosition - vWorld);
  lum *= mix(1.0, 0.6, smoothstep(10.0, 24.0, dist));
  lum += air(cameraPosition, vWorld);
  float edge = 1.0 - abs(dot(N, V));
  float tone = clamp(1.0 - lum, 0.0, 1.0);
  tone = clamp(tone + uDark + vShade + uRim * smoothstep(0.55, 0.95, edge) * (0.4 + 0.6 * (1.0 - key)), 0.0, 1.0);
  // Even the lights keep a hairline: only the windows are bare paper.
  tone = mix(0.1, 1.0, tone);

  // The window itself: paper with its stone bars in ink.
  float lit = 0.0;
  if (uGlow > 0.0) {
    float g = 1.0 - smoothstep(-0.02, 0.02, windowSdf(vec2(vWorld.z - uWin.y, vWorld.y - uWin.z), uWin.w, uWinH));
    float r = 1.0 - smoothstep(-0.02, 0.02, roseSdf(vec2(vWorld.x - uRose.y, vWorld.y - uRose.z), uRose.w));
    lit = max(g, r * clamp(0.35 + uRoseOn, 0.0, 1.0));
    tone = mix(tone, 0.0, lit);
  }

  // The lines: a family across the form, one crossing it, one more in the dark.
  float wob = (vnoise(us.yx * (1.3 / uSpacing) * 0.05 + uSeed) - 0.5) * uSpacing * 0.5;
  float c1 = cos(uRot), s1 = sin(uRot);
  float c2 = cos(uRot + uCross), s2 = sin(uRot + uCross);
  float c3 = cos(uRot + uCross * 0.5 + 1.2), s3 = sin(uRot + uCross * 0.5 + 1.2);
  float a = c1 * us.x + s1 * us.y + wob;
  float b = c2 * us.x + s2 * us.y + wob * 0.6;
  float c = c3 * us.x + s3 * us.y;
  float da = fwidth(a), db = fwidth(b), dc = fwidth(c);
  vec2 dus = fwidth(us);

  // One family carries the tone far (a wood engraver's swelling line), a
  // second crosses it only in the shadows, a third only in the deepest dark.
  float covA = 0.86 * smoothstep(0.03, 0.86, tone);
  float covB = 0.62 * smoothstep(0.72, 1.0, tone);
  float covC = 0.5 * smoothstep(0.93, 1.0, tone);
  float inkA = family(a, da, covA);
  float inkB = family(b, db, covB);
  float inkC = family(c, dc, covC);
  float ink = 1.0 - (1.0 - inkA) * (1.0 - inkB) * (1.0 - inkC);
  ink = max(ink, joint(us, dus) * (0.35 + 0.65 * tone) * (1.0 - lit));

  // The ink takes to the paper unevenly.
  ink *= 0.86 + 0.14 * vnoise(gl_FragCoord.xy * 0.35);

  // A hand-tinted wash laid over the print, its edge bleeding.
  float tint = 0.0;
  if (uTint.a > 0.0) {
    float r = length(vObj - uTintAt.xyz) / uTintAt.w;
    float n = fbm(vObj.xy * 9.0 + vObj.z * 5.0);
    tint = uTint.a * (1.0 - smoothstep(0.55, 1.0, r + 0.45 * (n - 0.5)));
  }

  vec3 inkColor = vec3(0.105, 0.085, 0.07);
  float alpha = ink + (1.0 - ink) * tint;
  vec3 rgb = inkColor * ink + uTint.rgb * tint * (1.0 - ink);
  gl_FragColor = vec4(rgb, alpha);
}
`;
