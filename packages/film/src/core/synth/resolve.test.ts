import { describe, expect, test } from 'bun:test';
import { Result } from 'effect';
import { type Library, type LibraryEntry, defineLibrary } from '../sfx.ts';
import type { CodeSound, Node } from './graph/nodes.ts';
import { resolveCode } from './resolve.ts';

const code = (sound: CodeSound): LibraryEntry => ({
  kind: 'code',
  sound,
  variants: 3,
  use: 'one-shot',
});

const noise = (secs: number, stream?: string): Node =>
  stream === undefined
    ? { _tag: 'Noise', color: 'white', secs }
    : { _tag: 'Noise', color: 'white', secs, stream };

const sample = (sound: string): Node => ({ _tag: 'Sample', sound });

/** `library`'s code sounds resolved: its keys typed as names, as `defineLibrary` types them. */
const resolved = <const L extends Library>(library: L) => resolveCode(library);

/** The refusal's tag and fields, or the names resolved. */
const walked = <const L extends Library>(library: L) =>
  Result.match(resolveCode(library), {
    onSuccess: (sounds) => ({ resolved: [...sounds.keys()] }),
    onFailure: (error) => ({ ...error }),
  });

describe('the walk of the code sounds', () => {
  test('each sound resolves with what it samples in place, and its key or C major', () => {
    const library = defineLibrary({
      'tone.drop': code({ play: noise(0.1) }),
      'tone.rain': code({
        key: { tonic: 'D', scale: 'minor' },
        play: { _tag: 'Layer', of: [{ node: sample('tone.drop') }, { node: sample('tone.drop') }] },
      }),
      'amb.court': { kind: 'generated', prompt: 'a court', secs: 10, use: 'bed' },
    });
    const sounds = Result.getOrThrow(resolveCode(library));
    expect([...sounds.keys()]).toEqual(['tone.drop', 'tone.rain']);
    const rain = sounds.get('tone.rain')!;
    expect(rain.key).toEqual({ tonic: 'D', scale: 'minor' });
    expect(sounds.get('tone.drop')!.key).toEqual({ tonic: 'C', scale: 'major' });
    expect([...rain.samples.keys()]).toEqual(['tone.drop']);
    expect(rain.samples.get('tone.drop')).toBe(sounds.get('tone.drop')!);
  });

  test('the hash is the graph’s, written in any order, and moves with a sampled sound', () => {
    const a = Result.getOrThrow(
      resolved({ 'tone.a': code({ play: { _tag: 'Noise', color: 'pink', secs: 1 } }) }),
    );
    const b = Result.getOrThrow(
      resolved({ 'tone.a': code({ play: { secs: 1, color: 'pink', _tag: 'Noise' } }) }),
    );
    expect(a.get('tone.a')!.hash).toBe(b.get('tone.a')!.hash);
    const sampler = (secs: number) =>
      Result.getOrThrow(
        resolved({
          'tone.a': code({ play: noise(secs) }),
          'tone.b': code({ play: sample('tone.a') }),
        }),
      ).get('tone.b')!.hash;
    expect(sampler(0.1)).not.toBe(sampler(0.2));
    expect(sampler(0.1)).toMatch(/^[0-9a-f]{8}$/);
  });

  test('a sample the library lacks, or that is not code, is refused', () => {
    expect(walked({ 'tone.a': code({ play: sample('tone.none') }) })).toMatchObject({
      _tag: 'SampleUnknown',
      sound: 'tone.a',
      sample: 'tone.none',
    });
    // A name no record can hold reads nothing off the prototype.
    expect(walked({ 'tone.a': code({ play: sample('constructor') }) })).toMatchObject({
      _tag: 'SampleUnknown',
    });
    expect(
      walked({
        'amb.court': { kind: 'generated', prompt: 'a court', secs: 10, use: 'bed' },
        'tone.a': code({ play: sample('amb.court') }),
      }),
    ).toMatchObject({
      _tag: 'SampleNotCode',
      sound: 'tone.a',
      sample: 'amb.court',
      kind: 'generated',
    });
  });

  test('sounds that sample each other round a ring are refused, with the ring', () => {
    expect(
      walked({
        'tone.a': code({ play: sample('tone.b') }),
        'tone.b': code({ play: { _tag: 'Gain', db: -6, of: sample('tone.a') } }),
      }),
    ).toMatchObject({ _tag: 'SampleCycle', path: ['tone.a', 'tone.b', 'tone.a'] });
    expect(walked({ 'tone.a': code({ play: sample('tone.a') }) })).toMatchObject({
      _tag: 'SampleCycle',
      path: ['tone.a', 'tone.a'],
    });
  });

  test('two nodes on one stream are refused; a sampled sound’s streams are its own', () => {
    expect(
      walked({
        'tone.a': code({
          play: {
            _tag: 'Layer',
            of: [{ node: noise(0.1, 'grain') }, { node: noise(0.2, 'grain') }],
          },
        }),
      }),
    ).toMatchObject({ _tag: 'StreamDuplicate', sound: 'tone.a', stream: 'grain' });
    expect(
      walked({
        'tone.a': code({ play: noise(0.1, 'grain') }),
        'tone.b': code({
          play: { _tag: 'Layer', of: [{ node: noise(0.1, 'grain') }, { node: sample('tone.a') }] },
        }),
      }),
    ).toEqual({ resolved: ['tone.a', 'tone.b'] });
  });

  test('a degree with no key is refused', () => {
    const degree: Node = { _tag: 'Osc', wave: 'sine', pitch: { degree: 2, octave: 4 }, secs: 0.1 };
    expect(walked({ 'tone.a': code({ play: degree }) })).toMatchObject({
      _tag: 'DegreeWithoutKey',
      sound: 'tone.a',
    });
    const inFilter: Node = {
      _tag: 'Filter',
      type: 'lowpass',
      hz: { _tag: 'Ramp', from: 'C4', to: { degree: 4, octave: 5 }, curve: 'linear' },
      q: 1,
      of: noise(0.1),
    };
    expect(walked({ 'tone.a': code({ play: inFilter }) })).toMatchObject({
      _tag: 'DegreeWithoutKey',
    });
    expect(
      walked({ 'tone.a': code({ key: { tonic: 'G', scale: 'major' }, play: degree }) }),
    ).toEqual({ resolved: ['tone.a'] });
  });

  test('a sound that can run past 120 s, or write past an hour of frames, is refused', () => {
    const long: Node = {
      _tag: 'Sequence',
      of: [noise(100), { _tag: 'Noise', color: 'pink', secs: { _tag: 'Vary', min: 1, max: 30 } }],
    };
    expect(walked({ 'tone.a': code({ play: long }) })).toMatchObject({
      _tag: 'CodeTooLong',
      sound: 'tone.a',
      measure: 'length',
      secs: 130,
      limit: 120,
    });
    const busy: Node = {
      _tag: 'Repeat',
      timing: { _tag: 'Count', every: 0.01, count: 10_000 },
      of: noise(1),
    };
    expect(walked({ 'tone.a': code({ play: busy }) })).toMatchObject({
      _tag: 'CodeTooLong',
      measure: 'work',
      limit: 3600,
    });
    // A sampled sound's own length counts in the sound that samples it.
    expect(
      walked({
        'tone.a': code({ play: noise(70) }),
        'tone.b': code({ play: { _tag: 'Sequence', of: [sample('tone.a'), sample('tone.a')] } }),
      }),
    ).toMatchObject({ _tag: 'CodeTooLong', sound: 'tone.b', measure: 'length', secs: 140 });
  });
});
