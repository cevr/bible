import { describe, expect, test } from 'bun:test';

import { SyncOutcome, syncMail } from './sync-mail.ts';

const atn = { id: 14894, code: 'ATN', title: 'All Things New' };
const niv = {
  id: 14340,
  code: 'NIV',
  title: 'New International Version',
  error: 'CorpusSourceUnavailableError',
  expected: true,
};
const counts = { remote: 1505, installedBefore: 1486, unexpectedFailures: 0, present: 1487 };

describe('the sync mail', () => {
  test('a quiet week says what was installed, and only that, in the subject', () => {
    const mail = syncMail(
      SyncOutcome.Synced({
        counts: { ...counts, failures: [niv] },
        installed: [atn],
        vectorFailures: [],
      }),
    );
    expect(mail.subject).toBe('EGW sync: 1 installed');
    expect(mail.text).toContain('- ATN: All Things New');
    expect(mail.text).toContain('1 books the library lists but does not serve failed as expected.');
    expect(mail.text).not.toContain('Failed unexpectedly');
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
        counts: { ...counts, unexpectedFailures: 1, failures: [niv, broken] },
        installed: [atn],
        vectorFailures: [{ id: 14894, reason: 'Workers AI declined' }],
      }),
    );
    expect(mail.subject).toBe('EGW sync: needs a look (1 failed, 1 without vectors)');
    expect(mail.text).toContain('Failed unexpectedly (1):\n- XYZ: A Book (Timeout)');
    expect(mail.text).toContain('- book 14894: Workers AI declined');
  });

  test('a plan-only run lists what a sync would try', () => {
    const mail = syncMail(
      SyncOutcome.Planned({ remote: 1505, installedBefore: 1487, pending: [atn] }),
    );
    expect(mail.subject).toBe('EGW sync plan: 1 to install');
    expect(mail.text).toContain('nothing was written');
  });

  test('a run that stopped says so, with why', () => {
    const mail = syncMail(SyncOutcome.Stopped({ reason: 'plan: the library refused the token' }));
    expect(mail.subject).toBe('EGW sync: stopped before its report');
    expect(mail.text).toContain('plan: the library refused the token');
  });
});
