// A small film for the lab's browser tests: three scenes, the first with two
// cues on its narration's marks and a point and a number knob, drawn so a
// handle can be read off the frame; the third a camera pushed in on a knob,
// with a cue that runs `until` a mark.

import { Result } from 'effect';
import { camera } from '../../canvas/camera.ts';
import { type Film, type FilmSpec, createFilm, drawing } from '../../canvas/film.ts';
import { REVIEW_FILES } from '../../core/api.ts';
import { estimate, hashText, parse, takeScript } from '../../core/narration.ts';
import type { VoiceTiming } from '../../core/schema.ts';
import { unmeasured } from '../../core/voiced.ts';
import { type Face, SUBSETS } from '../../player/face.ts';
import { narrationUrls } from '../../player/narrated.ts';

/** The probe film's name in its registry and in the lab's URLs. */
export const PROBE = 'probe';

const ball = drawing({
  timeline: {
    rise: { mark: 'rise', dur: 0.6 },
    fall: { mark: 'fall', dur: 0.4 },
  },
  // `tilt` is 0, as a knob at rest often is: it still gets its row. `lean`
  // is a literal finer than a field prints it (to the thousandth), drawn by nothing.
  knobs: { spot: [320, 200], size: 24, tilt: 0, lean: 0.1234 },
  draw: (f) => {
    const [x, y] = f.knob('spot');
    const tilt = f.knob('tilt');
    f.ctx.fillStyle = '#2a2520';
    f.ctx.beginPath();
    f.ctx.arc(
      x,
      y - 80 * f.at('rise') + 80 * f.at('fall'),
      f.knob('size'),
      tilt,
      tilt + Math.PI * 2,
    );
    f.ctx.fill();
  },
});

const rest = drawing({
  timeline: {},
  draw: (f) => {
    f.ctx.fillStyle = '#6a5a48';
    f.ctx.fillRect(40, 40, 120, 80);
  },
});

/**
 * A shot pushed in 2× on `face`: `pole` is read before the camera and drawn
 * inside it, as a film reads a camera's knobs at the top of its draw. The
 * pole lands at (120, 280) on the frame, and `face` at its centre.
 */
const shot = drawing({
  // A cue that ends on a mark, as a push in that lands on a word does: its end is the mark's.
  timeline: { push: { mark: 'near', until: 'held' } },
  knobs: { face: [400, 200], faceZoom: 2, pole: [300, 250] },
  draw: (f) => {
    const face = f.knob('face');
    const pole = f.knob('pole');
    camera(f.ctx, { x: face[0], y: face[1], zoom: f.knob('faceZoom') }, 640, 360, () => {
      f.ctx.fillStyle = '#2a2520';
      f.ctx.fillRect(pole[0] - 4, pole[1] - 40, 8, 40);
      f.ctx.beginPath();
      f.ctx.arc(face[0], face[1], 12, 0, Math.PI * 2);
      f.ctx.fill();
    });
  },
});

/**
 * A face the probe film draws in, as an app's films have theirs
 * (`pictureFaces`): a file of the lab's (the review's files route), so a
 * test can hold it back and see what waits for it.
 */
export const PROBE_FACE: Face = {
  family: 'Probe Face',
  url: `${REVIEW_FILES}probe-face.woff2`,
  range: SUBSETS.latin,
  weight: '100 800',
  style: 'normal',
};

/**
 * The probe film, laid out afresh. Every scene held still (`drift: 0`): the
 * knob tests measure where the scenes and the camera put things.
 */
export const probeFilm = (): Film => createFilm(probeSpec());

const probeSpec = (): FilmSpec => ({
  title: 'Probe',
  width: 640,
  height: 360,
  fps: 30,
  paper: { base: '#f4ecd8', tone: '#2a2520', seed: 1 },
  shade: '#000',
  scenes: [
    {
      id: 'one',
      say: 'The ball {rise}rises slowly, and then it {fall}falls down again.',
      ...ball,
      drift: 0,
    },
    { id: 'two', say: 'A second scene, with nothing to move.', ...rest, drift: 0 },
    {
      id: 'three',
      say: 'A third scene, pushed {near}in close on a {held}face.',
      ...shot,
      drift: 0,
    },
  ],
});

/**
 * The probe film with a master to play (`narrationUrls`): each scene's take
 * recorded as its own estimate, so it lays out and draws as `probeFilm` does,
 * and only its narration is new.
 */
export const narratedProbeFilm = (): Film => {
  const spec = probeSpec();
  const take = (id: string, say: string) => {
    const parsed = Result.getOrThrow(parse(id, say));
    const words = unmeasured(estimate(parsed.spoken));
    const timing: VoiceTiming = {
      hash: hashText(takeScript(parsed)),
      file: `${id}.wav`,
      duration: words.at(-1)?.end ?? 0,
      words,
      source: 'recorded',
    };
    return [id, timing] as const;
  };
  return createFilm({
    ...spec,
    timings: {
      voice: '',
      scenes: Object.fromEntries(spec.scenes.map((s) => take(s.id, s.say ?? ''))),
    },
    audio: narrationUrls(PROBE).audio,
  });
};
