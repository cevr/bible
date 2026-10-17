// What the lab's change feed says of two reads of a file: a board's tries
// added and kept, a beat approved and withdrawn; a catalogue's comment,
// approval and render; a set published, then written again; an ask's steps
// answered, its end reached, and its close; a note's own changes. Each with
// the film, panel, render, note or ask it is about and the lab path it opens on.

import { describe, expect, it } from 'bun:test';
import { Option, Schema } from 'effect';
import { AskName, AskRecord, AskState } from './ask.ts';
import { type BoardFile, BoardName } from './board.ts';
import { Catalogue, emptyCatalogue } from './catalogue.ts';
import {
  askChanges,
  boardChanges,
  catalogueChanges,
  gist,
  noteChanges,
  notePath,
  setChanges,
} from './lab-events.ts';
import type { Note } from './schema.ts';
import { Segment } from './segment.ts';

const COLD = BoardName.make('cold');
const JUDGE = BoardName.make('judge');

const tried = (n: number) => ({
  n,
  file: Segment.make(`cold.judge.${n}.png`),
  sha256: `s${n}`,
  made: 'import' as const,
  refs: [],
  at: '2026-10-14T00:00:00.000Z',
});

const board = (more: Partial<BoardFile> = {}): BoardFile => ({
  film: 'f',
  panels: [{ id: 'cold.judge', beat: COLD, at: JUDGE, tries: [tried(1)] }],
  approvals: [],
  ...more,
});

describe('boardChanges', () => {
  it('says a try added, then kept with why, then the beat approved and withdrawn', () => {
    const before = board();
    const added = board({
      panels: [{ id: 'cold.judge', beat: COLD, at: JUDGE, tries: [tried(1), tried(2)] }],
    });
    expect(boardChanges(before, added).map((c) => [c.kind, c.panel, c.try, c.path])).toEqual([
      ['board.tried', 'cold.judge', 2, '/films/f/studio?sel=panel%3Acold.judge&try=2'],
    ]);
    const kept = board({
      panels: [
        {
          id: 'cold.judge',
          beat: COLD,
          at: JUDGE,
          tries: [tried(1), tried(2)],
          kept: 2,
          why: 'calmer',
        },
      ],
    });
    const [keep] = boardChanges(added, kept);
    expect(keep).toMatchObject({
      kind: 'board.kept',
      try: 2,
      text: 'calmer',
      beat: 'cold',
      path: '/films/f/studio?sel=panel%3Acold.judge&try=2',
    });
    expect(keep?.summary).toBe('f cold.judge: try 2 kept: calmer');
    const approval = {
      beat: COLD,
      kept: [{ panel: 'cold.judge', try: 2 }],
      at: '2026-10-14T01:00:00.000Z',
    };
    const approved = { ...kept, approvals: [approval] };
    expect(boardChanges(kept, approved).map((c) => [c.kind, c.beat, c.path])).toEqual([
      ['beat.approved', 'cold', '/films/f/studio?sel=beat%3Acold'],
    ]);
    // Approved again (new tries) is an approval, not a withdrawal.
    const again = { ...kept, approvals: [{ ...approval, at: '2026-10-14T02:00:00.000Z' }] };
    expect(boardChanges(approved, again).map((c) => c.kind)).toEqual(['beat.approved']);
    expect(boardChanges(again, kept).map((c) => c.kind)).toEqual(['beat.withdrawn']);
    // Nothing changed, nothing said.
    expect(boardChanges(kept, kept)).toEqual([]);
  });
});

/** A note of film `f` on scene `cold`, open, with `more` of its own. */
const note = (more: Partial<Note> = {}): Note => ({
  scene: 'cold',
  T: 1,
  frame: 30,
  text: 'hand lower',
  id: 'n7',
  film: 'f',
  seq: 1,
  changed: 1,
  status: 'open',
  still: 'n7.png',
  thread: [],
  createdAt: '2026-10-16T00:00:00.000Z',
  ...more,
});

describe('notePath', () => {
  it('opens the studio on the note, its beat selected, for a note on a frame or on words', () => {
    expect(notePath(note())).toBe('/films/f/studio?sel=beat%3Acold&note=n7');
    expect(
      notePath(note({ words: { beat: 'cold', from: 0, to: 1, text: 'the law' }, kind: 'note' })),
    ).toBe('/films/f/studio?sel=beat%3Acold&note=n7');
  });

  it('opens the studio on the note, its panel selected, for a note on a panel', () => {
    expect(notePath(note({ panel: { id: 'cold.judge', try: 2, ask: 'tweak' } }))).toBe(
      '/films/f/studio?sel=panel%3Acold.judge&note=n7',
    );
  });

  it('is the link of every change on the note', () => {
    const n = note({ panel: { id: 'cold.judge' } });
    const reply = {
      seq: 2,
      by: 'agent' as const,
      text: 'made try 3',
      at: '2026-10-16T01:00:00.000Z',
    };
    const changes = noteChanges([
      { _tag: 'NoteAdded', seq: 1, note: n },
      { _tag: 'NoteReplied', seq: 2, note: n, reply },
      { _tag: 'NoteResolved', seq: 3, note: n },
    ]);
    expect(changes.map((c) => c.path)).toEqual(
      Array.from({ length: 3 }, () => '/films/f/studio?sel=panel%3Acold.judge&note=n7'),
    );
  });
});

const catalogue = (encoded: Partial<typeof Catalogue.Encoded>): Catalogue =>
  Schema.decodeSync(Catalogue)({
    ...Schema.encodeSync(Catalogue)(emptyCatalogue('f')),
    ...encoded,
  });

const film = { _tag: 'Film' } as const;

describe('catalogueChanges', () => {
  it('says a comment, an approval, its withdrawal and a render, each linked to its set', () => {
    const before = emptyCatalogue('f');
    const said = catalogue({
      comments: [{ id: 'c1', address: film, variant: 'main', key: 'k', text: 'too dark', at: 1 }],
      approvals: [{ address: film, variant: 'main', key: 'k', at: 2 }],
      renders: [
        {
          address: film,
          variant: 'main',
          kind: 'video',
          settings: { scale: 1, captions: true },
          stamp: { key: 'k' },
          files: { clip: 'f.mp4', images: [] },
          at: 3,
        },
      ],
    });
    const changes = catalogueChanges('spare/f', before, said);
    expect(changes.map((c) => [c.kind, c.set, c.variant])).toEqual([
      ['render.commented', 'spare/f', 'main'],
      ['render.approved', 'spare/f', 'main'],
      ['render.recorded', 'spare/f', 'main'],
    ]);
    expect(changes[0]).toMatchObject({ note: 'c1', text: 'too dark', by: 'owner' });
    expect(changes.every((c) => c.path.startsWith('/sets/spare%2Ff'))).toBe(true);
    expect(
      catalogueChanges('spare/f', said, { ...said, approvals: [] }).map((c) => c.kind),
    ).toEqual(['render.withdrawn']);
  });
});

describe('setChanges', () => {
  it('says a set published once, then updated only when its manifest changed', () => {
    const one = new Map([['spare/a', { title: Option.some('Faces'), stamp: 'x' }]]);
    expect(setChanges(new Map(), one).map((c) => [c.kind, c.set, c.summary, c.path])).toEqual([
      ['set.published', 'spare/a', 'set spare/a (Faces) published', '/sets/spare%2Fa'],
    ]);
    expect(setChanges(one, one)).toEqual([]);
    const changed = new Map([['spare/a', { title: Option.none<string>(), stamp: 'y' }]]);
    expect(setChanges(one, changed).map((c) => [c.kind, c.summary])).toEqual([
      ['set.updated', 'set spare/a updated'],
    ]);
  });
});

describe('gist', () => {
  it('keeps one line and cuts a long one with an ellipsis', () => {
    expect(gist('a\n  b')).toBe('a b');
    expect(gist('abcdef', 4)).toBe('abc…');
  });
});

describe('askChanges', () => {
  /** A step's name, decoded as the lab decodes it. */
  const step = Schema.decodeSync(AskName);
  const asking = Schema.decodeSync(AskRecord)({
    id: 'a0123456789',
    title: 'Keep a try',
    why: 'the beat waits on it',
    by: 'labmcp',
    film: 'f',
    created: '2026-10-14T00:00:00.000Z',
    ask: {
      start: 'pick',
      steps: {
        pick: {
          blocks: [
            {
              kind: 'choose',
              id: 'try',
              label: 'Which?',
              options: [
                { value: '7', label: 'Try 7' },
                { value: '1', label: 'Try 1' },
              ],
            },
          ],
          next: [{ to: 'why', when: { answer: 'try', is: ['7'] } }, { to: 'done' }],
        },
        why: {
          blocks: [{ kind: 'free_text', id: 'why', label: 'Why?' }],
          next: [{ to: 'done' }],
        },
        done: { end: true },
      },
    },
    state: AskState.Asking({ step: step('pick'), answers: {} }),
    answered: [],
  });
  const picked: AskRecord = {
    ...asking,
    state: AskState.Asking({
      step: step('why'),
      answers: { try: { kind: 'choose', value: '7', label: 'Try 7' } },
    }),
    answered: [{ step: step('pick'), values: { try: '7' }, at: '2026-10-14T00:01:00.000Z' }],
  };
  const answers = {
    try: { kind: 'choose', value: '7', label: 'Try 7' },
    why: { kind: 'free_text', text: 'the light' },
  } as const;
  const done: AskRecord = {
    ...picked,
    state: AskState.Answered({ step: step('done'), answers }),
    answered: [
      ...picked.answered,
      { step: step('why'), values: { why: 'the light' }, at: '2026-10-14T00:02:00.000Z' },
    ],
  };

  it('says nothing of an ask made, then each step answered with its answers, then its end', () => {
    expect(askChanges(Option.none(), asking)).toEqual([]);
    expect(askChanges(Option.some(asking), picked)).toEqual([
      {
        ask: 'a0123456789',
        film: 'f',
        kind: 'ask.step',
        by: 'owner',
        step: 'pick',
        answers: { try: { kind: 'choose', value: '7', label: 'Try 7' } },
        summary: 'ask a0123456789 (Keep a try) step pick answered: try: Try 7',
        path: '/asks/a0123456789',
      },
    ]);
    const ended = askChanges(Option.some(picked), done);
    expect(ended.map((c) => [c.kind, c.answers])).toEqual([
      ['ask.step', { why: answers.why }],
      ['ask.answered', answers],
    ]);
    expect(ended[0]?.step).toBe('why');
    // Read again unchanged: nothing.
    expect(askChanges(Option.some(done), done)).toEqual([]);
  });

  it('says an optional answer left empty, typed, in its step and at the end', () => {
    const skipped: AskRecord = {
      ...picked,
      state: AskState.Answered({
        step: step('done'),
        answers: { ...picked.state.answers, why: { kind: 'skipped' } },
      }),
      answered: [
        ...picked.answered,
        { step: step('why'), values: {}, at: '2026-10-14T00:02:00.000Z' },
      ],
    };
    expect(
      askChanges(Option.some(picked), skipped).map((c) => [c.kind, c.answers, c.summary]),
    ).toEqual([
      [
        'ask.step',
        { why: { kind: 'skipped' } },
        'ask a0123456789 (Keep a try) step why answered: why: (skipped)',
      ],
      [
        'ask.answered',
        { try: { kind: 'choose', value: '7', label: 'Try 7' }, why: { kind: 'skipped' } },
        'ask a0123456789 (Keep a try) answered: try: Try 7 · why: (skipped)',
      ],
    ]);
  });

  it('tells a step and the end seen in one read, and a close with why', () => {
    expect(askChanges(Option.some(asking), done).map((c) => c.kind)).toEqual([
      'ask.step',
      'ask.step',
      'ask.answered',
    ]);
    const closed: AskRecord = { ...done, state: AskState.Closed({ answers, why: 'kept try 7' }) };
    expect(askChanges(Option.some(done), closed).map((c) => [c.kind, c.by, c.text])).toEqual([
      ['ask.closed', 'agent', 'kept try 7'],
    ]);
  });

  it('tells an ask answered and closed in one read as answered, then closed; a withdrawn one as closed', () => {
    const closed: AskRecord = { ...done, state: AskState.Closed({ answers, why: 'kept try 7' }) };
    expect(askChanges(Option.some(picked), closed).map((c) => [c.kind, c.answers])).toEqual([
      ['ask.step', { why: answers.why }],
      ['ask.answered', answers],
      ['ask.closed', answers],
    ]);
    const withdrawn: AskRecord = {
      ...picked,
      state: AskState.Closed({ answers: picked.state.answers, why: 'not needed now' }),
    };
    expect(askChanges(Option.some(picked), withdrawn).map((c) => c.kind)).toEqual(['ask.closed']);
    expect(askChanges(Option.some(withdrawn), withdrawn)).toEqual([]);
  });
});
