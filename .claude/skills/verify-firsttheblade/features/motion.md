# Motion

A visitor who has not asked for less motion sees the home page's field
move: the near wheat sways in the wind, gusts crossing it from the right,
and a light shimmers out along the rays from the sun on the right horizon.
At the foot of each page the night's painted stars twinkle and faint stars
drift. Pointing at a series card, pressing it or focusing its link stirs its
emblem: the suns rise and their rays reach out, the tree sways, the book
turns a leaf. A visitor who asks for less motion sees the stills and the
emblems at rest.

## Sub-features

- `motion-hero`: the field's wind and shimmer, a WebGL2 canvas laid over the
  field's still (`apps/firsttheblade/src/motion/scene.ts`).
- `motion-night`: the night's twinkling and drifting stars, the same way.
- `motion-takeover`: the canvas shows once its first frame is drawn, the
  still itself, and its motion fades in over 2.5 s: the page never jumps.
- `motion-pause`: a canvas draws only while it is on the screen and the tab
  is shown.
- `motion-card`: a card's emblem stirred by a fine pointer's hover, a press,
  or its link's keyboard focus; a tap on a touch screen leaves no card
  stirred.
- `motion-less`: with `prefers-reduced-motion: reduce`, the motion script is
  never fetched, no canvas is laid and no card stirs.

## How to get to it (user POV)

- The home page's field, as it opens; a page's own field is the same
  painting, shorter.
- The night close at the foot of every page.
- The series cards on the home page.
- The system's "reduce motion" setting, for `motion-less`.

## Driving it with agent-browser

- **Preconditions:** the baseline, and a Chrome with WebGL2 (headless Chrome
  has it through SwiftShader).
- **States:** default, focus-visible (the card's link), and less motion; the
  rest are n/a.
- **Regression:** `apps/firsttheblade/src/motion/sun.test.ts`,
  `apps/firsttheblade/src/motion/cover.test.ts`,
  `apps/firsttheblade/src/motion/shaders.test.ts`,
  `apps/firsttheblade/src/motion/styles.test.ts`,
  `apps/firsttheblade/src/ui/emblems.test.ts`,
  `apps/firsttheblade/kit/field-paint.test.ts`,
  `apps/firsttheblade/kit/field-still.test.ts` and
  `apps/firsttheblade/kit/approval.test.ts`.

1. **Hero.** `ab set viewport 1280 800`, `ab open $O/`, then
   `ab record start "$EVIDENCE/motion/motion.webm"`. After 4 s,
   `ab eval "document.querySelectorAll('canvas.motion-on').length"` reads 2
   (the field's and the night's). The video shows the wheat swaying and the
   light moving out from the sun; nothing in the sky moves from the top left.
2. **Takeover.** `ab open $O/` again and `ab screenshot 1-first.png` as soon
   as the page loads, then hide the canvas
   (`ab eval "document.querySelector('canvas.motion').style.visibility='hidden'"`)
   and `ab screenshot 2-still.png`: the field in the two shots is the same to
   the eye.
3. **Night.** `ab scroll down 4000`, wait 4 s: the painted stars twinkle and
   faint ones drift in the dark sky, and the moon and the words stay still.
4. **Card hover.** `ab scroll up 4000`, then
   `ab hover "a[href='/series/the-path-of-the-just']"`: the path's sun swells
   up from its horizon and its rays reach out over 0.6 s, and fall back when
   the pointer leaves. Hover each of the four; the book's leaf crosses from
   right to left.
5. **Card focus.** `ab press Tab` until a card's link is focused: the card's
   emblem stirs as on hover, and rests again when the focus moves on.
6. **Phone.** `ab set viewport 390 844` and reload: the field and the night
   move as on the desktop; a tap on a card opens its series and leaves no
   emblem stirred on the way back.
7. **Less motion.** `ab set media light reduced-motion`, then `ab open $O/`:
   `ab eval "document.querySelectorAll('canvas.motion').length"` reads 0, and
   a hovered card's emblem stays at rest. Then `ab record stop`.
8. **Proof.** `ab snapshot` and `ab screenshot` into `$EVIDENCE/motion/`.

## Gotchas

- A screenshot is a still: only the video shows the motion. Record at real
  timing, never a sped-up clock: the wind's gusts take seconds to cross.
- The stylesheet's CSP is `style-src 'self'`, so a style tag added from a
  drive is refused; set an element's `style` from `ab eval` instead.
- Reading a WebGL canvas into a screenshot stalls the GPU, and Chrome logs a
  "GPU stall due to ReadPixels" warning: it is the drive's, not the site's.
- The field's still is the kit's (`bun run --cwd apps/firsttheblade kit:field`).
  Its rules: a still is approved only if its SHA-256 equals a file that an
  image block of the approving ask showed, and that ask's `stills` answer is
  `approve`; and every image file of the built site (`dist/`, found by its
  bytes, `apps/firsttheblade/kit/build-walk.ts`) is in the approval record
  or in a named list of images outside the rule, each with its reason
  (`apps/firsttheblade/kit/served.ts` `OUTSIDE`). The record is
  `apps/firsttheblade/kit/approved-stills.json`. The build walk is the guard
  (`kit:shippable`, run first by the stack on stage `prod`);
  `apps/firsttheblade/kit/field-still.test.ts` is the fast check over the
  source. Whether a still's light comes from the sun is the owner's look,
  not a measure: on the stage, hash each served still against the record,
  and judge the light by eye at 1:1.
- An approval ask shows every pinned still byte for byte as an image block;
  a crop or a render of it is not the still. The coordinator pins the stills
  on the ask (`bun run --cwd apps/firsttheblade kit:pin --ask <id>`), and
  once the owner has answered, approves them
  (`bun run --cwd apps/firsttheblade kit:approve --ask <id>`), which reads
  the ask from the lab, hashes each image block it showed, and refuses each
  pinned still no shown file holds, any answer but approve, and any still
  changed since the pin. Every prod plan and deploy builds the site and
  refuses each built image the record and `OUTSIDE` do not hold
  (`kit:shippable`).
