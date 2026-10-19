// What the lab's change feed says of two reads of a file: a board's tries
// added and kept, a beat approved and withdrawn; a catalogue's comment,
// approval and render; a set published, then written again; an ask's steps
// answered, its end reached, and its close; a note's own changes; a
// production's words filed and versions opened. Each with the film, panel,
// render, note, ask or production it is about and the lab path it opens on.
// And the catalogue every change is an event of: each name once, one payload
// schema, the read of its whole record, and the bound a payload keeps.

import { describe, expect, it } from 'bun:test';
import { Option, Record, Result, Schema } from 'effect';
import { AskName, AskRecord, AskState } from './ask.ts';
import { type BoardFile, BoardName } from './board.ts';
import { Catalogue, emptyCatalogue } from './catalogue.ts';
import {
  LAB_EVENTS,
  LabChange,
  type LabChangeDraft,
  askChanges,
  boardChanges,
  catalogueChanges,
  changeOf,
  gist,
  namesMatch,
  noteChanges,
  notePath,
  notesNews,
  productionChanges,
  setChanges,
} from './lab-events.ts';
import { Said, moveForward, newProduction } from './production.ts';
import { addNote, emptyNotes, eventsSince, replyToNote, withdrawNote } from './notes.ts';
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
    expect(boardChanges(before, added, 'r1').map((c) => [c.kind, c.panel, c.try, c.path])).toEqual([
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
    const [keep] = boardChanges(added, kept, 'r1');
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
    expect(boardChanges(kept, approved, 'r1').map((c) => [c.kind, c.beat, c.path])).toEqual([
      ['beat.approved', 'cold', '/films/f/studio?sel=beat%3Acold'],
    ]);
    // Approved again (new tries) is an approval, not a withdrawal.
    const again = { ...kept, approvals: [{ ...approval, at: '2026-10-14T02:00:00.000Z' }] };
    expect(boardChanges(approved, again, 'r1').map((c) => c.kind)).toEqual(['beat.approved']);
    expect(boardChanges(again, kept, 'r1').map((c) => c.kind)).toEqual(['beat.withdrawn']);
    // Nothing changed, nothing said.
    expect(boardChanges(kept, kept, 'r1')).toEqual([]);
  });

  it("gives a try made after its board was made again an id of its own, though its number is the old one's", () => {
    const idOf = (more: Partial<ReturnType<typeof tried>>) =>
      boardChanges(
        board({ panels: [{ id: 'cold.judge', beat: COLD, at: JUDGE, tries: [] }] }),
        board({
          panels: [{ id: 'cold.judge', beat: COLD, at: JUDGE, tries: [{ ...tried(1), ...more }] }],
        }),
        'r1',
      ).map((draft) => changeOf(draft, 1, 'now', { local: 'http://localhost:8229/' }).id);
    expect(idOf({})).toEqual(idOf({}));
    expect(idOf({ at: '2026-10-15T00:00:00.000Z' })).not.toEqual(idOf({}));
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
        origin: 'ask/a0123456789/0',
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

describe('the catalogue', () => {
  const kinds = Record.keys(LAB_EVENTS);
  const draft = (
    kind: LabChangeDraft['kind'],
    more: Partial<LabChangeDraft> = {},
  ): LabChangeDraft => ({
    kind,
    summary: `${kind} said`,
    path: '/films/f/studio',
    origin: 'test/1',
    ...more,
  });
  const links = { local: 'http://localhost:8229/', phone: 'http://100.64.0.9:8230/' };
  const encode = Schema.encodeSync(LabChange);
  const decode = Schema.decodeUnknownSync(LabChange);

  it('names every event once, each said, the payload one schema for all', () => {
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(kinds).toContain('ask.answered');
    expect(kinds).toContain('production.decided');
    for (const kind of kinds) {
      expect(LAB_EVENTS[kind].description.length).toBeGreaterThan(10);
      const change = changeOf(
        draft(kind, { film: 'f', ask: 'a1', set: 'p5/s', beat: 'cold' }),
        1,
        'T',
        links,
      );
      expect(decode(encode(change))).toEqual(change);
    }
    expect(kinds).not.toContain('note.created');
  });

  it("answers each event's read as the lab command that reads its record, and its terminal line", () => {
    const read = (kind: LabChangeDraft['kind'], more: Partial<LabChangeDraft>) =>
      changeOf(draft(kind, more), 1, 'T', links).read;
    expect(read('ask.step', { ask: 'a1f' })).toEqual({
      tool: { name: 'ask_read', arguments: { ask: 'a1f' } },
      cli: 'bun cli.ts lab ask_read --ask a1f',
    });
    expect(read('note.added', { film: 'f', note: 'n3' })).toEqual({
      tool: { name: 'notes', arguments: { film: 'f', status: 'all' } },
      cli: 'bun cli.ts lab notes --film f --status all',
    });
    expect(read('beat.approved', { film: 'f', beat: 'cold' }).cli).toBe(
      'bun cli.ts lab board --film f --beat cold',
    );
    expect(read('render.recorded', { film: 'f', set: 'p5/f' }).cli).toBe(
      'bun cli.ts lab catalogue --set p5/f',
    );
    expect(read('set.published', { set: "p5/it's" }).cli).toBe(
      `bun cli.ts lab set --set 'p5/it'\\''s'`,
    );
    expect(read('production.decided', { production: 'f', film: 'f' }).cli).toBe(
      'bun cli.ts lab timeline --film f',
    );
    expect(read('production.forwarded', { production: 'look' })).toEqual({
      cli: 'bun cli.ts production show look',
    });
  });

  it('keeps a payload within its bound: the answers left out and the words cut, said as trimmed', () => {
    const long = 'word '.repeat(80_000);
    const change = changeOf(
      draft('ask.answered', {
        ask: 'a1',
        text: long,
        answers: { why: { kind: 'free_text', text: long } },
      }),
      1,
      'T',
      links,
    );
    expect(change.trimmed).toBe(true);
    expect(change.answers).toBeUndefined();
    expect(change.text?.length).toBeLessThanOrEqual(2000);
    expect(change.read.cli).toBe('bun cli.ts lab ask_read --ask a1');
    expect(
      new TextEncoder().encode(Schema.encodeSync(Schema.fromJsonString(LabChange))(change)).length,
    ).toBeLessThanOrEqual(256 * 1024);
    const small = changeOf(draft('note.added', { text: 'short' }), 1, 'T', links);
    expect(small.trimmed).toBeUndefined();
    expect(small.links.local).toBe('http://localhost:8229/films/f/studio');
  });

  it('matches names by globs: none is every one', () => {
    expect(namesMatch([], 'ask.step')).toBe(true);
    expect(namesMatch(['ask.*'], 'ask.step')).toBe(true);
    expect(namesMatch(['ask.*'], 'task.step')).toBe(false);
    expect(namesMatch(['*.approved', 'note.added'], 'beat.approved')).toBe(true);
    expect(namesMatch(['ask.step'], 'ask.stepped')).toBe(false);
  });

  it('matches a record by its name: every event read from it, a tweak asked among the notes', () => {
    expect(
      Record.keys(LAB_EVENTS)
        .filter((kind) => namesMatch(['notes'], kind))
        .toSorted(),
    ).toEqual(['note.added', 'note.replied', 'note.resolved', 'note.withdrawn', 'tweak.requested']);
    expect(namesMatch(['board'], 'beat.approved')).toBe(true);
    expect(namesMatch(['notes'], 'board.kept')).toBe(false);
    // A kind the catalogue does not know is read from no record.
    expect(namesMatch(['notes'], 'note.pinned')).toBe(false);
  });
});

describe('a note log over time', () => {
  const draft = { scene: 'cold', T: 1, frame: 30 };
  const made = (file: ReturnType<typeof emptyNotes>, text: string, at: string) =>
    addNote(file, { ...draft, text }, at);

  /** Each change's kind and note, as the feed tells two reads. */
  const told = (before: ReturnType<typeof emptyNotes>, after: ReturnType<typeof emptyNotes>) =>
    notesNews(before, after).map((c) => [c.kind, c.note, c.text]);

  it('tells a note withdrawn while the log went on, by the owner', () => {
    const one = made(emptyNotes('f'), 'hand lower', '2026-10-18T10:00:00.000Z');
    const two = made(one, 'look up', '2026-10-18T10:01:00.000Z');
    const gone = Option.getOrThrow(withdrawNote(two, 'n1'));
    expect(notesNews(two, gone).map((c) => [c.kind, c.note, c.by, c.text])).toEqual([
      ['note.withdrawn', 'n1', 'owner', 'hand lower'],
    ]);
    // Read again: nothing more.
    expect(notesNews(gone, gone)).toEqual([]);
  });

  it('tells a reset log whole and withdraws nothing, whether its count fell, held or passed the old one', () => {
    const one = made(emptyNotes('f'), 'before reset', '2026-10-18T10:00:00.000Z');
    const two = made(one, 'also before', '2026-10-18T10:01:00.000Z');
    const fresh = (texts: ReadonlyArray<string>) =>
      texts.reduce(
        (file, text, i) => made(file, text, `2026-10-18T11:0${i}:00.000Z`),
        emptyNotes('f'),
      );
    // Below the old count: one new note where two were.
    expect(told(two, fresh(['after one']))).toEqual([['note.added', 'n1', 'after one']]);
    // At the old count: a new n1 where n1 was.
    expect(told(one, fresh(['after one']))).toEqual([['note.added', 'n1', 'after one']]);
    // Past it, inside one read: trashed, then two notes made.
    expect(told(one, fresh(['after one', 'after two']))).toEqual([
      ['note.added', 'n1', 'after one'],
      ['note.added', 'n2', 'after two'],
    ]);
  });

  it("gives a note made after its file was reset an id of its own, though its number is the old one's", () => {
    const ids = (file: ReturnType<typeof emptyNotes>) =>
      noteChanges(eventsSince(file, 0).events).map(
        (draft) => changeOf(draft, 1, 'now', { local: 'http://localhost:8229/' }).id,
      );
    const before = made(emptyNotes('f'), 'before reset', '2026-10-18T10:00:00.000Z');
    const after = made(emptyNotes('f'), 'after reset', '2026-10-18T11:00:00.000Z');
    expect(ids(before)).toHaveLength(1);
    expect(ids(after)).not.toEqual(ids(before));
    // One note read twice (two labs, one file) keeps one id.
    expect(ids(before)).toEqual(ids(before));
    const replied = replyToNote(
      before,
      'n1',
      { by: 'user', text: 'and the hand', still: Option.none() },
      '2026-10-18T10:05:00.000Z',
    );
    expect(new Set(ids(replied)).size).toBe(2);
  });
});

describe('productionChanges', () => {
  const first = newProduction('rbf', 'RBF', 1, Option.some('righteousness-by-faith'));
  const word = (_tag: 'Decided' | 'Noted' | 'Asked', at: number, text: string) =>
    Said.cases[_tag].make({
      at,
      text,
      quote: Option.none(),
      set: Option.some('rbf-rive'),
      point: Option.none(),
      variant: Option.none(),
      ask: Option.none(),
      by: Option.none(),
    });

  it('tells each word filed and each version opened since, not a ledger first seen', () => {
    expect(productionChanges(Option.none(), first)).toEqual([]);
    const said = {
      ...first,
      said: [word('Decided', 2, '9005 over 9006'), word('Asked', 3, 'which?')],
    };
    expect(
      productionChanges(Option.some(first), said).map((c) => [c.kind, c.by, c.text, c.set]),
    ).toEqual([
      ['production.decided', 'owner', '9005 over 9006', 'rbf-rive'],
      ['production.asked', 'agent', 'which?', 'rbf-rive'],
    ]);
    // A word filed with an earlier time lands among them, and is told.
    const noted = { ...said, said: [word('Noted', 1.5, 'try the one line'), ...said.said] };
    expect(productionChanges(Option.some(said), noted).map((c) => c.kind)).toEqual([
      'production.noted',
    ]);
    // A note with no words of the owner's is an agent's work note; one quoting him is his.
    const quoted = Said.cases.Noted.make({
      text: 'warmer',
      at: 1.7,
      quote: Option.some('make it warmer'),
      set: Option.some('rbf-rive'),
      point: Option.none(),
      variant: Option.none(),
      ask: Option.none(),
      by: Option.none(),
    });
    expect(
      productionChanges(Option.some(said), { ...said, said: [quoted, ...noted.said] }).map((c) => [
        c.text,
        c.by,
      ]),
    ).toEqual([
      ['warmer', 'owner'],
      ['try the one line', 'agent'],
    ]);
    const moved = Result.getOrThrow(
      moveForward(noted, { after: 1, title: 'One Line', because: Option.some('9005') }, 4),
    );
    expect(productionChanges(Option.some(noted), moved)).toEqual([
      {
        production: 'rbf',
        film: 'righteousness-by-faith',
        kind: 'production.forwarded',
        origin: 'production/rbf/2',
        version: 2,
        text: 'One Line',
        summary: 'rbf v2: One Line',
        path: '/productions/rbf?v=2',
      },
    ]);
  });
});
