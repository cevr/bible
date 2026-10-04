// The judge's words: the moments it shows (marks and cue middles, one per
// frame, spread evenly past the cap), the register a picture names, the rule
// sections it quotes, the ranking it reads from an answer, and the verdict it
// unblinds; the packet names no version.

import { describe, expect, test } from 'bun:test';
import { Option, Result } from 'effect';
import type { SceneTimes } from './easel.ts';
import {
  type JudgeKey,
  judgeMoments,
  packetOf,
  rankingLine,
  rankingOf,
  registersOf,
  rulesFor,
  sectionOf,
  verdictOf,
} from './judge.ts';

const scene = (marks: Record<string, number>, cues: SceneTimes['cues'] = {}): SceneTimes => ({
  id: 'roof',
  start: 10,
  dur: 8,
  marks,
  cues,
});

describe('the moments a judge shows', () => {
  test('each mark and each cue middle, in time order, one per frame', () => {
    const moments = judgeMoments(
      scene({ late: 6, early: 1, twin: 1.01 }, { slide: { start: 2, end: 4 } }),
    );
    expect(moments).toEqual([
      { at: 'mark:early', second: 1 },
      { at: 'cue:slide@0.5', second: 3 },
      { at: 'mark:late', second: 6 },
    ]);
  });

  test("one per frame as the look draws them: the film's frames, counted from its start", () => {
    // At 30 fps from 4.01 s, 1 s and 1.01 s in are frames 150 and 151: two stills.
    const off = (marks: Record<string, number>): SceneTimes => ({ ...scene(marks), start: 4.01 });
    expect(judgeMoments(off({ a: 1, b: 1.01 })).map((m) => m.at)).toEqual(['mark:a', 'mark:b']);
    // 1.01 s and 1.02 s in are both frame 151: one still.
    expect(judgeMoments(off({ a: 1.01, b: 1.02 })).map((m) => m.at)).toEqual(['mark:a']);
  });

  test('past the cap, spread from the first to the last', () => {
    const marks = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`m${i}`, i * 0.25]));
    const moments = judgeMoments(scene(marks), 4);
    expect(moments.map((m) => m.at)).toEqual(['mark:m0', 'mark:m10', 'mark:m19', 'mark:m29']);
  });

  test('a scene with no mark or cue shows its middle; a mark past its end is left out', () => {
    expect(judgeMoments(scene({ after: 9 }))).toEqual([{ at: '4.00', second: 4 }]);
  });
});

describe("a beat's register and its rules", () => {
  test('the registers its picture names at its head', () => {
    expect(registersOf('STORY: a garden of cardboard trees.')).toEqual(['STORY']);
    expect(registersOf('IDEA, then STORY. The scene opens on the icons.')).toEqual([
      'IDEA',
      'STORY',
    ]);
    expect(registersOf('Title over a teal sky: Righteousness by Faith.')).toEqual([]);
  });

  test('a rule for every beat, or for one of its registers', () => {
    const rules = [
      { file: 'c.md', heading: '## 12. The look', registers: [] },
      { file: 'c.md', heading: '## 5. Human scale', registers: ['STORY'] as const },
      { file: 'c.md', heading: '## 8. Repetition', registers: ['IDEA'] as const },
    ];
    expect(rulesFor(rules, ['IDEA']).map((r) => r.heading)).toEqual([
      '## 12. The look',
      '## 8. Repetition',
    ]);
    expect(rulesFor(rules, []).map((r) => r.heading)).toEqual(['## 12. The look']);
  });

  test('a section runs to the next heading as high, its subsections in it', () => {
    const text = '# Craft\n\n## 1. Words\n\nfirst\n\n### detail\n\nmore\n\n## 2. Next\n\nlast';
    expect(sectionOf(text, '## 1. Words')).toEqual(
      Option.some('## 1. Words\n\nfirst\n\n### detail\n\nmore'),
    );
    expect(sectionOf(text, '## 2. Next')).toEqual(Option.some('## 2. Next\n\nlast'));
    expect(sectionOf(text, '## 3. Gone')).toEqual(Option.none());
  });
});

describe('the ranking in an answer', () => {
  const labels = ['A', 'B', 'C'];

  test('labels best first, a tie sharing a tier, its last RANKING line read', () => {
    expect(rankingOf('RANKING: A > B > C\nthinking...\n**RANKING:** `B > A = C`', labels)).toEqual(
      Result.succeed({ _tag: 'Ranked', tiers: [['B'], ['A', 'C']] }),
    );
    expect(rankingOf('RANKING: no preference', labels)).toEqual(
      Result.succeed({ _tag: 'NoPreference' }),
    );
    expect(rankingOf('**RANKING:** No Preference', labels)).toEqual(
      Result.succeed({ _tag: 'NoPreference' }),
    );
  });

  test('only a whole ranking reads: an empty tier, an empty label or words after it do not', () => {
    for (const line of [
      'RANKING: > A > B = C',
      'RANKING: A > B = C >',
      'RANKING: A > B == C',
      'RANKING: A > B = C (B close)',
      'RANKING: A > B = C, then D',
      'RANKING: AB > C',
      'RANKING: no preference between A and B; C wins',
      'RANKING: no preference (all read alike)',
    ])
      expect([line, Result.isFailure(rankingOf(line, labels))]).toEqual([line, true]);
  });

  test('a ranking that leaves a label out, names another, or none, is unreadable', () => {
    expect(Result.isFailure(rankingOf('RANKING: A > B', labels))).toBe(true);
    expect(Result.isFailure(rankingOf('RANKING: A > B > D', labels))).toBe(true);
    expect(Result.isFailure(rankingOf('RANKING: A > A > B > C', labels))).toBe(true);
    expect(Result.isFailure(rankingOf('B is best', labels))).toBe(true);
  });
});

const key: JudgeKey = {
  film: 'f',
  scene: 'roof',
  point: 'look:ground',
  at: '2026-10-04T15:00:00.000Z',
  versions: [
    { label: 'A', version: 'light', picked: false, detail: 'look ground at light (0.5)' },
    { label: 'B', version: 'now', picked: true, detail: 'look ground at now (0)' },
  ],
};

describe('the verdict', () => {
  test('the ranking in real names, beside the pick, the reasons with each label named', () => {
    const answer = '```\nRANKING: A > B\n\n### A\n- Decided by: A-01.jpg\n\n### B\n- murky\n```';
    const ranking = Result.getOrThrow(rankingOf(answer, ['A', 'B']));
    expect(rankingLine(key, ranking)).toBe('light > now');
    const verdict = verdictOf({ key, ranking, answer, counsel: '/c/codex.md', packet: '/p.md' });
    expect(verdict).toContain('**Ranking:** light > now');
    expect(verdict).toContain("The owner's pick is now; the judge ranks light above it.");
    expect(verdict).toContain('### light (A)\n- Decided by: A-01.jpg');
    expect(verdict).toContain('### now (B)');
    expect(verdict).toContain('RANKING: light > now');
    expect(verdict).toContain("The counsel's answer: /c/codex.md");
  });

  test('no preference, and a pick ranked first', () => {
    const none = verdictOf({
      key,
      ranking: { _tag: 'NoPreference' },
      answer: 'RANKING: no preference',
      counsel: '/c',
      packet: '/p',
    });
    expect(none).toContain('**Ranking:** no preference');
    const first = verdictOf({
      key,
      ranking: { _tag: 'Ranked', tiers: [['B'], ['A']] },
      answer: '',
      counsel: '/c',
      packet: '/p',
    });
    expect(first).toContain('the judge ranks it first too');
  });
});

describe('the packet', () => {
  test('the beat, the rules by path, every still by label; no version, pick or author', () => {
    const packet = packetOf({
      choice: 'look `ground` (its level)',
      scene: 'roof',
      say: 'They {roof}lowered him through the roof.',
      picture: 'STORY: four friends on a roof.',
      registers: ['STORY'],
      act: Option.some('valley'),
      rules: [{ file: '/r/CRAFT.md', heading: '## 12. The look', text: '## 12. The look\n\nwarm' }],
      moments: [
        { at: 'mark:roof', second: 1 },
        { at: 'cue:slide@0.5', second: 3 },
      ],
      stills: [
        { label: 'A', files: ['/j/stills/A-01.jpg', '/j/stills/A-02.jpg'] },
        { label: 'B', files: ['/j/stills/B-01.jpg', '/j/stills/B-02.jpg'] },
      ],
    });
    expect(packet).toContain('They lowered him through the roof.');
    expect(packet).toContain('STORY: four friends on a roof.');
    expect(packet).toContain('**Register:** STORY');
    expect(packet).toContain('**Act:** valley');
    expect(packet).toContain('From `/r/CRAFT.md`:\n\n## 12. The look\n\nwarm');
    expect(packet).toContain(
      '| 02 | `cue:slide@0.5` | 3.00 | /j/stills/A-02.jpg | /j/stills/B-02.jpg |',
    );
    expect(packet).toContain('no preference');
    for (const word of ['light', 'now', 'picked', 'approved', 'newer than', 'key.json'])
      expect(packet).not.toContain(word);
  });
});
