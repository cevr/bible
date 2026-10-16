// A code sound in one line: each node by its kind and the fields that say
// what it is, its child in brackets, its children in square ones
// (`Envelope(Filter bandpass 400 Hz→2200 Hz(Noise pink 0.8–1 s))`). For a
// list and a review's line; the graph itself stays in the source.

import { Match, Predicate } from 'effect';
import {
  type Node,
  type Pitch,
  type Repeat,
  type Signal,
  type Value,
  isPick,
  isVary,
} from './nodes.ts';

/** A number in at most three significant figures. */
const figure = (x: number): string => String(Number(x.toPrecision(3)));

const pitchText = (pitch: Pitch): string => {
  if (Predicate.isNumber(pitch)) return `${figure(pitch)} Hz`;
  if (Predicate.isString(pitch)) return pitch;
  return `degree ${pitch.degree}/${pitch.octave}`;
};

const valueText = <U>(value: Value<U>, text: (u: U) => string): string => {
  if (isPick(value)) return `{${value.of.map(text).join('|')}}`;
  if (isVary(value)) return `${text(value.min)}–${text(value.max)}`;
  return text(value);
};

const signalText = <U>(signal: Signal<U>, text: (u: U) => string): string => {
  if (Predicate.isTagged(signal, 'Ramp'))
    return `${valueText(signal.from, text)}→${valueText(signal.to, text)}`;
  if (Predicate.isTagged(signal, 'Points'))
    return signal.points.map(([, v]) => valueText(v, text)).join('→');
  if (Predicate.isTagged(signal, 'Wobble') || Predicate.isTagged(signal, 'Lfo'))
    return `${valueText(signal.around, text)}±${valueText(signal.depth, figure)}`;
  return valueText(signal, text);
};

const secsText = (secs: Value<number>): string => `${valueText(secs, figure)} s`;

const timingText = (timing: Repeat['timing']): string =>
  Match.valueTags(timing, {
    Count: (t) => `×${valueText(t.count, figure)} every ${secsText(t.every)}`,
    During: (t) => `every ${secsText(t.every)} for ${secsText(t.secs)}`,
    Poisson: (t) => `${valueText(t.rate, figure)}/s for ${secsText(t.secs)}`,
  });

/** What one node is, before its child. */
const headOf = (node: Node): string => {
  switch (node._tag) {
    case 'Osc':
      return `Osc ${node.wave} ${signalText(node.pitch, pitchText)} ${secsText(node.secs)}`;
    case 'Noise':
      return `Noise ${node.color} ${secsText(node.secs)}`;
    case 'Partials':
      return `Partials ${Predicate.isString(node.set) ? node.set : `${node.set.length} modes`} ${valueText(node.pitch, pitchText)} ${secsText(node.secs)}`;
    case 'Sample':
      return `Sample ${node.sound}${node.seed === undefined ? '' : ` #${node.seed}`}`;
    case 'Gain':
      return `Gain ${signalText(node.db, figure)} dB`;
    case 'Drive':
      return `Drive ${node.transfer} ${signalText(node.db, figure)} dB`;
    case 'Crush':
      return node.bits === undefined ? 'Crush' : `Crush ${valueText(node.bits, figure)} bits`;
    case 'Resample':
      return `Resample ${valueText(node.semitones, figure)} st`;
    case 'Filter':
      return `Filter ${node.type} ${signalText(node.hz, pitchText)}`;
    case 'Delay':
      return `Delay ${signalText(node.secs, figure)} s`;
    case 'Repeat':
      return `Repeat ${timingText(node.timing)}`;
    case 'Envelope':
    case 'Fade':
    case 'Reverb':
    case 'Loop':
    case 'Layer':
    case 'Sequence':
      return node._tag;
  }
};

/** A code sound's graph in one line. */
export const describeGraph = (node: Node): string => {
  switch (node._tag) {
    case 'Osc':
    case 'Noise':
    case 'Partials':
    case 'Sample':
      return headOf(node);
    case 'Layer': {
      const length = node.secs === undefined ? '' : ` ${secsText(node.secs)}`;
      return `Layer${length}[${node.of.map((layered) => describeGraph(layered.node)).join(', ')}]`;
    }
    case 'Sequence':
      return `Sequence[${node.of.map(describeGraph).join(', ')}]`;
    default:
      return `${headOf(node)}(${describeGraph(node.of)})`;
  }
};
