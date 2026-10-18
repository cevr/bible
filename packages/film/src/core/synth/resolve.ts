// The library's walk of its code sounds, before anything renders: each graph
// checked, and each sound it samples resolved first and put in place. Pure:
// the library load lifts a refusal into its error channel.
//
// A sound is refused when it samples a name the library lacks, a sound that
// is not code, or itself through others; when it plays a degree with no key;
// when two of its nodes name one stream (they would draw the same numbers);
// and when, at the most its draws allow, it is longer or writes more than a
// render may. A sampled sound renders on its own seed, so its stream names
// are its own: they are checked with it, never with the sounds that sample it.
//
// Each entry's code trial (core/sfx.ts `codeTrialOf`: a generated sound's
// `code`, a recording's fit) is walked the same way, under its entry's name
// and "(trial)", and resolved beside the code sounds. It is no code sound
// itself, so nothing can sample it. A fit for a name the library does not
// declare as a recording, or as code kept from one (`keptFit`, its entry
// naming the recording's licence), is refused (`FitUnmatched`); a kept fit is
// that entry's code, so it is no trial.

import { Option, Predicate, Result, Schema } from 'effect';
import {
  type CodeError,
  CodeTooLong,
  DegreeWithoutKey,
  FitUnmatched,
  SampleCycle,
  SampleNotCode,
  SampleUnknown,
  StreamDuplicate,
} from '../errors.ts';
import { hashText } from '../narration.ts';
import { type CodeTrial, type Library, codeTrialOf, isKeptFit, soundEntry } from '../sfx.ts';
import { type Bound, boundOf } from './graph/bound.ts';
import {
  CodeSound,
  type Key,
  type Node,
  type Pitch,
  type Signal,
  type Value,
  drawable,
} from './graph/nodes.ts';
import { isDegree } from './graph/pitch.ts';
import type { ResolvedSound } from './graph/plan.ts';
import { MAX_CODE_SECS, MAX_CODE_WORK } from './graph/units.ts';

/** The key a sound with no degree names: C major stands in, never heard. */
const NO_KEY: Key = { tonic: 'C', scale: 'major' };

const CodeJson = Schema.fromJsonString(CodeSound);

/** A node's children, in order. */
const childrenOf = (node: Node): ReadonlyArray<Node> => {
  switch (node._tag) {
    case 'Osc':
    case 'Noise':
    case 'Partials':
    case 'Sample':
      return [];
    case 'Layer':
      return node.of.map((layered) => layered.node);
    case 'Sequence':
      return node.of;
    default:
      return [node.of];
  }
};

/** Every node of a graph, its root first, each before its children. */
const nodesOf = (root: Node): ReadonlyArray<Node> => [root, ...childrenOf(root).flatMap(nodesOf)];

/** The values a signal moves between: a value held, a ramp's ends, each point's, the centre of a wobble or an LFO. */
const signalValues = <U>(signal: Signal<U>): ReadonlyArray<Value<U>> => {
  if (Predicate.isTagged(signal, 'Ramp')) return [signal.from, signal.to];
  if (Predicate.isTagged(signal, 'Points')) return signal.points.map(([, value]) => value);
  if (Predicate.isTagged(signal, 'Wobble') || Predicate.isTagged(signal, 'Lfo'))
    return [signal.around];
  return [signal];
};

/** The pitches a node can play. */
const pitchesOf = (node: Node): ReadonlyArray<Pitch> => {
  switch (node._tag) {
    case 'Osc':
      return signalValues(node.pitch).flatMap(drawable);
    case 'Partials':
      return drawable(node.pitch);
    case 'Filter':
      return signalValues(node.hz).flatMap(drawable);
    default:
      return [];
  }
};

/** The first stream name two of `nodes` share. */
const sharedStream = (nodes: ReadonlyArray<Node>): Option.Option<string> => {
  const seen = new Set<string>();
  for (const node of nodes) {
    if (node.stream === undefined) continue;
    if (seen.has(node.stream)) return Option.some(node.stream);
    seen.add(node.stream);
  }
  return Option.none();
};

/** A sound resolved, and its most: what a sound that samples it adds. */
interface Walked {
  readonly sound: ResolvedSound;
  readonly bound: Bound;
}

/** One walk of a library: the sounds resolved so far, each once however often it is sampled. */
interface Walk {
  readonly library: Library;
  readonly done: Map<string, Result.Result<Walked, CodeError>>;
}

/** `name`, sampled by the last of `stack`: resolved once, refused when it is not a code sound or closes a ring. */
const sampled = (
  walk: Walk,
  stack: ReadonlyArray<string>,
  name: string,
): Result.Result<Walked, CodeError> => {
  const sampler = stack[stack.length - 1] ?? name;
  const ring = stack.indexOf(name);
  if (ring >= 0) return Result.fail(SampleCycle.make({ path: [...stack.slice(ring), name] }));
  const known = walk.done.get(name);
  if (known !== undefined) return known;
  const entry = soundEntry(walk.library, name);
  if (Option.isNone(entry))
    return Result.fail(SampleUnknown.make({ sound: sampler, sample: name }));
  if (entry.value.kind !== 'code')
    return Result.fail(
      SampleNotCode.make({ sound: sampler, sample: name, kind: entry.value.kind }),
    );
  const walked = walkSound(walk, stack, name, entry.value.sound);
  walk.done.set(name, walked);
  return walked;
};

/** `sound`, under `name`, checked and resolved: what it samples first. */
const walkSound = (
  walk: Walk,
  stack: ReadonlyArray<string>,
  name: string,
  sound: CodeSound,
): Result.Result<Walked, CodeError> => {
  const nodes = nodesOf(sound.play);
  const samples = new Map<string, Walked>();
  for (const node of nodes) {
    if (node._tag !== 'Sample' || samples.has(node.sound)) continue;
    const found = sampled(walk, [...stack, name], node.sound);
    if (Result.isFailure(found)) return Result.fail(found.failure);
    samples.set(node.sound, found.success);
  }
  const stream = sharedStream(nodes);
  if (Option.isSome(stream))
    return Result.fail(StreamDuplicate.make({ sound: name, stream: stream.value }));
  if (sound.key === undefined && nodes.some((node) => pitchesOf(node).some(isDegree)))
    return Result.fail(DegreeWithoutKey.make({ sound: name }));
  const bound = boundOf(sound.play, (sample) => samples.get(sample)?.bound ?? { secs: 0, work: 0 });
  if (bound.secs > MAX_CODE_SECS)
    return Result.fail(
      CodeTooLong.make({ sound: name, measure: 'length', secs: bound.secs, limit: MAX_CODE_SECS }),
    );
  if (bound.work > MAX_CODE_WORK)
    return Result.fail(
      CodeTooLong.make({ sound: name, measure: 'work', secs: bound.work, limit: MAX_CODE_WORK }),
    );
  // The hash is the graph's and every sampled sound's, so an edit to a sampled sound moves it too.
  const sampledHashes = [...samples]
    .map(([sample, walked]) => `${sample}=${walked.sound.hash}`)
    .toSorted();
  const hash = hashText([Schema.encodeSync(CodeJson)(sound), ...sampledHashes].join('\n'));
  return Result.succeed({
    sound: {
      name,
      sound,
      key: sound.key ?? NO_KEY,
      samples: new Map([...samples].map(([sample, walked]) => [sample, walked.sound])),
      hash,
    },
    bound,
  });
};

/** A code trial resolved: its graph ready to render, and how many seeds it plays. */
export interface ResolvedTrial {
  readonly sound: ResolvedSound;
  readonly variants: number;
}

/** A library's code resolved: its code sounds, and its entries' code trials, each by its entry's name. */
interface ResolvedCode {
  readonly code: ReadonlyMap<string, ResolvedSound>;
  readonly trials: ReadonlyMap<string, ResolvedTrial>;
}

/**
 * Every code sound and code trial of `library` resolved, its recordings'
 * trials from `fits` (by name), or the first refusal: a fit no recording
 * takes first, then in the library's order.
 */
export const resolveCode = (
  library: Library,
  fits: ReadonlyMap<string, CodeTrial> = new Map(),
): Result.Result<ResolvedCode, CodeError> => {
  for (const name of [...fits.keys()].toSorted()) {
    const entry = soundEntry(library, name);
    if (Option.isNone(entry))
      return Result.fail(FitUnmatched.make({ sound: name, kind: 'undeclared' }));
    // A fit is a recording's trial, or the code kept from one.
    const { kind } = entry.value;
    if (kind === 'recorded' || isKeptFit(entry.value)) continue;
    return Result.fail(FitUnmatched.make({ sound: name, kind }));
  }
  const walk: Walk = { library, done: new Map() };
  const code = new Map<string, ResolvedSound>();
  const trials = new Map<string, ResolvedTrial>();
  for (const name of Object.keys(library)) {
    const entry = soundEntry(library, name);
    if (Option.isNone(entry)) continue;
    if (entry.value.kind === 'code') {
      const walked = sampled(walk, [], name);
      if (Result.isFailure(walked)) return Result.fail(walked.failure);
      code.set(name, walked.success.sound);
    }
    const trial = codeTrialOf(entry.value, Option.fromUndefinedOr(fits.get(name)));
    if (Option.isNone(trial)) continue;
    const walked = walkSound(walk, [], `${name} (trial)`, trial.value.sound);
    if (Result.isFailure(walked)) return Result.fail(walked.failure);
    trials.set(name, { sound: walked.success.sound, variants: trial.value.variants });
  }
  return Result.succeed({ code, trials });
};
