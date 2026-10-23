/**
 * The motion's shaders (WebGL2, GLSL ES 3.00), drawn over the still they
 * move (`./scene.ts`). Each draws its still unchanged while `u_ramp` is 0, so
 * the canvas takes over from the picture with no step, and the motion grows
 * in as the ramp rises to 1.
 *
 * - The field: the near plants sway in a wind whose gusts run from right to
 *   left (the wind map's red, `kit/field-paint.ts`). Over the sky (its
 *   green) the sun's rays turn slowly about the sun (`TURN`, `./sun.ts`): the
 *   shader takes the light the still bakes in off each pixel and lays it on
 *   again with the rays turned, so no fixed fan stays behind the moving one,
 *   and a turn of 0 (time 0, or `u_turning` 0) leaves the still as it is.
 *   The light flows out along the turned rays.
 * - The night: the painted stars twinkle, and fainter stars drift across the
 *   sky above the hills.
 */
import { ASPECT, GLOW, LIGHT, RAY_REACH, RAYS, SUN, TURN } from './sun.ts';

const float = (n: number) => {
  const text = String(n);
  if (text.includes('.') || text.includes('e')) return text;
  return `${text}.0`;
};

/** The canvas's one quad, its uv running down the canvas as a picture's does. */
export const VERTEX = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = vec2(a_position.x * 0.5 + 0.5, 0.5 - a_position.y * 0.5);
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const NOISE = `
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 s = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), s.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), s.x), s.y);
}`;

const rays = RAYS.map(
  (ray) =>
    `  d = atan(sin(a - ${float(ray.angle)}), cos(a - ${float(ray.angle)})) / ${float(ray.width)};\n  sum += ${float(ray.strength)} * exp(-d * d);`,
).join('\n');

/**
 * How far a plant's tip sways, as a share of the painting's width, at a
 * gust's full push: enough that the owner sees the field move at a glance on
 * desktop and on a phone, while it still drifts slowly with the gusts. The
 * owner saw it at 0.016 and chose "Keep it" (ask abdbb63c754).
 */
const SWAY = 0.016;

export const FIELD_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D u_still;
uniform sampler2D u_wind;
uniform vec4 u_map;
uniform float u_time;
uniform float u_ramp;
uniform float u_turning;
in vec2 v_uv;
out vec4 color;
${NOISE}
float raysToward(float a) {
  float sum = 0.0;
  float d;
${rays}
  return sum;
}
void main() {
  vec2 uv = v_uv * u_map.xy + u_map.zw;
  vec4 wind = texture(u_wind, uv);
  float sway = wind.r;
  float t = u_time;
  float gust = noise(vec2(uv.x * 2.6 + t * 0.32, t * 0.07));
  float flutter = sin(t * 4.1 + uv.x * 23.0) * 0.12 + sin(t * 5.7 + uv.x * 41.0 + uv.y * 9.0) * 0.06;
  float push = (0.25 + gust * 0.75 + flutter) * sway * ${float(SWAY)} * u_ramp;
  vec2 from = uv - vec2(-push, push * 0.3 * sway);
  vec3 c = texture(u_still, from).rgb;
  vec2 q = vec2(uv.x - ${float(SUN.u)}, (uv.y - ${float(SUN.v)}) / ${float(ASPECT)});
  float beyond = max(0.0, length(q) - ${float(SUN.radius)});
  float a = atan(q.y, q.x);
  float turn = u_turning * ${float(TURN.swing)} * sin(${float(2 * Math.PI)} * t / ${float(TURN.period)});
  float fade = exp2(-beyond / ${float(RAY_REACH)});
  float glow = ${float(GLOW.strength)} * exp(-beyond / ${float(GLOW.reach)});
  float turned = raysToward(a - turn) * fade;
  vec3 tint = vec3(${LIGHT.map(float).join(', ')});
  vec3 baked = 1.0 - min(1.0, glow + raysToward(a) * fade) * tint;
  vec3 moved = 1.0 - min(1.0, glow + turned) * tint;
  c = 1.0 - (1.0 - c) * mix(vec3(1.0), moved / baked, wind.g);
  float light = turned + glow * 0.4;
  float flow = noise(vec2((a - turn) * 30.0, beyond * 16.0 - t * 0.55)) - 0.5;
  float shimmer = light * flow * 0.9 * wind.g * u_ramp;
  c = 1.0 - (1.0 - c) * (1.0 - shimmer * tint);
  color = vec4(c, 1.0);
}`;

/** The moon's place in the night painting, which does not twinkle. */
const MOON = { u: 0.846, v: 0.176, radius: 0.05 } as const;

export const NIGHT_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D u_still;
uniform vec4 u_map;
uniform float u_time;
uniform float u_ramp;
in vec2 v_uv;
out vec4 color;
${NOISE}
void main() {
  vec2 uv = v_uv * u_map.xy + u_map.zw;
  vec3 c = texture(u_still, uv).rgb;
  vec3 around = textureLod(u_still, uv, 3.0).rgb;
  vec3 luma = vec3(0.299, 0.587, 0.114);
  float l = dot(c, luma);
  float sky = 1.0 - smoothstep(0.4, 0.47, uv.y);
  float moon = smoothstep(${float(MOON.radius)}, ${float(MOON.radius * 1.4)}, length(vec2(uv.x - ${float(MOON.u)}, (uv.y - ${float(MOON.v)}) / ${float(ASPECT)})));
  float t = u_time;
  float star = max(0.0, l - dot(around, luma) - 0.05) * sky * moon;
  vec2 cell = floor(uv * vec2(256.0, 170.0));
  float h = hash(cell);
  float twinkle = sin(t * (2.6 + h * 2.4) + h * 40.0) * 0.6 + sin(t * (4.3 + h * 3.1) + h * 17.0) * 0.4;
  c += vec3(1.0, 0.95, 0.82) * star * twinkle * 1.4 * u_ramp;
  vec2 p = vec2(uv.x * ${float(ASPECT)}, uv.y) * 70.0 + vec2(t * 0.06, t * 0.012);
  vec2 g = floor(p);
  float k = hash(g + 7.0);
  vec2 at = vec2(hash(g + 1.0), hash(g + 2.0)) * 0.6 + 0.2;
  float dot_ = (1.0 - smoothstep(0.0, 0.09, length(fract(p) - at))) * step(0.9, k);
  float glow = 0.55 + 0.45 * sin(t * (2.2 + k * 3.0) + k * 60.0);
  float dark = 1.0 - smoothstep(0.16, 0.3, l);
  c += vec3(0.86, 0.9, 1.0) * dot_ * glow * 0.4 * sky * moon * dark * u_ramp;
  color = vec4(c, 1.0);
}`;
