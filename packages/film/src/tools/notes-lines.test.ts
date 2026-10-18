// A note as `film lab notes` prints it: one line of `key=value` fields, each
// one the note has (where in its scene, the stretch it is about, the line of
// code or the words it cites), its still's path and its words last. Pure.

import { describe, expect, test } from 'bun:test';
import type { Note } from '../core/schema.ts';
import { noteLine } from './notes-lines.ts';

/** A note on the turn scene, its still under `/lab/tiny/stills`, with `more` of its fields. */
const note = (more: Partial<Note>): Note & { readonly stillFile: string } => ({
  id: 'n1',
  film: 'tiny',
  seq: 1,
  changed: 1,
  status: 'open',
  still: 'n1.png',
  stillFile: '/lab/tiny/stills/n1.png',
  thread: [],
  createdAt: '2026-10-18T00:00:00.000Z',
  scene: 'turn',
  T: 5.35,
  frame: 160,
  text: 'the turn drags here',
  ...more,
});

describe('a note as `film lab notes` prints it', () => {
  test('names its cue, mark and box, its replies, its still and its words', () => {
    expect(
      noteLine(
        note({
          cue: { name: 'fold', edge: 'end' },
          mark: 'page',
          box: { x: 860, y: 640, w: 200, h: 120 },
          text: 'the card sits too low',
        }),
        1,
      ),
    ).toBe(
      'note id=n1 seq=1 status=open scene=turn T=5.35 frame=160 cue=fold:end mark=page box=860,640,200x120 replies=0 still=/lab/tiny/stills/n1.png text="the card sits too low"',
    );
  });

  test("prints a note's scene-local seconds, the time a re-take of an earlier scene keeps", () => {
    expect(noteLine(note({ local: 1.2, text: 'later in the turn' }), 1)).toBe(
      'note id=n1 seq=1 status=open scene=turn T=5.35 local=1.20 frame=160 replies=0 still=/lab/tiny/stills/n1.png text="later in the turn"',
    );
  });

  test('prints the stretch of its scene a note is about', () => {
    expect(noteLine(note({ range: { from: 3.2, to: 4 } }), 1)).toBe(
      'note id=n1 seq=1 status=open scene=turn T=5.35 frame=160 range=3.20-4.00 replies=0 still=/lab/tiny/stills/n1.png text="the turn drags here"',
    );
  });

  test('prints the line of the scene’s file a note cites, with its text as it stood', () => {
    expect(
      noteLine(
        note({
          source: { file: 'scenes/turn.ts', line: 118, text: 'if (f.at("push") > 0.5) {' },
          text: 'this branch fires late',
        }),
        1,
      ),
    ).toBe(
      'note id=n1 seq=1 status=open scene=turn T=5.35 frame=160 source=scenes/turn.ts:118 line="if (f.at(\\"push\\") > 0.5) {" replies=0 still=/lab/tiny/stills/n1.png text="this branch fires late"',
    );
  });

  test('prints the words of a line a note is about, what it asks of them and a correction’s words instead', () => {
    const words = { beat: 'turn', from: 4, to: 6, text: 'the page "turns"' };
    expect(
      noteLine(
        note({ words, kind: 'correction', replace: 'the page folds', text: 'say it folds' }),
        1,
      ),
    ).toBe(
      'note id=n1 seq=1 status=open scene=turn T=5.35 frame=160 words=turn:4-6 said="the page \\"turns\\"" kind=correction replace="the page folds" replies=0 still=/lab/tiny/stills/n1.png text="say it folds"',
    );
  });
});
