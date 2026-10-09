// The lab's source splices, on scene text: a value is replaced where it is a
// literal, a missing timing field is added after the span's anchor, and
// anything the parser cannot prove is a literal is refused with the reason.

import { describe, expect, test as it } from 'bun:test';
import { Option, Result } from 'effect';
import type { CuePatch } from '../core/schema.ts';
import {
  drawingSites,
  editCue,
  editKnob,
  editable,
  parseModule,
  cueLanded,
  readKnob,
  readKnobs,
  readSpans,
  codeOf,
  sceneCode,
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
    expect(readSpans(FILE, next, 'hand')['topple']).toEqual({
      mark: 'earns',
      offset: 0.4,
      dur: 1.8,
    });
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
    expect(readSpans(FILE, timed, 'hand')['bare']).toEqual({ at: 'speech', offset: 0.25, dur: 1 });
  });

  it('lists the line that writes each cue and knob, so the inspector can cite it before the code is read', () => {
    const found = ok(editable(FILE, scene, 'hand'));
    expect(found.cues.map((c) => [c.name, c.line])).toEqual([
      ['topple', 10],
      ['shine', 11],
      ['late', 12],
      ['bare', 13],
    ]);
    expect(found.knobs.map((k) => [k.name, k.line])).toEqual([
      ['palm', 16],
      ['tilt', 17],
      ['half', 18],
    ]);
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
    expect(ok(editable(FILE, marked, 'hand')).cues[0]).toEqual({
      name: 'topple',
      line: 10,
      offset: 'literal',
      dur: 'absent',
      until: 'literal',
      untilOffset: 'absent',
      ease: 'absent',
      stagger: 'absent',
    });
    const off = ok(editCue(FILE, marked, 'hand', 'topple', { untilOffset: 0.2 }));
    expect(ok(editable(FILE, off, 'hand')).cues[0]?.untilOffset).toBe('literal');
    const coded = off.replace('untilOffset: 0.2', 'untilOffset: GAP');
    expect(ok(editable(FILE, coded, 'hand')).cues[0]?.untilOffset).toBe('computed');
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

  it('writes an until over a span that lands on its anchor without its ends, so it still decodes', () => {
    const landing = scene.replace(
      "shine: { mark: 'gift', offset: -0.5, dur: 0.3, ease: 'outBack' }",
      "shine: { mark: 'gift', dur: 0.3, ends: true, ease: 'outBack' }",
    );
    expect(readSpans(FILE, landing, 'hand')['shine']).toEqual({
      mark: 'gift',
      dur: 0.3,
      ends: true,
      ease: 'outBack',
    });
    const marked = ok(editCue(FILE, landing, 'hand', 'shine', { until: 'earns' }));
    expect(marked).toBe(landing.replace('dur: 0.3, ends: true', "until: 'earns'"));
    expect(readSpans(FILE, marked, 'hand')['shine']).toEqual({
      mark: 'gift',
      until: 'earns',
      ease: 'outBack',
    });
    // A dur keeps it landing.
    expect(ok(editCue(FILE, landing, 'hand', 'shine', { dur: 0.5 }))).toBe(
      landing.replace('dur: 0.3', 'dur: 0.5'),
    );
    // An ends its source computes is not the lab's to take away.
    const computed = landing.replace('ends: true', 'ends: LANDS');
    expect(
      Result.match(editCue(FILE, computed, 'hand', 'shine', { until: 'earns' }), {
        onFailure: (error) => error.message,
        onSuccess: () => 'written',
      }),
    ).toContain('cue shine ends: it is `LANDS`, not a literal, so the lab cannot take it away');
  });

  it('judges a cue write by the span its text holds, decoded, never by the patch alone', () => {
    const landing = scene.replace(
      "shine: { mark: 'gift', offset: -0.5, dur: 0.3, ease: 'outBack' }",
      "shine: { mark: 'gift', dur: 0.3, ends: true, ease: 'outBack' }",
    );
    const until = { until: 'earns' } as const;
    const landed = (before: string, after: string, cue: string, patch: CuePatch) =>
      ok(cueLanded(FILE, before, after, 'hand', cue, patch));
    // The until beside the ends it should have taken away: no span decodes there.
    const both = landing.replace('dur: 0.3, ends: true', "until: 'earns', ends: true");
    expect(landed(landing, both, 'shine', until)).toEqual(['cue shine is not a span as written']);
    expect(
      landed(landing, ok(editCue(FILE, landing, 'hand', 'shine', until)), 'shine', until),
    ).toEqual([]);
    // A value other than the patch's, or a field it never set, did not land.
    const moved = { offset: 0.4 } as const;
    const other = scene.replace('offset: 0.1, dur: 1.8 }', 'offset: 0.5, dur: 1.8 }');
    expect(landed(scene, other, 'topple', moved)).toHaveLength(1);
    const extra = scene.replace(
      'offset: 0.1, dur: 1.8 }',
      "offset: 0.4, dur: 1.8, ease: 'linear' }",
    );
    expect(landed(scene, extra, 'topple', moved)).toHaveLength(1);
    expect(
      landed(scene, ok(editCue(FILE, scene, 'hand', 'topple', moved)), 'topple', moved),
    ).toEqual([]);
    // A span its source computes in part is judged with its code as it stood.
    const sized = ok(editCue(FILE, scene, 'hand', 'late', { dur: 1 }));
    expect(sized).toContain("late: { after: 'topple', offset: GAP * 2, dur: 1 }");
    expect(landed(scene, sized, 'late', { dur: 1 })).toEqual([]);
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

  it("writes an until's offset after its until, keeps the until, and drops the key back on the point", () => {
    const marked = scene.replace(
      "bare: { at: 'speech' }",
      "bare: { at: 'speech', until: 'gift', ease: 'linear' }",
    );
    const off = ok(editCue(FILE, marked, 'hand', 'bare', { untilOffset: 0.1 }));
    expect(off).toBe(marked.replace("until: 'gift',", "until: 'gift', untilOffset: 0.1,"));
    expect(readSpans(FILE, off, 'hand')['bare']).toEqual({
      at: 'speech',
      until: 'gift',
      untilOffset: 0.1,
      ease: 'linear',
    });
    expect(ok(editCue(FILE, off, 'hand', 'bare', { untilOffset: -0.25 }))).toBe(
      marked.replace("until: 'gift',", "until: 'gift', untilOffset: -0.25,"),
    );
    // Back on the point: the key goes, and the span is the plain until it was.
    expect(ok(editCue(FILE, off, 'hand', 'bare', { untilOffset: 0 }))).toBe(marked);
    expect(ok(editCue(FILE, marked, 'hand', 'bare', { untilOffset: 0 }))).toBe(marked);
    // A dur, or another point, ends it another way: the offset goes with the until.
    expect(ok(editCue(FILE, off, 'hand', 'bare', { dur: 3 }))).toBe(
      marked.replace("until: 'gift'", 'dur: 3'),
    );
    expect(ok(editCue(FILE, off, 'hand', 'bare', { until: 'earns' }))).toBe(
      marked.replace("until: 'gift'", "until: 'earns'"),
    );
    // The last key of a span, and the first, go cleanly too.
    const last = scene.replace(
      "bare: { at: 'speech' }",
      "bare: { at: 'speech', until: 'gift', untilOffset: 0.1 }",
    );
    expect(ok(editCue(FILE, last, 'hand', 'bare', { untilOffset: 0 }))).toBe(
      scene.replace("bare: { at: 'speech' }", "bare: { at: 'speech', until: 'gift' }"),
    );
    const first = scene.replace(
      "bare: { at: 'speech' }",
      "bare: { untilOffset: 0.1, at: 'speech', until: 'gift' }",
    );
    expect(ok(editCue(FILE, first, 'hand', 'bare', { untilOffset: 0 }))).toBe(
      scene.replace("bare: { at: 'speech' }", "bare: { at: 'speech', until: 'gift' }"),
    );
  });

  it('takes an offset away with the comma that joins it, and keeps every comment around it', () => {
    // Each case: the span with the offset, and the span once it is taken away.
    const cases: ReadonlyArray<readonly [string, string]> = [
      // One line, a comment before the offset and after it, the offset last and not.
      [
        "{ at: 'speech', until: 'gift', /* why */ untilOffset: 0.1 }",
        "{ at: 'speech', until: 'gift' /* why */ }",
      ],
      [
        "{ at: 'speech', until: 'gift', untilOffset: 0.1 /* why */ }",
        "{ at: 'speech', until: 'gift' /* why */ }",
      ],
      [
        "{ at: 'speech', until: 'gift' /* why */, untilOffset: 0.1 }",
        "{ at: 'speech', until: 'gift' /* why */ }",
      ],
      [
        "{ at: 'speech', /* why */ untilOffset: 0.1, until: 'gift' }",
        "{ at: 'speech', /* why */ until: 'gift' }",
      ],
      [
        "{ at: 'speech', untilOffset: 0.1 /* why */, until: 'gift' }",
        "{ at: 'speech', /* why */ until: 'gift' }",
      ],
      // Several lines: the neighbour's comment after it, the offset's line goes whole.
      [
        "{\n      at: 'speech',\n      until: 'gift', // rationale\n      untilOffset: 0.1,\n      ease: 'linear',\n    }",
        "{\n      at: 'speech',\n      until: 'gift', // rationale\n      ease: 'linear',\n    }",
      ],
      [
        "{\n      at: 'speech',\n      until: 'gift', // rationale\n      untilOffset: 0.1\n    }",
        "{\n      at: 'speech',\n      until: 'gift' // rationale\n    }",
      ],
      // A comment on a line of its own before the offset, and one after it on its line.
      [
        "{\n      at: 'speech',\n      until: 'gift',\n      // nudged past the word\n      untilOffset: 0.1,\n      ease: 'linear',\n    }",
        "{\n      at: 'speech',\n      until: 'gift',\n      // nudged past the word\n      ease: 'linear',\n    }",
      ],
      [
        "{\n      at: 'speech',\n      until: 'gift',\n      untilOffset: 0.1, // nudged\n      ease: 'linear',\n    }",
        "{\n      at: 'speech',\n      until: 'gift',\n      // nudged\n      ease: 'linear',\n    }",
      ],
      [
        "{\n      at: 'speech',\n      until: 'gift',\n      /* nudged\n         past the word */ untilOffset: 0.1,\n      ease: 'linear',\n    }",
        "{\n      at: 'speech',\n      until: 'gift',\n      /* nudged\n         past the word */\n      ease: 'linear',\n    }",
      ],
    ];
    for (const [span, dropped] of cases) {
      const before = scene.replace("{ at: 'speech' }", span);
      expect(ok(editCue(FILE, before, 'hand', 'bare', { untilOffset: 0 }))).toBe(
        scene.replace("{ at: 'speech' }", dropped),
      );
    }
  });

  it('refuses an until offset on a span that ends by its dur, or over one in code', () => {
    const why = (source: string, patch: Parameters<typeof editCue>[4]) =>
      Result.match(editCue(FILE, source, 'hand', 'bare', patch), {
        onFailure: (error) => error.message,
        onSuccess: () => 'written',
      });
    const sized = scene.replace("bare: { at: 'speech' }", "bare: { at: 'speech', dur: 2 }");
    expect(why(sized, { untilOffset: 0.1 })).toContain('it runs no until');
    const computed = scene.replace(
      "bare: { at: 'speech' }",
      "bare: { at: 'speech', until: 'gift', untilOffset: GAP }",
    );
    expect(why(computed, { untilOffset: 0.1 })).toContain('not a literal');
    expect(why(computed, { untilOffset: 0 })).toContain('not a literal');
    expect(why(computed, { dur: 3 })).toContain('not a literal');
  });

  for (const untilOffset of ['GAP', '0.0004'])
    it(`keeps an until's offset \`${untilOffset}\` as written through an edit that leaves the end`, () => {
      const before = scene.replace(
        "bare: { at: 'speech' }",
        `bare: { at: 'speech', until: 'gift', untilOffset: ${untilOffset} }`,
      );
      expect(ok(editCue(FILE, before, 'hand', 'bare', { offset: 0.3 }))).toBe(
        before.replace("at: 'speech',", "at: 'speech', offset: 0.3,"),
      );
      expect(ok(editCue(FILE, before, 'hand', 'bare', { ease: 'linear' }))).toBe(
        before.replace(
          `untilOffset: ${untilOffset}`,
          `untilOffset: ${untilOffset}, ease: 'linear'`,
        ),
      );
      // A write that took it away has not landed as asked.
      const dropped = before.replace(`, untilOffset: ${untilOffset}`, ', offset: 0.3');
      expect(ok(cueLanded(FILE, before, dropped, 'hand', 'bare', { offset: 0.3 }))).toEqual([
        'cue bare untilOffset',
      ]);
    });

  it('names only the field that missed, never an object end that landed as it was', () => {
    const before = scene.replace(
      "bare: { at: 'speech' }",
      "bare: { at: 'speech', until: { cue: 'topple' } }",
    );
    // The offset landed as 0.5, not the 0.3 asked; the end is as it was.
    const after = before.replace("at: 'speech',", "at: 'speech', offset: 0.5,");
    expect(ok(cueLanded(FILE, before, after, 'hand', 'bare', { offset: 0.3 }))).toEqual([
      'cue bare offset',
    ]);
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
    expect(readSpans(FILE, spread, 'hand')['shine']).toEqual({
      mark: 'gift',
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
        line: 10,
        offset: 'literal',
        dur: 'literal',
        until: 'absent',
        untilOffset: 'absent',
        ease: 'absent',
        stagger: 'absent',
      },
      {
        name: 'shine',
        line: 11,
        offset: 'literal',
        dur: 'literal',
        until: 'absent',
        untilOffset: 'absent',
        ease: 'literal',
        stagger: 'absent',
      },
      {
        name: 'late',
        line: 12,
        offset: 'computed',
        dur: 'absent',
        until: 'absent',
        untilOffset: 'absent',
        ease: 'absent',
        stagger: 'absent',
      },
      {
        name: 'bare',
        line: 13,
        offset: 'absent',
        dur: 'absent',
        until: 'absent',
        untilOffset: 'absent',
        ease: 'absent',
        stagger: 'absent',
      },
    ]);
    expect(found.knobs).toEqual([
      { name: 'palm', state: 'literal', line: 16 },
      { name: 'tilt', state: 'literal', line: 17 },
      { name: 'half', state: 'computed', line: 18 },
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

describe('a scene’s code', () => {
  const reading = `import { drawing } from '@bible/film/canvas';

const timeline = {
  /** The robe lifts. */
  lift: { mark: 'take', offset: 0.33, dur: 1.5 },
  carry: { after: 'lift', dur: 2, ease: 'inQuad' },
  rest: { at: 'speechEnd' },
};

export const robe = drawing({
  timeline,
  knobs: { atLoom: [960, 800], woven: 0.5, spare },
  draw: (f) => {
    const lift = f.at('lift');
    const bob = f.cue('carry');
    if (f.mark('take') > 1) f.knob('woven');
    f.keys('lift', [[0, 1]]) + f.knob('woven') + f.staggerAt('carry', 0.5);
    f.at('ghost');
    f.knob('ghost');
    [1, 2].at(0);
    helper(f);
  },
});

const helper = (f: Frame) => f.stagger('carry', 1, 3) + f.mark('later');
`;

  const code = () => ok(sceneCode(FILE, reading, 'robe'));
  const texts = (ranges: ReadonlyArray<readonly [number, number]>) =>
    ranges.map(([s, e]) => reading.slice(s, e));

  it('locates each cue and knob where it is written, as the property of its literal', () => {
    const { cues, knobs } = code();
    expect(cues.map((c) => [c.name, reading.slice(...c.at)])).toEqual([
      ['lift', "lift: { mark: 'take', offset: 0.33, dur: 1.5 }"],
      ['carry', "carry: { after: 'lift', dur: 2, ease: 'inQuad' }"],
      ['rest', "rest: { at: 'speechEnd' }"],
    ]);
    expect(knobs.map((k) => [k.name, reading.slice(...k.at)])).toEqual([
      ['atLoom', 'atLoom: [960, 800]'],
      ['woven', 'woven: 0.5'],
      ['spare', 'spare'],
    ]);
  });

  it('lists every call that reads a cue or knob by name, in the file, a helper’s too', () => {
    const { cues, knobs } = code();
    const readsOf = (name: string) => texts(cues.find((c) => c.name === name)?.reads ?? []);
    expect(readsOf('lift')).toEqual(["f.at('lift')", "f.keys('lift', [[0, 1]])"]);
    expect(readsOf('carry')).toEqual([
      "f.cue('carry')",
      "f.staggerAt('carry', 0.5)",
      "f.stagger('carry', 1, 3)",
    ]);
    expect(readsOf('rest')).toEqual([]);
    expect(texts(knobs.find((k) => k.name === 'woven')?.reads ?? [])).toEqual([
      "f.knob('woven')",
      "f.knob('woven')",
    ]);
  });

  it('matches a name the scene declares: a read of one it does not, or of an array, lights nothing', () => {
    const { cues, knobs } = code();
    const all = [...cues, ...knobs].flatMap((s) => texts(s.reads));
    expect(all.some((t) => t.includes('ghost') || t.includes('.at(0)'))).toBe(false);
  });

  it('lists the marks the code reads or anchors a cue at', () => {
    expect(code().marks.map((m) => [m.name, texts(m.reads)])).toEqual([
      ['take', ["'take'", "f.mark('take')"]],
      ['later', ["f.mark('later')"]],
    ]);
  });

  it('says why a timeline that is not a literal has no cues, and still lists the knobs', () => {
    const computed = `import { drawing } from 'k';
export const robe = drawing({ timeline: make(), knobs: { size: 1 }, draw: (f) => f.at('lift') });
`;
    const found = ok(sceneCode(FILE, computed, 'robe'));
    expect(found.cues).toEqual([]);
    expect(found.refused).toEqual([
      { field: 'timeline', reason: 'it is `make()`, not an object literal' },
    ]);
    expect(found.knobs.map((k) => k.name)).toEqual(['size']);
  });

  it('lights no literal the writer would refuse: a spread, a computed key or a key twice', () => {
    const shadowed = (timeline: string) =>
      ok(
        sceneCode(
          FILE,
          `import { drawing } from 'k';
export const robe = drawing({ timeline: ${timeline}, knobs: { size: 1 }, draw: (f) => f.at('lift') });
`,
          'robe',
        ),
      );
    for (const [timeline, reason] of [
      [
        '{ lift: { dur: 1 }, ...overrides }',
        'its object has a spread, so the value in effect is not provable',
      ],
      [
        '{ lift: { dur: 1 }, [key]: { dur: 9 } }',
        'its object has a computed key, so the value is not provable',
      ],
      ['{ lift: { dur: 1 }, lift: { dur: 9 } }', '"lift" is declared 2 times'],
    ] as const) {
      const found = shadowed(timeline);
      expect(found.cues).toEqual([]);
      expect(found.refused).toEqual([{ field: 'timeline', reason }]);
      expect(found.knobs.map((k) => k.name)).toEqual(['size']);
    }
  });

  it('refuses a module with no such drawing, and one that does not parse', () => {
    expect(Result.isFailure(sceneCode(FILE, reading, 'nope'))).toBe(true);
    expect(Result.isFailure(sceneCode(FILE, 'export const = ;', 'robe'))).toBe(true);
  });

  it('keeps its ranges true after the file moves: the same text, read again, is the same ranges', () => {
    const moved = `// a line more\n${reading}`;
    const before = code();
    const after = ok(sceneCode(FILE, moved, 'robe'));
    expect(after.cues.map((c) => moved.slice(...c.at))).toEqual(
      before.cues.map((c) => reading.slice(...c.at)),
    );
  });
});
