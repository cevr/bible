import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';

import type { ParagraphChangeRow } from '@bible/core/egw-db';

import { MAIL_LIMIT, SyncOutcome, syncMail } from './sync-mail.ts';
import { syncReport, type SyncRun, updateChanges } from './sync-report.ts';
import { wordDiff } from './word-diff.ts';

const atn = { id: 14894, code: 'ATN', title: 'All Things New', revision: 'zip:a' };
const da = { id: 130, code: 'DA', title: 'The Desire of Ages', revision: 'zip:new' };
const aa = { id: 127, code: 'AA', title: 'The Acts of the Apostles', revision: 'zip:aa' };
const niv = {
  id: 14340,
  code: 'NIV',
  title: 'New International Version',
  error: 'CorpusSourceUnavailableError',
  expected: true,
};
const counts = { remote: 1505, installedBefore: 1486, unexpectedFailures: 0, present: 1487 };
const none = { added: 0, removed: 0, edited: 0 };

const change = (
  bookId: number,
  refcode: string,
  kind: ParagraphChangeRow['kind'],
  before: string,
  after: string,
): ParagraphChangeRow => ({
  book_id: bookId,
  ref_code: refcode,
  para_id: Option.getOrNull(Option.none<string>()),
  refcode_short: refcode,
  kind,
  before_text: before,
  after_text: after,
  puborder: 1,
  from_revision: 'zip:old',
  to_revision: 'zip:new',
  recorded_at: '2026-10-18T09:00:00.000Z',
});

const run = (overrides: Partial<SyncRun> = {}): SyncRun => ({
  counts: { ...counts, failures: [niv] },
  added: [atn],
  updated: [],
  verified: [],
  recheckLeft: 0,
  vectorFailures: [],
  ...overrides,
});

describe('wordDiff', () => {
  test('marks the words removed and added between shared runs', () => {
    expect(wordDiff('the quick brown fox', 'the slow brown fox jumps')).toEqual([
      { kind: 'same', text: 'the' },
      { kind: 'removed', text: 'quick' },
      { kind: 'added', text: 'slow' },
      { kind: 'same', text: 'brown fox' },
      { kind: 'added', text: 'jumps' },
    ]);
  });
});

describe('the sync mail', () => {
  test('a quiet week says what was added, and only that, in the subject', () => {
    const mail = syncMail(
      SyncOutcome.Synced({
        run: run(),
        excerpt: [],
        updateChanges: 0,
        report: Option.some('https://egw.cvr.im/sync/2026-10-18T090000Z'),
      }),
    );
    expect(mail.subject).toBe('EGW sync: 1 added, 0 updated');
    expect(mail.text).toContain('Added (1):\n- ATN: All Things New');
    expect(mail.text).not.toContain('Changes');
    expect(mail.text).toContain('Full report: https://egw.cvr.im/sync/2026-10-18T090000Z');
  });

  test('an update shows its changes word by word, capped, with the rest in the report', () => {
    const edits = Array.from({ length: MAIL_LIMIT + 5 }, (_, at) =>
      change(
        130,
        `DA ${String(at + 1)}.1`,
        'edited',
        'he went up to the mount',
        'he went up into the mount',
      ),
    );
    const outcome = run({ added: [], updated: [{ book: da, changes: { ...none, edited: 25 } }] });
    const all = updateChanges(outcome, new Map([[130, edits]]));
    const mail = syncMail(
      SyncOutcome.Synced({
        run: outcome,
        excerpt: all.slice(0, MAIL_LIMIT),
        updateChanges: all.length,
        report: Option.none(),
      }),
    );
    expect(mail.subject).toBe('EGW sync: 0 added, 1 updated');
    expect(mail.text).toContain('- DA: The Desire of Ages (25 edited)');
    expect(mail.text).toContain(`Changes (${String(MAIL_LIMIT)} of 25):`);
    expect(mail.text).toContain('DA 1.1, edited\n  he went up [-to-] {+into+} the mount');
    expect(mail.text).not.toContain('DA 21.1');
  });

  test('older books checked against the library are a line, not an update', () => {
    const mail = syncMail(
      SyncOutcome.Synced({
        run: run({
          added: [],
          verified: [
            { book: aa, changes: { ...none, added: 41 } },
            { book: atn, changes: none },
          ],
          recheckLeft: 1480,
        }),
        excerpt: [],
        updateChanges: 0,
        report: Option.none(),
      }),
    );
    expect(mail.subject).toBe('EGW sync: no changes');
    expect(mail.text).toContain(
      'Checked 2 older books against the library: 1 gained paragraphs the earlier import missed (41 in all). 1480 left to check.',
    );
  });

  test('an unexpected failure or a book without vectors asks for a look', () => {
    const broken = {
      ...niv,
      id: 1,
      code: 'XYZ',
      title: 'A Book',
      error: 'Timeout',
      expected: false,
    };
    const mail = syncMail(
      SyncOutcome.Synced({
        run: run({
          counts: { ...counts, unexpectedFailures: 1, failures: [niv, broken] },
          vectorFailures: [{ id: 14894, reason: 'Workers AI declined' }],
        }),
        excerpt: [],
        updateChanges: 0,
        report: Option.none(),
      }),
    );
    expect(mail.subject).toBe('EGW sync: needs a look (1 failed, 1 without vectors)');
    expect(mail.text).toContain('Failed unexpectedly (1):\n- XYZ: A Book (Timeout)');
    expect(mail.text).toContain('- book 14894: Workers AI declined');
  });

  test('a plan-only run lists what a sync would do', () => {
    const mail = syncMail(
      SyncOutcome.Planned({
        remote: 1505,
        installedBefore: 1487,
        pending: [atn, { id: niv.id, code: niv.code, title: niv.title, revision: 'zip:niv' }],
        changed: [da],
        verify: 150,
        recheckLeft: 1330,
      }),
    );
    expect(mail.subject).toBe('EGW sync plan: 1 to add, 1 updated');
    expect(mail.text).toContain('nothing was written');
    expect(mail.text).toContain('It would check 150 older books');
    expect(mail.text).toContain('A sync would add (1):\n- ATN: All Things New');
    expect(mail.text).toContain(
      'try again the 1 books the library lists but withholds (1 is a translation licensed for reading only)',
    );
  });

  test('a run that stopped says so, with why', () => {
    const mail = syncMail(SyncOutcome.Stopped({ reason: 'plan: the library refused the token' }));
    expect(mail.subject).toBe('EGW sync: stopped before its report');
    expect(mail.text).toContain('plan: the library refused the token');
  });
});

describe('the sync report', () => {
  test('lists every change in Markdown, with paragraph text escaped', () => {
    const outcome = run({
      updated: [{ book: da, changes: { added: 1, removed: 1, edited: 1 } }],
      verified: [
        { book: aa, changes: { ...none, added: 1 } },
        { book: atn, changes: none },
      ],
      recheckLeft: 1480,
    });
    const report = syncReport(
      outcome,
      new Map([
        [
          130,
          [
            change(130, 'DA 1.1', 'edited', 'he went to the mount', 'he went into the mount'),
            change(130, 'DA 2.1', 'added', '', 'A new *line*.'),
            change(130, 'DA 3.1', 'removed', 'Gone <b>now</b>', ''),
          ],
        ],
        [127, [change(127, 'AA 9.1', 'added', '', 'This chapter is based on Acts 2.')]],
      ]),
      '2026-10-18T09:00:12.000Z',
    );
    expect(report).toContain('# EGW sync, 2026-10-18');
    expect(report).toContain('## Added (1)\n\n- **ATN** All Things New');
    expect(report).toContain('### DA — The Desire of Ages\n\n1 edited, 1 added, 1 removed.');
    expect(report).toContain('> he went ~~to~~ **into** the mount');
    expect(report).toContain('> A new \\*line\\*\\.');
    expect(report).toContain('> ~~Gone \\<b\\>now\\</b\\>~~');
    expect(report).toContain('## Checked against the library (2)');
    expect(report).toContain('Only gained paragraphs (1): AA \\+1.');
    expect(report).not.toContain('This chapter is based on Acts 2');
    expect(report).toContain('Unchanged (1): ATN.');
    expect(report).toContain('1480 books are still to check.');
    expect(report).toContain('## Withheld by the library (1)');
    expect(report).toContain('(1 is a translation licensed for reading only): NIV.');
  });
});
