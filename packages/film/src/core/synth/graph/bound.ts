// The most a code sound can be, at the most its draws allow: its length in
// seconds and its work (the seconds of frames its nodes write, repetitions
// counted). The library load refuses a sound past `MAX_CODE_SECS` or
// `MAX_CODE_WORK` before anything renders, so a typo cannot render hours.

import { Match, Predicate } from 'effect';
import { MODES } from './kernels.ts';
import { exp2 } from './math.ts';
import {
  type Layer,
  type Node,
  type Partials,
  type Repeat,
  type Sequence,
  type Value,
  isPick,
  isVary,
} from './nodes.ts';
import { poissonCap } from './units.ts';

/** A sound's or a node's most: its length and its work, in seconds. */
export interface Bound {
  readonly secs: number;
  readonly work: number;
}

/** The largest a value can draw. */
const most = (value: Value<number>): number => {
  if (isPick(value)) return Math.max(...value.of);
  if (isVary(value)) return Math.max(value.min, value.max);
  return value;
};

/** The smallest a value can draw. */
const least = (value: Value<number>): number => {
  if (isPick(value)) return Math.min(...value.of);
  if (isVary(value)) return Math.min(value.min, value.max);
  return value;
};

/** How many modes a strike sums: each is a pass over its frames. */
const modesOf = (node: Partials): number =>
  Predicate.isString(node.set) ? MODES[node.set].length : node.set.length;

/** A repeat at its most: how many onsets, and the latest, in seconds. */
interface Repeats {
  readonly ticks: number;
  readonly last: number;
}

const repeats = (timing: Repeat['timing']): Repeats =>
  Match.valueTags(timing, {
    Count: (t) => ({ ticks: most(t.count), last: (most(t.count) - 1) * most(t.every) }),
    During: (t) => ({
      ticks: Math.floor(most(t.secs) / least(t.every)) + 1,
      last: most(t.secs),
    }),
    Poisson: (t) => ({ ticks: poissonCap(most(t.rate), most(t.secs)), last: most(t.secs) }),
  });

/** A node that changes its one child: as long as it (plus `more`), its child's work and its own. */
const over = (child: Bound, more = 0): Bound => ({
  secs: child.secs + more,
  work: child.work + child.secs + more,
});

type Of = (node: Node) => Bound;

/** A layer's most: its own length when it names one (its children are made whole, then cut), else its latest child's end. */
const layerBound = (node: Layer, of: Of): Bound => {
  const mixed = node.of.reduce<Bound>(
    (sum, layered) => {
      const child = of(layered.node);
      const at = layered.at === undefined ? 0 : most(layered.at);
      return {
        secs: Math.max(sum.secs, at + child.secs),
        work: sum.work + child.work + child.secs,
      };
    },
    { secs: 0, work: 0 },
  );
  if (node.secs === undefined) return mixed;
  return { secs: most(node.secs), work: mixed.work };
};

const sequenceBound = (node: Sequence, of: Of): Bound =>
  node.of.reduce<Bound>(
    (sum, child) => {
      const b = of(child);
      return { secs: sum.secs + b.secs, work: sum.work + b.work + b.secs };
    },
    { secs: (node.of.length - 1) * (node.gap === undefined ? 0 : most(node.gap)), work: 0 },
  );

const repeatBound = (node: Repeat, of: Of): Bound => {
  const child = of(node.of);
  const { ticks, last } = repeats(node.timing);
  return { secs: last + child.secs, work: ticks * (child.work + child.secs) };
};

/** `node`'s most, a sampled sound's taken from `sampled`. */
export const boundOf = (node: Node, sampled: (name: string) => Bound): Bound => {
  const of: Of = (child) => boundOf(child, sampled);
  switch (node._tag) {
    case 'Osc':
    case 'Noise':
      return { secs: most(node.secs), work: most(node.secs) };
    case 'Partials':
      return { secs: most(node.secs), work: most(node.secs) * modesOf(node) };
    case 'Sample':
      return over(sampled(node.sound));
    case 'Gain':
    case 'Envelope':
    case 'Fade':
    case 'Drive':
    case 'Crush':
    case 'Filter':
    case 'Loop':
      return over(of(node.of));
    case 'Resample': {
      // Slowest at its lowest semitones: its length scales by 2^(−semitones/12).
      const child = of(node.of);
      return over(child, child.secs * (exp2(-least(node.semitones) / 12) - 1));
    }
    case 'Delay':
    case 'Reverb':
      return over(of(node.of), most(node.tail));
    case 'Layer':
      return layerBound(node, of);
    case 'Sequence':
      return sequenceBound(node, of);
    case 'Repeat':
      return repeatBound(node, of);
  }
};
