// A variant's approve and unapprove as commands, the same on Choices, Project
// and a Set's version: what each offers, and in whose words.

import { describe, expect, test } from 'bun:test';
import { Effect, Schema } from 'effect';
import { ChoiceVariant } from '../../core/choice.ts';
import { approvalVerbs } from './things.ts';

const variant = (state: string, approval: string) =>
  Schema.decodeUnknownSync(ChoiceVariant)({
    id: 'main',
    label: 'main',
    lines: [],
    state,
    picked: false,
    verbs: [],
    media: { _tag: 'Unseen' },
    key: 'main',
    approval,
    comments: [],
  });

const idle = { waiting: () => false, say: () => Effect.runPromise(Effect.succeed(true)) };

const offered = (state: string, approval: string, said = true, waiting = false) =>
  approvalVerbs(variant(state, approval), { ...idle, waiting: () => waiting }, said).map(
    (v) => `${v.id}:${v.label}`,
  );

describe('approvalVerbs', () => {
  test('a current version not yet approved offers Approve', () => {
    expect(offered('current', 'none')).toEqual(['approve:Approve']);
  });

  test('one approved before it changed offers Approve again, and Unapprove', () => {
    expect(offered('current', 'stale')).toEqual(['approve:Approve again', 'unapprove:Unapprove']);
  });

  test('one approved as it is offers only Unapprove', () => {
    expect(offered('current', 'approved')).toEqual(['unapprove:Unapprove']);
  });

  test('none where nothing is said, or while its own say is in flight', () => {
    expect(offered('current', 'none', false)).toEqual([]);
    expect(offered('current', 'stale', true, true)).toEqual([]);
  });
});
