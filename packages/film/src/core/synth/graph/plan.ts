// The plan pass: every value drawn and every length found before a sample is
// made. A node plans to its length in frames and a fill that writes those
// frames into a zeroed array at least that long; a parent's fill runs its
// children's. Onsets and lengths are whole frames, rounded once each, so they
// add as integers and a thousand repetitions do not drift.
//
// A node's seed is the render's seed and its place: its path of child indexes
// from the root (a repetition's index too), or its `stream` name, which its
// children's paths then start from. So a named node and everything under it
// keep their draws wherever the node moves in its sound.

import { Match, Predicate } from 'effect';
import { rng } from '../../random.ts';
import { type Draws, drawInt, drawValue, plain, streamSeed, uniform } from './draw.ts';
import {
  ALLPASSES,
  COMBS,
  type FilterTracks,
  MODES,
  addInto,
  amplify,
  biquad,
  crossfade,
  dampOf,
  drive,
  echo,
  fade,
  gainsOf,
  hold,
  noise,
  oscillate,
  quantize,
  resample,
  reverb,
  ringFrames,
  roomFeedback,
  scale,
  strike,
} from './kernels.ts';
import { dbToGain, exp2, log } from './math.ts';
import type {
  CodeSound,
  Crush,
  Delay,
  Drive,
  Envelope,
  Fade,
  Filter,
  Gain,
  Key,
  Layer,
  Loop,
  Node,
  Noise,
  Osc,
  Partials,
  Pitch,
  Repeat,
  Resample,
  Reverb,
  Sample,
  Sequence,
  Value,
} from './nodes.ts';
import { pitchHz } from './pitch.ts';
import {
  PLAIN,
  type Track,
  type Unit,
  drawTrack,
  heldOf,
  pointsTrack,
  writeTrack,
} from './track.ts';
import { SYNTH_RATE, framesOf, poissonCap } from './units.ts';

/** A code sound ready to render: its graph, the key its degrees name, and the code sounds it samples, each resolved. */
export interface ResolvedSound {
  readonly name: string;
  readonly sound: CodeSound;
  /** The sound's key; a sound with no degree pitch names none, and C major stands in, never heard. */
  readonly key: Key;
  readonly samples: ReadonlyMap<string, ResolvedSound>;
  /** The hash of its graph and of each sound it samples: its request key. */
  readonly hash: string;
}

/** A node planned: its length in frames, and the fill that writes them into a zeroed array at least that long. */
interface Planned {
  readonly frames: number;
  readonly fill: (out: Float32Array) => void;
}

/** What one render shares across its nodes: buffers to borrow, zeroed, and the samples it has made. */
export interface Kit {
  readonly take: (frames: number) => Float32Array;
  readonly give: (buffer: Float32Array) => void;
  readonly takeWide: (frames: number) => Float64Array;
  readonly giveWide: (buffer: Float64Array) => void;
  /** `sound` rendered alone with `seed`, peaked: made once in a render, however often it is sampled. */
  readonly sample: (sound: ResolvedSound, seed: number) => Float32Array;
}

/** One render: its seed (the variant a `Pick` by seed plays), its sound, and its kit. */
interface Render {
  readonly seed: number;
  readonly sound: ResolvedSound;
  readonly kit: Kit;
}

/** Where a node sits: its path, and the repetitions a named stream adds to its name. */
interface Slot {
  readonly path: string;
  readonly reps: string;
}

/** The root's slot. */
export const ROOT: Slot = { path: '', reps: '' };

/** A node being planned: its draws, where its children's paths start, and its render. */
interface At extends Draws {
  readonly base: string;
  readonly reps: string;
  readonly render: Render;
}

/** A node's draws at `slot`: its seed from its stream's name, else from its path. */
const placed = (node: Node, slot: Slot, render: Render): At => {
  const base = node.stream === undefined ? slot.path : `${node.stream}${slot.reps}`;
  return {
    seed: streamSeed(render.seed, base),
    variant: render.seed,
    base,
    reps: slot.reps,
    render,
  };
};

const childOf = (at: At, index: number): Slot => ({ path: `${at.base}/${index}`, reps: at.reps });

const tickOf = (at: At, k: number): Slot => ({ path: `${at.base}/${k}`, reps: `${at.reps}#${k}` });

/** A pitch's unit in this render: Hz from its key, moved in octaves. */
const pitchUnit = (at: At): Unit<Pitch> => ({
  toNumber: (pitch) => pitchHz(pitch, at.render.sound.key),
  pitch: true,
});

/** A length in seconds, drawn, as frames. */
const framesAt = (secs: Value<number>, at: Draws, field: string): number =>
  framesOf(drawValue(secs, plain, at, field));

/** `track`'s first `frames` frames in a borrowed array: give it back after. */
const written = (kit: Kit, track: Track, frames: number): Float64Array => {
  const out = kit.takeWide(frames);
  writeTrack(track, out, frames);
  return out;
};

/** A child changed in place: its length, its fill, then `change` over its frames. */
const changed = (child: Planned, change: (out: Float32Array, n: number) => void): Planned => ({
  frames: child.frames,
  fill: (out) => {
    child.fill(out);
    change(out, child.frames);
  },
});

/** A child of a mix: its onset in frames, its gain, and its plan. */
interface Part {
  readonly at: number;
  readonly gain: number;
  readonly child: Planned;
}

/** Parts mixed, each from its onset: `frames` long, each part cut there, else as long as the latest one's end. */
const mixOf = (kit: Kit, parts: ReadonlyArray<Part>, frames?: number): Planned => {
  const length =
    frames ?? parts.reduce((most, part) => Math.max(most, part.at + part.child.frames), 0);
  return {
    frames: length,
    fill: (out) => {
      for (const part of parts) {
        // A part that starts at the end or past it is never heard: it is not made.
        if (part.at >= length) continue;
        const x = kit.take(part.child.frames);
        part.child.fill(x);
        addInto(out, x, Math.min(part.child.frames, length - part.at), part.at, part.gain);
        kit.give(x);
      }
    },
  };
};

// Sources.

const planOsc = (node: Osc, at: At): Planned => {
  const frames = framesAt(node.secs, at, 'secs');
  const pitch = drawTrack(node.pitch, pitchUnit(at), at, 'pitch', frames);
  const duty = drawTrack(node.duty ?? 0.5, PLAIN, at, 'duty', frames);
  const phase =
    node.phase === undefined || node.phase === 'random' ? uniform(at.seed, 'phase') : node.phase;
  const kit = at.render.kit;
  return {
    frames,
    fill: (out) => {
      const hz = written(kit, pitch, frames);
      const high = written(kit, duty, frames);
      oscillate(out, frames, node.wave, hz, high, phase);
      kit.giveWide(hz);
      kit.giveWide(high);
    },
  };
};

const planNoise = (node: Noise, at: At): Planned => {
  const frames = framesAt(node.secs, at, 'secs');
  const seed = streamSeed(at.seed, 'samples');
  return { frames, fill: (out) => noise(out, frames, node.color, seed) };
};

/** A struck note's attack when none is written, in seconds. */
const STRIKE_ATTACK = 0.006;

const planPartials = (node: Partials, at: At): Planned => {
  const frames = framesAt(node.secs, at, 'secs');
  const hz = drawValue(node.pitch, pitchUnit(at).toNumber, at, 'pitch');
  const modes = Predicate.isString(node.set) ? MODES[node.set] : node.set;
  const struck = {
    attack: drawValue(node.attack ?? STRIKE_ATTACK, plain, at, 'attack') * SYNTH_RATE,
    decayScale: drawValue(node.decayScale ?? 1, plain, at, 'decayScale'),
  };
  const seed = streamSeed(at.seed, 'phases');
  return { frames, fill: (out) => strike(out, frames, hz, modes, struck, seed) };
};

/** No frames: what a sample the resolve walk has not found plays (it refuses that sound first). */
const SILENT: Planned = { frames: 0, fill: () => undefined };

const planSample = (node: Sample, at: At): Planned => {
  const sound = at.render.sound.samples.get(node.sound);
  if (sound === undefined) return SILENT;
  const made = at.render.kit.sample(sound, node.seed ?? streamSeed(at.seed, 'seed'));
  return { frames: made.length, fill: (out) => out.set(made) };
};

// Shapers and the filter.

const planGain = (node: Gain, at: At): Planned => {
  const child = planNode(node.of, childOf(at, 0), at.render);
  const db = drawTrack(node.db, PLAIN, at, 'db', child.frames);
  const held = heldOf(db);
  const kit = at.render.kit;
  return changed(child, (out, n) => {
    if (held !== undefined) return scale(out, n, dbToGain(held));
    const gains = written(kit, db, n);
    gainsOf(gains, n);
    amplify(out, n, gains);
    kit.giveWide(gains);
  });
};

const planEnvelope = (node: Envelope, at: At): Planned => {
  const child = planNode(node.of, childOf(at, 0), at.render);
  const levels = pointsTrack(node.points, node.curve, PLAIN, at, 'points');
  const kit = at.render.kit;
  return changed(child, (out, n) => {
    const curve = written(kit, levels, n);
    amplify(out, n, curve);
    kit.giveWide(curve);
  });
};

const planFade = (node: Fade, at: At): Planned => {
  const child = planNode(node.of, childOf(at, 0), at.render);
  const fadeIn = framesAt(node.in ?? 0, at, 'in');
  const fadeOut = framesAt(node.out ?? 0, at, 'out');
  return changed(child, (out, n) => fade(out, n, fadeIn, fadeOut));
};

const planDrive = (node: Drive, at: At): Planned => {
  const child = planNode(node.of, childOf(at, 0), at.render);
  const db = drawTrack(node.db, PLAIN, at, 'db', child.frames);
  const kit = at.render.kit;
  return changed(child, (out, n) => {
    const gains = written(kit, db, n);
    gainsOf(gains, n);
    drive(out, n, gains, node.transfer);
    kit.giveWide(gains);
  });
};

const planCrush = (node: Crush, at: At): Planned => {
  const child = planNode(node.of, childOf(at, 0), at.render);
  const bits = node.bits === undefined ? undefined : drawInt(node.bits, at, 'bits');
  const hz = node.hz === undefined ? undefined : drawTrack(node.hz, PLAIN, at, 'hz', child.frames);
  const kit = at.render.kit;
  return changed(child, (out, n) => {
    if (hz !== undefined) {
      const rate = written(kit, hz, n);
      hold(out, n, rate);
      kit.giveWide(rate);
    }
    if (bits !== undefined) quantize(out, n, bits);
  });
};

const planResample = (node: Resample, at: At): Planned => {
  const child = planNode(node.of, childOf(at, 0), at.render);
  const ratio = exp2(drawValue(node.semitones, plain, at, 'semitones') / 12);
  const frames = Math.round(child.frames / ratio);
  const kit = at.render.kit;
  return {
    frames,
    fill: (out) => {
      const from = kit.take(child.frames);
      child.fill(from);
      resample(from, child.frames, out, frames, ratio);
      kit.give(from);
    },
  };
};

const planFilter = (node: Filter, at: At): Planned => {
  const child = planNode(node.of, childOf(at, 0), at.render);
  const hz = drawTrack(node.hz, pitchUnit(at), at, 'hz', child.frames);
  const q = drawTrack(node.q, PLAIN, at, 'q', child.frames);
  const db = drawTrack(node.db ?? 0, PLAIN, at, 'db', child.frames);
  const held = [hz, q, db].every((track) => heldOf(track) !== undefined);
  const kit = at.render.kit;
  return changed(child, (out, n) => {
    // Held, the filter reads its first frame alone.
    const span = held ? 1 : n;
    const tracks: FilterTracks = {
      hz: written(kit, hz, span),
      q: written(kit, q, span),
      db: written(kit, db, span),
      held,
    };
    biquad(out, n, node.type, tracks);
    kit.giveWide(tracks.hz);
    kit.giveWide(tracks.q);
    kit.giveWide(tracks.db);
  });
};

// Space.

/** The largest of a track's first `n` frames. */
const largest = (x: Float64Array, n: number): number => {
  let most = 0;
  for (let i = 0; i < n; i++) most = Math.max(most, x[i] ?? 0);
  return most;
};

const planDelay = (node: Delay, at: At): Planned => {
  const child = planNode(node.of, childOf(at, 0), at.render);
  const frames = child.frames + framesAt(node.tail, at, 'tail');
  const secs = drawTrack(node.secs, PLAIN, at, 'secs', frames);
  const mix = {
    feedback: drawValue(node.feedback, plain, at, 'feedback'),
    wet: drawValue(node.wet, plain, at, 'wet'),
  };
  const kit = at.render.kit;
  return {
    frames,
    fill: (out) => {
      child.fill(out);
      const behind = written(kit, secs, frames);
      const ring = kit.takeWide(ringFrames(largest(behind, frames)));
      echo(out, frames, behind, mix, ring);
      kit.giveWide(ring);
      kit.giveWide(behind);
    },
  };
};

const planReverb = (node: Reverb, at: At): Planned => {
  const child = planNode(node.of, childOf(at, 0), at.render);
  const frames = child.frames + framesAt(node.tail, at, 'tail');
  const room = {
    feedback: roomFeedback(drawValue(node.size, plain, at, 'size')),
    damp: dampOf(drawValue(node.damp, plain, at, 'damp')),
    wet: drawValue(node.wet, plain, at, 'wet'),
  };
  const kit = at.render.kit;
  return {
    frames,
    fill: (out) => {
      child.fill(out);
      const lines = {
        combs: COMBS.map((k) => kit.takeWide(k)),
        allpasses: ALLPASSES.map((k) => kit.takeWide(k)),
      };
      reverb(out, frames, room, lines);
      for (const line of [...lines.combs, ...lines.allpasses]) kit.giveWide(line);
    },
  };
};

const planLoop = (node: Loop, at: At): Planned => {
  const child = planNode(node.of, childOf(at, 0), at.render);
  const k = Math.min(framesAt(node.crossfade, at, 'crossfade'), Math.floor(child.frames / 2));
  const kit = at.render.kit;
  return {
    frames: child.frames - k,
    fill: (out) => {
      const from = kit.take(child.frames);
      child.fill(from);
      crossfade(from, child.frames, out, k);
      kit.give(from);
    },
  };
};

// Time.

const planLayer = (node: Layer, at: At): Planned =>
  mixOf(
    at.render.kit,
    node.of.map((layered, j) => {
      const slot = childOf(at, j);
      // Where a child sits and its gain are its own draws, so they follow it as it moves.
      const own = placed(layered.node, slot, at.render);
      return {
        at: framesAt(layered.at ?? 0, own, 'placed.at'),
        gain: dbToGain(drawValue(layered.db ?? 0, plain, own, 'placed.db')),
        child: planNode(layered.node, slot, at.render),
      };
    }),
    node.secs === undefined ? undefined : framesAt(node.secs, at, 'secs'),
  );

const planSequence = (node: Sequence, at: At): Planned => {
  const parts: Array<Part> = [];
  let onset = 0;
  node.of.forEach((child, j) => {
    const planned = planNode(child, childOf(at, j), at.render);
    parts.push({ at: onset, gain: 1, child: planned });
    onset += planned.frames + framesAt(node.gap ?? 0, at, `gap.${j}`);
  });
  return mixOf(at.render.kit, parts);
};

/** A Poisson process's onsets in frames: intervals drawn in order, until `secs` or its cap. */
const poissonOnsets = (rate: number, secs: number, seed: number): ReadonlyArray<number> => {
  const r = rng(seed);
  const end = framesOf(secs);
  const cap = poissonCap(rate, secs);
  const onsets: Array<number> = [];
  let t = 0;
  while (onsets.length < cap) {
    t += -log(1 - r()) / rate;
    const onset = framesOf(t);
    if (onset >= end) break;
    onsets.push(onset);
  }
  return onsets;
};

/** A repeat's onsets in frames, each rounded once from its own time. */
const onsetsOf = (timing: Repeat['timing'], at: Draws): ReadonlyArray<number> =>
  Match.valueTags(timing, {
    Count: (t) => {
      const every = drawValue(t.every, plain, at, 'timing.every');
      const count = drawInt(t.count, at, 'timing.count');
      return Array.from({ length: count }, (_, k) => framesOf(k * every));
    },
    During: (t) => {
      const every = drawValue(t.every, plain, at, 'timing.every');
      const end = framesAt(t.secs, at, 'timing.secs');
      const onsets: Array<number> = [];
      for (let k = 0; framesOf(k * every) < end; k++) onsets.push(framesOf(k * every));
      return onsets;
    },
    Poisson: (t) =>
      poissonOnsets(
        drawValue(t.rate, plain, at, 'timing.rate'),
        drawValue(t.secs, plain, at, 'timing.secs'),
        streamSeed(at.seed, 'timing.intervals'),
      ),
  });

const planRepeat = (node: Repeat, at: At): Planned =>
  mixOf(
    at.render.kit,
    onsetsOf(node.timing, at).map((onset, k) => ({
      at: onset,
      gain: 1,
      child: planNode(node.of, tickOf(at, k), at.render),
    })),
  );

/** `node` planned at `slot` of `render`. */
export const planNode = (node: Node, slot: Slot, render: Render): Planned => {
  const at = placed(node, slot, render);
  return Match.valueTags(node, {
    Osc: (n) => planOsc(n, at),
    Noise: (n) => planNoise(n, at),
    Partials: (n) => planPartials(n, at),
    Sample: (n) => planSample(n, at),
    Gain: (n) => planGain(n, at),
    Envelope: (n) => planEnvelope(n, at),
    Fade: (n) => planFade(n, at),
    Drive: (n) => planDrive(n, at),
    Crush: (n) => planCrush(n, at),
    Resample: (n) => planResample(n, at),
    Filter: (n) => planFilter(n, at),
    Delay: (n) => planDelay(n, at),
    Reverb: (n) => planReverb(n, at),
    Loop: (n) => planLoop(n, at),
    Layer: (n) => planLayer(n, at),
    Sequence: (n) => planSequence(n, at),
    Repeat: (n) => planRepeat(n, at),
  });
};
