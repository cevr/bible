# Style research: hand-made animated explainer

Research for a JS-rendered explainer on **righteousness by faith**. It covers three
references, the rendering stack we should use, and the visual moves worth building
as framework primitives.

Working files (videos, contact sheets, 12 fps bursts, cloned repos) are in the
session scratchpad under `refs/`. They are not committed. The instructive frames are
in [`ref-frames/`](ref-frames/).

| Source                                                                                                                                                     | What was studied                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| BibleProject, _Is Holiness Just Moral Perfection?_ (`l9vn5UvsHvM`, 6:34)                                                                                   | Painterly theme video: gold/teal, silhouettes, scrolls, radiance                                                         |
| BibleProject, _Agape – Love_ (`slyevQ1LW7A`, 4:48)                                                                                                         | Word-study format: flat vector, small square "card" on a grey page                                                       |
| Kevin Ngo, [x.com/kevin_t_ngo/status/2102437977435893771](https://x.com/kevin_t_ngo/status/2102437977435893771)                                            | 28 s, 2160², "Claude Opus 5.5 drew every frame of this animation in JavaScript" (downloaded through `api.fxtwitter.com`) |
| [JohnHeibel/PDoomVideo](https://github.com/JohnHeibel/PDoomVideo) + its successor [ClaudeAnimationBase](https://github.com/JohnHeibel/ClaudeAnimationBase) | Source for a p5.js + p5.brush watercolour music video                                                                    |

Method: `yt-dlp` at ≤480p, `ffmpeg` frames every 3 s tiled 6×6, 12 fps bursts over
3 s windows to study motion, `scdet` for hard-cut counts, and a coarse colour
histogram for palette. All hex values are approximate (quantised to 16 levels per
channel, then checked by eye).

---

## (a) BibleProject style breakdown

BibleProject is not one style. Each video uses a different illustration studio,
but they share one grammar. Both flavours are worth taking from.

### Palette

**Holiness (painterly)**: a colour arc carries the meaning.

| Role                  | Hex (≈)                                            | Where                                                      |
| --------------------- | -------------------------------------------------- | ---------------------------------------------------------- |
| Cosmic dark           | `#0C0C0C` / `#182828`                              | Opening, starfield, "HOLY" in space                        |
| Radiant gold          | `#E8C858`                                          | Sunburst, divine presence                                  |
| Burnt orange          | `#D88838` / `#C87828`                              | Sunburst rays, outer halo                                  |
| Pale flare            | `#F8F8C8` → `#FFFFFF`                              | Core of the light. Pure white is used, but only as _light_ |
| Slate teal (impurity) | `#688888` / `#486868` / `#889898`                  | "Impure = Death" scenes: cold, desaturated, smoky          |
| Silhouette ink        | `#2A3440` (blue-black, never pure black)           | Human figures                                              |
| Blood red             | `#A01818` (by eye)                                 | Drip splatter for death                                    |
| Mould green           | `#B8C848` on `#8A6A3A`                             | Decay/leprosy blob                                         |
| Parchment             | `#E8C078` / `#C89048` with red-brown ink `#8A2A18` | Scrolls, codex pages                                       |
| River blue            | `#78B8D8` / `#4898C8`                              | Ezekiel's river, life                                      |

The meaning follows temperature: **gold/warm = God's presence, life; cold teal =
impurity, death.** A figure that moves from teal space into gold space is the story.

**Agape (flat vector word-study)**

| Role                                | Hex (≈)                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Page (outer "desk" around the card) | `#DCDCD6` with faint speckle                                                                           |
| Card background options             | pink `#F8C8C8`, teal `#18B898`, navy `#181848`, cobalt `#284888`, khaki `#C8B878`, off-white `#F8F8F0` |
| Type ink                            | navy `#1C1C50`                                                                                         |
| Skin tones                          | khaki-olive `#B8A868`, dark `#3A3A3A`                                                                  |

Only 2–3 flat colours per card. Shadows are flat shapes, never gradients.

### Texture: what makes it feel hand-made

1. **Painted paper ground.** The Holiness backgrounds are big, visible brush
   strokes (dry-brush drag) in 2–3 close values with a mottled wash. Nothing is a
   flat fill. See [02](ref-frames/bp-holiness-02-impure-equals-death.jpg).
2. **Scumbled edges.** Clouds and smoke are drawn with bristly, feathered dry-brush
   edges. Light bursts have a _ragged splatter_ rim, not a clean circle
   ([01](ref-frames/bp-holiness-01-radiant-word-ring.jpg)).
3. **Tight inked detail on props.** Scrolls, codices and menorahs are drawn with
   fine red-brown pen hatching and illuminated lettering, over flat washes
   ([03](ref-frames/bp-holiness-03-hebrew-scroll-hands.jpg),
   [04](ref-frames/bp-holiness-04-book-page-to-world.jpg)).
4. **Figures are flat silhouettes.** Simple human shapes are one flat shape
   (blue-black or white) with at most a few interior lines. Faces appear only in
   close-ups ([05](ref-frames/bp-holiness-05-radiant-figure-sunburst.jpg)).
5. **Speckle/grain overlay.** The Agape cards carry a faint white fleck noise
   across flat colour, which kills the "vector" look.
6. **Wobbly vector lines.** Dividers are hand-waved sine curves, not rulers
   ([08](ref-frames/bp-agape-08-wavy-split-contrast.jpg)).

### Character design

- **Holiness:** faceless silhouettes for "a person", described characters (Isaiah,
  priests, Jesus) in a woodcut-ish flat style with a few line details. Hands are
  white, stylised, gloved-looking shapes that enter from the frame edge.
- **Agape:** tall, angular, mid-century flat figures with big noses and beards,
  2–3 colours, no outlines. Characters are cropped heavily (a face filling half
  the card).
- **Both:** the character is a _symbol_ of a category ("humanity", "the
  worshipper"), so it stays generic. Detail goes on props and text.

### Text, Hebrew and Greek

- English key words use **wide-tracked thin geometric caps** (`H O L Y`,
  `MORALLY PURE`) centred in space. They fade or type in and never bounce.
- Words **orbit** a glowing centre as a ring of small caps separated by dots
  (`UNIQUE • POWERFUL • SOURCE OF LIFE`) — [01](ref-frames/bp-holiness-01-radiant-word-ring.jpg).
- **Equations** as grammar: `IMPURE = DEATH` spelled across the frame, with each
  side illustrated in place (blood, decay) — [02](ref-frames/bp-holiness-02-impure-equals-death.jpg).
- **Original-language words live on artefacts**: the Hebrew (`וַיִּקְרָא`, `ישעיה`)
  is written in red ink at the head of a parchment scroll or a codex page, and it
  cross-dissolves into the English book name in blackletter ("Leviticus",
  "Ezekiel"). Hands unroll the scroll ([03](ref-frames/bp-holiness-03-hebrew-scroll-hands.jpg)).
- **Word-study cards (Agape):** a label pill `GREEK | AGAPE` sits at the bottom
  of a scene. The language name is set in light weight, a hairline divider follows,
  and the word is set in bold ([07](ref-frames/bp-agape-07-aramaic-scroll.jpg)).
  Translation is shown by swapping a word in place on the same scroll
  (`ARAMAIC LOVE` → `ARAMAIC RAKHMAH`).
- **Scripture quotes** are big hand-lettered script over golden light ("Your guilt
  is taken away…"), written on stroke by stroke, or set in a condensed display
  face in a speech-bubble card with a tiny reference line (`Deuteronomy 6:5`).
- **Word-image fusion:** one letter is replaced by the object (`LO🍕E`, with the
  O as a pizza slice) — [06](ref-frames/bp-agape-06-word-image-fusion.jpg).

### Transitions (measured)

`scdet` finds only **1.5–1.8 hard cuts per minute** in both videos, yet the
contact sheets show a new composition every ~4–8 s. Almost every change is a
**continuous transformation**, not a cut:

- **Light swallows the scene.** A sunburst grows until the frame is white, then the
  next scene resolves out of the white (Holiness, used 5+ times; see the
  `hol_book` burst, where the frame goes white/gold and then pans away).
- **Silhouette whitening (the key one for us).** A dark figure holding the Torah
  scroll turns white from the top down over ~1.5 s. The white spreads like paint
  inside the figure's mask with a ragged front
  ([13](ref-frames/bp-holiness-13-burst-silhouette-whitening.jpg), a 12 fps
  burst). _This is imputed/imparted righteousness drawn as a single move._
- **Brush-stroke wipe inside a card.** A pink dry-brush stroke drags across a blue
  field, its bristly edge settles into a wavy vector edge, and then text types in
  line by line ([14](ref-frames/bp-agape-14-burst-brush-wipe.jpg)).
- **Pan across a continuous mural.** Scroll → temple → river → landscape are one
  long painted strip, and the camera slides along it. The page of the Ezekiel codex
  pans right into the temple wall inside the page, then _out of the book_ into a
  top-down river ([04](ref-frames/bp-holiness-04-book-page-to-world.jpg)).
- **Zoom-through.** The starfield becomes a galaxy, then the sun, then the sunburst.
  Continuous push-ins that change scale by orders of magnitude.
- **Morphs of line art.** A timeline arrow with ticks becomes the next diagram, and
  a wavy divider becomes an infinity loop that encloses both groups
  ([08](ref-frames/bp-agape-08-wavy-split-contrast.jpg)).
- **Colour-field swaps.** Agape changes the card background colour under a held
  character instead of cutting.
- **Stark reduction for the climax.** The cross is shown as a white-line drawing on
  black, and then the cross fills with a flat colour
  ([09](ref-frames/bp-agape-09-cross-lineart.jpg)).

### Pacing

- About one new _idea image_ every 4–8 s. The narration leads, and the picture lands
  about 0.3–0.5 s after the key word.
- Motion inside a held shot is slow and continuous: rays rotate, particles drift,
  and the camera creeps (about 2–5 % scale per shot). Nothing is fully static.
- A 12 fps look for character/prop motion (held frames), but smooth 24/30 fps
  camera moves and light. Mixing the two is part of the hand-made feel.

### How abstract ideas become pictures

| Idea                        | Visual                                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| Holiness / God's presence   | A sun: radiant white core, gold rays, ragged burst rim; things that approach glow or burn |
| Danger of approaching       | A figure shields its face with an arm; a cone of shadow behind it                         |
| Impurity / death            | Cold teal smoke, blood drips, decay blob, skeleton, all around a dark silhouette          |
| Purification                | Silhouette turns white (paint sweep inside the mask)                                      |
| Scripture / history         | Physical scroll or codex that the camera enters                                           |
| Contrast between two things | A wavy vertical split, one side for each                                                  |
| Relationship / covenant     | An infinity loop drawn around two groups                                                  |
| Word meaning                | Word-image fusion; word-ring around a symbol                                              |
| Time span                   | A white arrow along a horizon line with label `600ISH YEARS`                              |

---

## (b) Kevin Ngo reference ("What do you love?")

Accessible via fxtwitter JSON. The MP4 was downloaded at 720² from
`video.twimg.com`. The video is 28 s, square 1:1, and has 25 hard cuts, which is
**~53 cuts/min (≈1.1 s per shot)**: a much faster, montage-style pace than
BibleProject. The tweet says Claude Opus 5.5 drew every frame in JavaScript.

**Look: cut-paper collage, picture-book.**

- **Torn-paper edges.** Every major shape (night-sky bands, notebook page, heart,
  planet disc) has a white, fibrous torn rim, as if the shape were ripped from
  coloured paper and laid on top. The rim is a thin, irregular white band outside
  the shape ([12](ref-frames/ngo-12-torn-paper-night.jpg)).
- **Crayon/pastel fill texture.** Flat colours carry fine directional grain (like
  oil pastel or coloured pencil on rough paper). Wood-grain streaks on the desk.
- **Printed-paper inlays.** Some shapes are filled with _newsprint/book text_ (the
  cloud, the teacup stripes, the heart's background), which is classic collage.
- **No outlines.** Shapes are defined by colour and torn edges only. Faces are
  minimal: dot eyes, a curved-line mouth, round blush circles.
- **Rounded handwritten type**, written on stroke by stroke by a hand holding a
  pen, with the hand's position synced to the writing head. In the next shot the
  page is torn out (paper fragments fly off the spiral binding) and folded into a
  paper plane ([10](ref-frames/ngo-10-handwritten-notebook.jpg), burst `kev_a`).
- **Palette:** cream paper `#F8F8E8`, kraft/desk `#B88858`/`#D8A868`, mustard
  `#E8C848`, coral `#D87858`, pink `#E888A8`, teal-green `#389888`, night navy
  `#262A6E`, plum `#5A3A8A`. Saturated but chalky, with no pure black.
- **Structure:** a thread motif (the paper plane) carries the story between
  locations. A montage of one-word cards ("words", "the sea", "dogs", "rain", "the
  stars", "tea") each show the character inside a symbol of that word. The montage
  then collapses into one collage heart that holds every earlier object
  ([11](ref-frames/ngo-11-collage-heart.jpg)). The ending rhymes with the
  opening (the same window, now answered).

**Takeaways for us:** the torn-edge collage is cheap to render deterministically
(it is a polygon offset with high-frequency noise) and reads as hand-made
immediately. The "montage collapses into one symbol" structure suits a summary beat
(for example, every earlier motif gathering into the robe or the cross).

---

## (c) PDoomVideo: architecture and techniques

The code lives in `refs/PDoomVideo` in the scratchpad. It is about 1.3k lines of
shared code, plus one file per chapter. It was all generated by Claude Opus 5.5.
ClaudeAnimationBase is the cleaned-up, general version.

### Rendering

- **p5.js 2.x in WEBGL mode plus [p5.brush](https://github.com/acamposuribe/p5.brush)**
  for all painting: watercolour fills with bleed and texture, hatching, and
  pressure-tapered natural-media strokes. A `paint(pts, opts)` wrapper turns
  "one point list" into flat wash, watercolour fill, hatch and a tapered ink outline.
- A **2D compositor canvas** (`#out`) receives the WebGL frame, then lettering
  (Canvas2D text), then a **multiplied grain and vignette**, then the karaoke.
- Custom brushes are defined once:

```js
brush.add('ink', {
  type: 'default',
  weight: 5,
  scatter: 0.25,
  sharpness: 0.8,
  grain: 40,
  opacity: 235,
  spacing: 0.2,
  pressure: [1.15, 0.75],
  rotate: 'natural',
  noise: 0.15,
});
brush.add('dry', {
  type: 'default',
  weight: 14,
  scatter: 3,
  sharpness: 0.3,
  grain: 6,
  opacity: 90,
  spacing: 0.6,
  pressure: [1, 0.6],
  rotate: 'natural',
  noise: 0.4,
});
```

### Paper, grain and vignette (precomputed once, seeded)

```js
function lcg(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
// Paper: base colour + 70 faint brown radial blotches + 1400 short curved fibres.
for (let i = 0; i < 70; i++) {
  /* radialGradient rgba(160,125,80, .045*rnd) */
}
for (let i = 0; i < 1400; i++) {
  /* quadraticCurveTo fibre, rgba(110,88,60, .035–.095) */
}
// Grain: per-pixel near-white noise, then a radial vignette, MULTIPLIED over the frame.
const v = 255 - (rnd() < 0.55 ? rnd() * rnd() * 34 : 0);
d[i] = v;
d[i + 1] = v - 1;
d[i + 2] = v - 3;
c.globalCompositeOperation = 'multiply';
c.drawImage(grainC, 0, 0);
```

The paper goes _under_ everything and the grain goes _over_ everything with
multiply, so the pigment sits in the paper. The grain is static: it does not
change per frame, which avoids video-noise shimmer.

### Boiling lines (the key hand-drawn trick)

```js
const BOIL = 12; // linework re-randomises 12×/s
randomSeed(1000 + Math.floor(T * BOIL)); // at the start of every frame
const jit = (a) => (random() * 2 - 1) * a; // used inside every point generator
const hash = (i) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}; // stable
```

- `jit()` gives outline wobble that changes 12 times a second (hand-drawn "boil"),
  even when rendering at 24 fps. Held twos are baked in.
- `hash(i)` gives per-object randomness that must _not_ boil (star positions).
- ClaudeAnimationBase fixes a flaw in this: one global stream means adding a shape
  makes every later shape jitter differently. The fix is to reseed per element:

```js
const boilSeed = (key) => {
  let h = 2166136261;
  for (const c of key + '|' + BOILN) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  randomSeed(h >>> 0);
}; // FNV-1a(key + boil frame)
```

### Timeline and scene structure

- **Everything is a pure function of `t`.** Frames render in parallel and out of
  order, so there is no state between frames and no `Math.random()`.
- `chapter(name, start, end, [[t0, shotFn], ...])` builds a registry. A shot is
  `fn(t, lt, dur)` (global time, local time, shot length) and paints the whole
  frame. `drawWorld(t)` finds the chapter and shot, calls it, then applies the
  global overlays: the brush wipes at chapter boundaries and the karaoke.
- Timing helpers: `seg(t,a,b)` (0..1 progress), `kf(t, [[t0,v0],...], ease)`
  (keyframes over numbers or arrays), `pulse(t)` (a decaying beat hit),
  `backOut`/`elasticOut`, and `shakeXY(t, amt)` (hash-based, stepped at 24 fps).
- Camera: `camBegin(cx, cy, zoom, rot)` / `camEnd()`, which puts a world point at
  screen centre. Lettering is projected through the camera separately
  (`toScreen`), because it lives on the 2D compositor.
- Transition primitives: `wipe(p)` (5 ragged fat paint bands sweep across, the scene
  swaps at p = .5 under full cover, then the bands drag off), `iris(cx,cy,r)`, and
  `irisShape(pts)` (paints everything _outside_ any star-shaped outline, for
  heart or keyhole reveals), and `flash(k)`.
- Emotions never snap: `mood(t, keys)` inserts a squint, a squash-and-stretch
  "take" and an emote pop around every face change.

### Export (headless Chrome → ffmpeg)

```js
// page side
window.renderAt = async (t, type = 'image/png', q = 0.92) => {
  T = t;
  await redraw();
  composite(t);
  return outC.toDataURL(type, q);
};
// node side (puppeteer-core)
await page.goto(fileUrl + '?render', { waitUntil: 'networkidle0' });
await page.waitForFunction('window.ready === true'); // set after document.fonts.load(...)
const url = await page.evaluate((t) => window.renderAt(t, 'image/jpeg', 0.94), i / fps);
// clip mode: pipe JPEGs straight into ffmpeg
spawn('ffmpeg', [
  '-f',
  'image2pipe',
  '-framerate',
  '24',
  '-c:v',
  'mjpeg',
  '-i',
  '-',
  '-i',
  audio,
  '-c:v',
  'libx264',
  '-crf',
  '19',
  '-pix_fmt',
  'yuv420p',
  '-shortest',
  out,
]);
```

- Time is **pulled, not played**: there is no `requestAnimationFrame`, and `noLoop()`
  plus `redraw()` draws exactly one frame per call. Determinism comes from design,
  so no clock virtualisation is needed.
- **Parallel and resumable:** N worker pages pull the next missing frame index,
  write `f.tmp`, then rename. Files already on disk (over 1 KB) are skipped.
- **QA tools** for the agent loop: `--sheet=t1,t2,…` renders a contact sheet with
  ms/frame, and `--stills` renders full-resolution PNGs. The model looked at its own
  sheets to iterate. That is worth copying as a first-class command.
- Chrome flags: `--ignore-gpu-blocklist --enable-gpu-rasterization
--use-angle=d3d11` (Windows). On macOS, use `--use-angle=metal`. p5.brush
  watercolour fills are GPU-heavy, about 1–4 s per frame, and far slower in
  software GL.
- Their `ANIMATION_GUIDE.md` rules are worth adopting as-is: _one read at a time_,
  _fast actions, slow meanings_, _every seam gets a transition_, _no text unless it
  is the joke_, _storyboard with timed "reads" before code_, _rhyme the ending
  with the opening_.

---

## (d) Recommended rendering stack

**Goal:** deterministic, frame-by-frame, exportable to MP4, paper/grain look, and
agent-friendly (fast contact sheets).

### Core decision: Canvas 2D first, with p5.brush as an optional layer

| Option                                                         | Verdict                                                                                                                                                                                                         |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Canvas 2D + own seeded brush primitives** (recommended core) | Fast (tens of ms per frame on CPU), fully deterministic, and composites in simple layers. Wobble, torn edges, dry-brush and grain are all cheap point-list and texture tricks.                                  |
| p5.js + p5.brush (WEBGL)                                       | The best watercolour look, and proven by PDoom. But it is GPU-bound (1–4 s per frame), a global-state API, and hard to layer. Use it only for backgrounds and washes, rendered to an offscreen canvas per shot. |
| SVG + `feTurbulence`/`feDisplacementMap`                       | A good edge-roughening filter, but filter cost scales with resolution and must be rasterised through the DOM each frame. Use it for authoring or preview, not the main path.                                    |
| WebGL/regl custom shaders                                      | Best for a full-frame paper-grain/bleed post-pass if we outgrow Canvas2D. Not needed for v1.                                                                                                                    |

### Line and shape tools (all deterministic when seeded)

- **[perfect-freehand](https://github.com/steveruizok/perfect-freehand)**: turns a
  point list with pressure into a tapered outline polygon (`getStroke(points,
{size, thinning, smoothing, streamline, simulatePressure})`). It is pure and
  deterministic. **Best choice for ink strokes and write-on handwriting:** feed it a
  growing prefix of points for draw-on animation.
- **[Rough.js](https://roughjs.com)**: sketchy lines, fills and hachure. Pass
  `seed: n` (non-zero) for repeatability. For a boil, use `seed = baseSeed +
Math.floor(t * 12)`. Good for diagrams (arrows, boxes, underlines), and it has a
  `roughness`/`bowing` look. `rc.generator` returns drawables without drawing.
- **Own `wobble(pts, amp, seed)`**: displace each vertex along its normal by value
  noise sampled at `(arcLength * freq, boilFrame)`. Use low frequency for the line
  wobble and high frequency plus a white rim for torn paper. This is the PDoom
  `jit()` idea, but noise-based, so it stays coherent along the line.
- SVG turbulence, for reference:
  `<feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="{boilFrame}"/><feDisplacementMap in="SourceGraphic" scale="4"/>`.
  Changing `seed` at 12 fps makes it boil. It is deterministic in Chromium.

**Boil rule:** geometry noise is keyed by `(elementId, floor(t * 12))`, and
per-object identity is keyed by `hash(elementId)`. Every element gets its own seed
stream (the ClaudeAnimationBase fix).

### Texture stack (per frame)

1. Paper base: precomputed once from a seed. Warm off-white `#F3EBDC`-ish, with
   faint blotches and fibres (the PDoom `makePaper`).
2. Scene layers drawn in world space through a camera `(cx, cy, zoom, rot)`.
3. Dry-brush and wash fills: sprite-stamped bristle texture clipped to the shape
   path, with multiply blend at 0.6–0.9 alpha.
4. Light: additive radial glow (`globalCompositeOperation = 'lighter'`) for divine
   light. Keep it separate from pigment, as ClaudeAnimationBase's `glow()` does.
5. Static grain and vignette canvas, multiplied over everything. Optional fleck
   layer (BibleProject Agape speckle).
6. Text: layout in DOM-free Canvas2D after `document.fonts.load()`.

### Time and export

- `render(t): void` is pure. A `scene(t)` registry resolves shots as in PDoom:
  `[[t0, shotFn], …]` with `(t, lt, dur)`.
- Page API: `window.ready` and `window.renderAt(t) → Promise<Blob>` (use
  `canvas.toBlob`, or read the raw RGBA through `getImageData` for lossless output).
- Driver: **Playwright or puppeteer-core** plus system Chrome, with N parallel
  pages, a resumable `out/frames/f%05d.png`, and `--sheet` and `--stills` modes.
  Encode with `ffmpeg -framerate 30 -i f%05d.png -i narration.wav -c:v libx264
-crf 17 -pix_fmt yuv420p -movflags +faststart`. For a fast preview, pipe JPEG
  through `image2pipe`.
- Frame rates: render at **30 fps** for smooth camera and light, with the boil at
  **12 fps** and character poses held on twos (`floor(t * 12) / 12`) for the
  hand-made cadence.
- Optional later: in-browser WebCodecs `VideoEncoder` plus an MP4 muxer to skip the
  PNG round trip. It is not needed for v1.
- Audio drives time: the narration WAV and a cue sheet (word timestamps) give shot
  times. Put picture hits about 0.3 s after the spoken key word.

### Proposed look for this series ("gold and teal on paper")

A mix of BibleProject Holiness (meaning carried by colour temperature, radiance,
silhouettes, scrolls) and the Ngo collage (torn paper, crayon grain):

- Ground `#F3EBDC` paper. Ink `#2A3440`. Sin/death teal `#486868`/`#688888`.
  Grace gold `#E8C858`, ember `#D88838`, light core `#FFF8E0`. Blood `#9A1C1C`.
  Robe white `#FAF6EC`. Sky/river `#78B8D8`. Parchment `#E8C078` with red ink
  `#8A2A18`.
- Silhouette people. Detail goes on symbolic props (robe, scroll, ledger, altar,
  cross).
- Type: a thin wide-tracked sans for concept words, script for quoted Scripture,
  and Hebrew/Greek shown on parchment in red ink with a transliteration and gloss
  pill (`GREEK | DIKAIOSUNĒ · "righteousness"`).

---

## (e) Ten visual moves to build as framework primitives

Each is a pure `(t, params) → draw` with a progress `p ∈ [0,1]`.

1. **`maskFillSweep(shape, fromColor, toColor, p, dir)`**: a colour front spreads
   inside a silhouette mask with a ragged, boiling edge (BibleProject's whitening
   figure, [13](ref-frames/bp-holiness-13-burst-silhouette-whitening.jpg)). _The
   central move for this series:_ a filthy-rags silhouette receives Christ's white
   robe (Isa 61:10, Zech 3:3-5).
2. **`brushWipe(p, colors, angle)`**: 3–5 dry-brush bands drag across with bristle
   edges, the scene swaps under full cover, and the bands drag off (PDoom `wipe`
   plus the Agape card wipe). It marks chapter breaks.
3. **`radianceBurst(center, p)`**: rotating sunburst rays, an additive glow core, a
   ragged splatter rim, and it grows to white-out as a transition. Divine presence,
   or "light swallows the scene".
4. **`muralPan(strip, keys)`**: one long world strip with keyframed camera travel,
   plus parallax layers (sky 0.3×, mid 0.7×, fore 1×). Continuous story without
   cuts (sanctuary court → holy place → most holy).
5. **`zoomThrough(target, p)`**: the camera dives into an object (a scroll's word, a
   door, the veil), and the inner scene is already painted inside it. The book page
   becomes the world.
6. **`scrollReveal(word, lang, gloss, p)`**: parchment unrolls (hands optional),
   the original-language word is written in red ink, and it cross-dissolves into the
   English plus the label pill. The word-study beat for צְדָקָה / δικαιοσύνη /
   πίστις / λογίζομαι.
7. **`writeOn(text|path, p, {font, hand})`**: stroke-by-stroke handwriting. Sample
   glyph outlines or centerlines, grow a perfect-freehand stroke along them, and
   optionally follow the writing head with a hand sprite (Ngo notebook). For quoted
   Scripture.
8. **`wordRing(center, words, p)` and `wordFusion(word, index, object)`**: key
   words orbit a symbol on a circle path, and one letter swaps for an icon. For
   concept definition ("FAITH" with the A as an open hand).
9. **`wavySplit(p)` → `loopMorph(p)`**: a hand-wobbled vertical divider sets two
   states side by side (by works | by faith, law | grace), then morphs into an
   enclosing shape (infinity loop, or a heart) that unites them. Contrast, then
   reconciliation.
10. **`tornPaper(shape, {rim, seed})` + `ledgerExchange(p)`**: collage shapes with
    fibrous white torn rims (Ngo). The signature exchange uses them: a torn "debt"
    page from the sinner's ledger is lifted and pinned onto the cross, and a
    "credit" page (Christ's record) is laid over the sinner's ledger, which shows
    imputation as a physical swap of paper.

Supporting primitives that everything uses: `wobble()` and `boilSeed()`, `camera`,
`kf`/`seg`/easings (`backOut`, `elasticOut`), `glow()`, `grainOverlay`, `iris` and
`irisShape`, and `--sheet` contact-sheet rendering for agent QA.

## Reference frames

| File                                            | Shows                                                        |
| ----------------------------------------------- | ------------------------------------------------------------ |
| `bp-holiness-01-radiant-word-ring.jpg`          | Radiant burst with a word ring around the "HOLY" core        |
| `bp-holiness-02-impure-equals-death.jpg`        | Equation text, silhouette, cold teal, blood and decay        |
| `bp-holiness-03-hebrew-scroll-hands.jpg`        | Hebrew title on a parchment scroll, white hands              |
| `bp-holiness-04-book-page-to-world.jpg`         | Codex page with an illustration panel that the camera enters |
| `bp-holiness-05-radiant-figure-sunburst.jpg`    | Flat figure against a sunburst                               |
| `bp-holiness-13-burst-silhouette-whitening.jpg` | 12 fps burst: silhouette turns white inside its mask         |
| `bp-agape-06-word-image-fusion.jpg`             | Word with one letter replaced by an object                   |
| `bp-agape-07-aramaic-scroll.jpg`                | Word-study label pill and a photo-bubble montage             |
| `bp-agape-08-wavy-split-contrast.jpg`           | The wavy split has morphed into an infinity loop             |
| `bp-agape-09-cross-lineart.jpg`                 | Stark white line art on black for the climax                 |
| `bp-agape-14-burst-brush-wipe.jpg`              | 12 fps burst: dry-brush wipe settling, then text typing in   |
| `ngo-10-handwritten-notebook.jpg`               | Handwritten write-on with a torn notebook                    |
| `ngo-11-collage-heart.jpg`                      | Montage objects collapse into one collage heart              |
| `ngo-12-torn-paper-night.jpg`                   | Torn-paper bands with crayon grain                           |
