// The lab's source splices, on scene text: a value is replaced where it is a
// literal, a missing timing field is added after the span's anchor, and
// anything the parser cannot prove is a literal is refused with the reason.

import { describe, expect, test as it } from 'bun:test';
import { Option, Result } from 'effect';
import {
  drawingSites,
  editCue,
  editKnob,
  editable,
  parseModule,
  readCue,
  readKnob,
  readKnobs,
  readSpans,
  codeOf,
  unlocatable,
} from './scene-source.ts';

const FILE = 'scenes/hand.ts';

const scene = `import { drawing as draw } from '@bible/film/canvas';

const GAP = 0.2;

/** Faith is the hand. */
export const hand_ = draw({
  enter: { kind: 'pan', dur: 0.8, dir: -1 },
  timeline: {
    /** The tower tips. */
    topple: { mark: 'earns', offset: 0.1, dur: 1.8 },
    shine: { mark: 'gift', offset: -0.5, dur: 0.3, ease: 'outBack' },
    late: { after: 'topple', offset: GAP * 2 },
    bare: { at: 'speech' },
  },
  knobs: {
    palm: [960, 800],
    tilt: 0.12,
    half: [960 / 2, 800],
  },
  draw: (f) => {
    f.at('topple');
  },
});

const hidden = draw({ timeline: {}, draw: () => {} });

export { hand_ as hand };
`;

const ok = <A, E>(r: Result.Result<A, E>): A => Result.getOrThrow(r);

/** The source outside `[from, to)` of `before` must be the same bytes in `after`. */
const untouchedOutside = (before: string, after: string, changed: string) => {
  const at = before.indexOf(changed);
  expect(at).toBeGreaterThan(-1);
  const tail = before.length - (at + changed.length);
  expect(after.slice(0, at)).toBe(before.slice(0, at));
  expect(after.slice(after.length - tail)).toBe(before.slice(before.length - tail));
};

describe('scene source', () => {
  it('finds each exported drawing call, under every name it is exported as', () => {
    const program = ok(parseModule(FILE, scene));
    const sites = drawingSites(scene, program);
    expect(sites.map((s) => s.exports)).toEqual([['hand_', 'hand']]);
    expect(sites.map((s) => [s.timeline._tag, s.knobs._tag])).toEqual([['Literal', 'Literal']]);
  });

  it('changes an offset in place, and nothing else', () => {
    const next = ok(editCue(FILE, scene, 'hand', 'topple', { offset: 0.4 }));
    expect(next).toBe(scene.replace('offset: 0.1, dur: 1.8 }', 'offset: 0.4, dur: 1.8 }'));
    untouchedOutside(scene, next, '0.1');
    expect(ok(readCue(FILE, next, 'hand', 'topple'))).toEqual({ offset: 0.4, dur: 1.8 });
  });

  it('writes to the millisecond, negative values included', () => {
    const next = ok(editCue(FILE, scene, 'hand_', 'shine', { offset: -0.2 + 1e-9 - 0.10000001 }));
    expect(next).toContain("shine: { mark: 'gift', offset: -0.3, dur: 0.3, ease: 'outBack' }");
  });

  it('adds a missing ease after dur, and offset and dur after the anchor', () => {
    const eased = ok(editCue(FILE, scene, 'hand', 'topple', { ease: 'inQuad' }));
    expect(eased).toContain("topple: { mark: 'earns', offset: 0.1, dur: 1.8, ease: 'inQuad' }");
    const timed = ok(editCue(FILE, scene, 'hand', 'bare', { dur: 1, offset: 0.25 }));
    expect(timed).toContain("bare: { at: 'speech', offset: 0.25, dur: 1 }");
    expect(ok(readCue(FILE, timed, 'hand', 'bare'))).toEqual({ offset: 0.25, dur: 1 });
  });

  it('adds an offset to a word pin after its word, which it keeps', () => {
    const pinned = scene.replace(
      "bare: { at: 'speech' },",
      "bare: { at: 'speech' },\n    lit: { mark: 'gift', word: 'faith', dur: 0.6 },",
    );
    const next = ok(editCue(FILE, pinned, 'hand', 'lit', { offset: -0.3 }));
    expect(next).toContain("lit: { mark: 'gift', word: 'faith', offset: -0.3, dur: 0.6 }");
  });

  it('writes an until in place of a dur, and a dur in place of an until', () => {
    const marked = ok(editCue(FILE, scene, 'hand', 'topple', { until: 'gift' }));
    expect(marked).toBe(scene.replace('offset: 0.1, dur: 1.8 }', "offset: 0.1, until: 'gift' }"));
    expect(ok(readCue(FILE, marked, 'hand', 'topple'))).toEqual({ offset: 0.1, until: 'gift' });
    expect(ok(editable(FILE, marked, 'hand')).cues[0]).toEqual({
      name: 'topple',
      offset: 'literal',
      dur: 'absent',
      until: 'literal',
      ease: 'absent',
      stagger: 'absent',
    });
    const sized = ok(editCue(FILE, marked, 'hand', 'topple', { dur: 1.2 }));
    expect(sized).toBe(scene.replace('dur: 1.8', 'dur: 1.2'));
    const bare = ok(editCue(FILE, scene, 'hand', 'bare', { until: 'gift', ease: 'linear' }));
    expect(bare).toContain("bare: { at: 'speech', until: 'gift', ease: 'linear' }");
    expect(readSpans(FILE, marked, 'hand')['topple']).toEqual({
      mark: 'earns',
      offset: 0.1,
      until: 'gift',
    });
  });

  it('replaces a literal cue or landmark end with dur, without changing the rest of the scene', () => {
    for (const until of [
      "{ cue: 'topple' }",
      "{ cue: 'topple', edge: 'start' }",
      "{ at: 'speechEnd' }",
    ]) {
      const before = scene.replace(
        "bare: { at: 'speech' }",
        `bare: { at: 'speech', until: ${until} }`,
      );
      expect(
        ok(editable(FILE, before, 'hand')).cues.find((cue) => cue.name === 'bare')?.until,
      ).toBe('literal');
      const next = ok(editCue(FILE, before, 'hand', 'bare', { dur: 3 }));
      expect(next).toBe(before.replace(`until: ${until}`, 'dur: 3'));
      expect(readSpans(FILE, next, 'hand')['bare']).toEqual({ at: 'speech', dur: 3 });
    }
  });

  it('preserves a computed or ambiguous object end when asked to replace it with dur', () => {
    for (const until of [
      '{ cue: PARENT }',
      "{ ...end, cue: 'topple' }",
      "{ cue: 'topple', cue: 'shine' }",
      "{ cue: 'topple', edge: EDGE }",
      "{ cue: 'topple', at: 'speechEnd' }",
    ]) {
      const before = scene.replace(
        "bare: { at: 'speech' }",
        `bare: { at: 'speech', until: ${until} }`,
      );
      const result = editCue(FILE, before, 'hand', 'bare', { dur: 3 });
      expect(Result.isFailure(result)).toBe(true);
      expect(
        Result.match(result, { onFailure: (error) => error.message, onSuccess: () => 'written' }),
      ).toContain('so dur cannot replace it');
    }
  });

  it('writes a stagger after the ease, and reads it back', () => {
    const spread = ok(editCue(FILE, scene, 'hand', 'shine', { stagger: 0.857 }));
    expect(spread).toContain(
      "shine: { mark: 'gift', offset: -0.5, dur: 0.3, ease: 'outBack', stagger: 0.857 }",
    );
    expect(ok(readCue(FILE, spread, 'hand', 'shine'))).toEqual({
      offset: -0.5,
      dur: 0.3,
      ease: 'outBack',
      stagger: 0.857,
    });
    expect(ok(editable(FILE, spread, 'hand')).cues[1]?.stagger).toBe('literal');
    expect(ok(editCue(FILE, spread, 'hand', 'shine', { stagger: 0.5 }))).toBe(
      spread.replace('stagger: 0.857', 'stagger: 0.5'),
    );
  });

  it('sets a point knob coordinate by coordinate, and a number knob', () => {
    const moved = ok(editKnob(FILE, scene, 'hand', 'palm', [1010.4, 760]));
    expect(moved).toBe(scene.replace('palm: [960, 800]', 'palm: [1010.4, 760]'));
    expect(ok(readKnob(FILE, moved, 'hand', 'palm'))).toEqual(Option.some([1010.4, 760]));
    const tilted = ok(editKnob(FILE, scene, 'hand', 'tilt', 0.2));
    expect(tilted).toBe(scene.replace('tilt: 0.12', 'tilt: 0.2'));
  });

  it('refuses what it cannot prove is a literal, and names it', () => {
    const refused = (r: Result.Result<string, { readonly message: string }>) =>
      Result.match(r, { onFailure: (e) => e.message, onSuccess: () => 'written' });
    expect(refused(editCue(FILE, scene, 'hand', 'late', { offset: 1 }))).toBe(
      'scenes/hand.ts: will not edit cue late offset: it is `GAP * 2`, not a literal',
    );
    expect(refused(editKnob(FILE, scene, 'hand', 'half', [1, 2]))).toBe(
      'scenes/hand.ts: will not edit knob half: it is `[960 / 2, 800]`, not a literal [x, y]',
    );
    expect(refused(editKnob(FILE, scene, 'hand', 'palm', 3))).toContain('not a literal number');
    expect(refused(editCue(FILE, scene, 'hand', 'nope', { dur: 1 }))).toContain('no such cue');
    expect(refused(editCue(FILE, scene, 'hidden', 'x', { dur: 1 }))).toContain(
      'exports no drawing({...}) named hidden',
    );
    const spread = scene.replace("bare: { at: 'speech' }", "bare: { ...base, at: 'speech' }");
    expect(refused(editCue(FILE, spread, 'hand', 'bare', { dur: 1 }))).toContain('spread');
    const shared = scene.replace(/timeline: \{[\s\S]*?\n {2}\},\n {2}knobs/, 'timeline,\n  knobs');
    expect(refused(editCue(FILE, shared, 'hand', 'topple', { dur: 1 }))).toContain(
      'it is `timeline`, not an object literal',
    );
    const computedKey = scene.replace('late: {', '[LATE]: {');
    expect(refused(editCue(FILE, computedKey, 'hand', 'topple', { dur: 1 }))).toContain(
      'its object has a computed key, so the value is not provable',
    );
    const twice = scene.replace("bare: { at: 'speech' }", "topple: { at: 'speech' }");
    expect(refused(editCue(FILE, twice, 'hand', 'topple', { dur: 1 }))).toContain(
      '"topple" is declared 2 times',
    );
    const broken = `${scene}\nexport const = ;`;
    expect(refused(editCue(FILE, broken, 'hand', 'topple', { dur: 1 }))).toContain(
      'the module: it does not parse',
    );
    const unanchored = scene.replace("bare: { at: 'speech' }", 'bare: { dur: 1 }');
    expect(refused(editCue(FILE, unanchored, 'hand', 'bare', { offset: 1 }))).toContain(
      'the span has no anchor (mark, after, with or at)',
    );
    expect(refused(editKnob(FILE, scene, 'hand', 'nope', 1))).toBe(
      'scenes/hand.ts: will not edit knob nope: the drawing declares no such knob',
    );
  });

  it('follows a timeline or knobs name to its module-level const literal', () => {
    const lifted = `import { drawing } from '@bible/film/canvas';

const timeline = {
  topple: { mark: 'earns', offset: 0.1, dur: 1.8 },
} as const;

const knobs = { tilt: 0.12 } satisfies Record<string, number>;

export const hand = drawing({
  timeline,
  knobs: knobs,
  draw: () => {},
});
`;
    expect(ok(editCue(FILE, lifted, 'hand', 'topple', { dur: 2 }))).toBe(
      lifted.replace('dur: 1.8', 'dur: 2'),
    );
    expect(ok(editKnob(FILE, lifted, 'hand', 'tilt', 0.3))).toBe(
      lifted.replace('tilt: 0.12', 'tilt: 0.3'),
    );
    const mutable = lifted.replace('const timeline', 'let timeline');
    expect(Result.isFailure(editCue(FILE, mutable, 'hand', 'topple', { dur: 2 }))).toBe(true);
  });

  it('says which fields are literals, missing or computed', () => {
    const found = ok(editable(FILE, scene, 'hand'));
    expect(found.cues).toEqual([
      {
        name: 'topple',
        offset: 'literal',
        dur: 'literal',
        until: 'absent',
        ease: 'absent',
        stagger: 'absent',
      },
      {
        name: 'shine',
        offset: 'literal',
        dur: 'literal',
        until: 'absent',
        ease: 'literal',
        stagger: 'absent',
      },
      {
        name: 'late',
        offset: 'computed',
        dur: 'absent',
        until: 'absent',
        ease: 'absent',
        stagger: 'absent',
      },
      {
        name: 'bare',
        offset: 'absent',
        dur: 'absent',
        until: 'absent',
        ease: 'absent',
        stagger: 'absent',
      },
    ]);
    expect(found.knobs).toEqual([
      { name: 'palm', state: 'literal' },
      { name: 'tilt', state: 'literal' },
      { name: 'half', state: 'computed' },
    ]);
  });

  it('reads every span that is literal through and through, and leaves out the rest', () => {
    expect(readSpans(FILE, scene, 'hand')).toEqual({
      topple: { mark: 'earns', offset: 0.1, dur: 1.8 },
      shine: { mark: 'gift', offset: -0.5, dur: 0.3, ease: 'outBack' },
      bare: { at: 'speech' },
    });
  });

  it('reads every literal knob, and leaves out a computed one', () => {
    expect(readKnobs(FILE, scene, 'hand')).toEqual({ palm: [960, 800], tilt: 0.12 });
  });

  it('sees code apart from the timeline and knobs literals', () => {
    const data = ok(
      editKnob(
        FILE,
        ok(editCue(FILE, scene, 'hand', 'topple', { offset: 0.5 })),
        'hand',
        'palm',
        [1, 2],
      ),
    );
    expect(ok(codeOf(FILE, data, 'hand'))).toBe(ok(codeOf(FILE, scene, 'hand')));
    const code = scene.replace("f.at('topple');", "f.at('shine');");
    expect(ok(codeOf(FILE, code, 'hand'))).not.toBe(ok(codeOf(FILE, scene, 'hand')));
  });
});

/** What `unlocatable` reports on `source`: the text of each range. */
const unlocated = (source: string) =>
  unlocatable(source, ok(parseModule(FILE, source))).map((u) => source.slice(u.start, u.end));

describe('what the lab cannot locate', () => {
  it('is only the drawing no export names, in a scene the lab edits', () => {
    expect(unlocated(scene)).toEqual(['draw({ timeline: {}, draw: () => {} })']);
  });

  it('follows an aliased import to a computed timeline', () => {
    const source = `import { drawing as d } from 'k';
declare const make: () => object;
export const a = d({ timeline: make(), draw: () => {} });
`;
    expect(unlocated(source)).toEqual(['timeline: make()']);
  });

  it('refuses a drawing built inside a function, whatever its slots name', () => {
    const source = `import { drawing } from 'k';
declare const make: () => object;
const lifted = { go: { mark: 'go' } };
export const factory = () => {
  const lifted = make();
  return drawing({ timeline: lifted, draw: () => {} });
};
`;
    expect(unlocated(source)).toEqual(['drawing({ timeline: lifted, draw: () => {} })']);
  });

  it('refuses a slot declared twice, drawing off a namespace, and a scene outside drawing()', () => {
    const source = `import * as K from 'k';
import { drawing } from 'k';
const a = { go: { mark: 'go' } };
export const twice = drawing({ timeline: a, timeline: a, draw: () => {} });
export const ns = K.drawing({ timeline: a, draw: () => {} });
export const bare = { timeline: a, draw: () => {} };
`;
    expect(unlocated(source)).toEqual([
      'timeline: a',
      'K.drawing({ timeline: a, draw: () => {} })',
      '{ timeline: a, draw: () => {} }',
    ]);
  });
});
