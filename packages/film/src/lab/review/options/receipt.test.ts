// What a film's write says as its receipt: a pick what the point plays,
// before → after, from the choices shown as it was sent and the choices its
// answer left; a knob its level before → after; a say what was said; a step
// what it walked, undone the other way; the sound check while it runs and
// once it has.

import { describe, expect, test } from 'bun:test';
import { Option, Schema } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { busy, refused, said } from '../../../command/command.ts';
import { FilmChoices, type SoundCheck } from '../../../core/choice.ts';
import { ChangeId } from '../../../core/schema.ts';
import { type LabFailure, LabUnreachable } from '../../api.ts';
import type { Words } from '../format.ts';
import { ChoiceAct, type Wrote } from './api.ts';
import { REVIEW_REDO, REVIEW_UNDO, actWords, partText, soundReceipt } from './receipt.ts';

/** A variant as the wire carries it. */
const variant = (id: string, picked: boolean) => ({
  id,
  label: id,
  lines: [],
  state: 'current',
  picked,
  verbs: [],
  media: { _tag: 'Unseen' },
  key: id,
  approval: 'none',
  comments: [],
});

/** The film's choices: its score playing `playing`, and a level at `level` dB. */
const choices = (playing: string, level: number): FilmChoices =>
  Schema.decodeUnknownSync(FilmChoices)({
    film: 'toy',
    pictures: [],
    points: [
      {
        id: 'score',
        kind: 'score',
        address: { _tag: 'Film' },
        title: 'Score',
        lines: [],
        start: 0,
        marks: [],
        variants: ['strings', 'piano'].map((id) => variant(id, id === playing)),
      },
      {
        id: 'level:const:RAIN',
        kind: 'level',
        address: { _tag: 'Film' },
        title: 'Rain',
        lines: [],
        start: 0,
        marks: [],
        knob: { value: level, min: -40, max: 0, step: 1, unit: 'dB' },
        variants: [],
      },
    ],
  });

/** The change a write made, by the id the lab gave it. */
const K1 = ChangeId.make('k1');

/** What a write answered: its target, and the choices it left (none for a step). */
const wrote = (target: string, left: Option.Option<FilmChoices>): Wrote => ({
  act: ChoiceAct.Undo({ change: Option.none() }),
  target,
  file: 'sound.ts',
  change: Option.some(K1),
  findings: Option.none(),
  choices: left,
  mixed: Option.none(),
});

/** The Undo `words` offer for the answer `w`. */
const undoOf = (words: Words<Wrote>, w: Wrote) =>
  Option.flatMap(Option.fromUndefinedOr(words.undo), (undo) => undo(w));

describe('actWords', () => {
  test('a pick says what the point plays, before → after, undone by Undo', () => {
    const words = actWords(
      ChoiceAct.Verb({ point: 'score', variant: 'piano', verb: 'pick' }),
      choices('strings', -12),
    );
    expect(words.doing).toBe('picked piano…');
    expect(words.done(wrote('score play piano', Option.some(choices('piano', -12))))).toBe(
      'Picked piano · Score: strings → piano',
    );
    expect(undoOf(words, wrote('score play piano', Option.none()))).toEqual(
      Option.some({ command: REVIEW_UNDO, bound: { film: 'toy', change: K1 } }),
    );
  });

  test('a knob says its level before → after, with its unit', () => {
    const words = actWords(
      ChoiceAct.Knob({ point: 'level:const:RAIN', value: -6 }),
      choices('strings', -12),
    );
    expect(words.done(wrote('level:const:RAIN -6', Option.none()))).toBe('Rain: -12 → -6 dB');
  });

  test('a knob says the level that landed, not the one asked for', () => {
    const words = actWords(
      ChoiceAct.Knob({ point: 'level:const:RAIN', value: 10 }),
      choices('strings', -12),
    );
    expect(words.done(wrote('level:const:RAIN 0', Option.some(choices('strings', 0))))).toBe(
      'Rain: -12 → 0 dB',
    );
  });

  test('a say says what was said, and nothing undoes it', () => {
    const words = actWords(
      ChoiceAct.Say({ point: 'score', variant: 'piano', say: { _tag: 'Approve' } }),
      choices('strings', -12),
    );
    expect(words.done(wrote('approve score piano', Option.none()))).toBe('Approved piano · Score');
    expect(undoOf(words, wrote('approve score piano', Option.none()))).toEqual(Option.none());
  });

  test('an Undo says what it walked, undone by Redo; a Redo by Undo', () => {
    const before = choices('strings', -12);
    const undo = actWords(ChoiceAct.Undo({ change: Option.none() }), before);
    expect(undo.done(wrote('undo score play piano', Option.none()))).toBe(
      'Undid score play piano in sound.ts',
    );
    const step = wrote('undo score play piano', Option.none());
    expect(Option.map(undoOf(undo, step), (u) => u.command)).toEqual(Option.some(REVIEW_REDO));
    expect(
      Option.map(
        undoOf(actWords(ChoiceAct.Redo({ change: Option.none() }), before), step),
        (u) => u.command,
      ),
    ).toEqual(Option.some(REVIEW_UNDO));
  });

  test("a source write's Undo is bound to the change it made, on its film; a say has none, nor a write that made no change", () => {
    const before = choices('strings', -12);
    const boundOf = (act: ChoiceAct, answer = wrote('score play piano', Option.none())) =>
      Option.map(undoOf(actWords(act, before), answer), (u) => u.bound);
    const made = Option.some({ film: before.film, change: K1 });
    const pick = ChoiceAct.Verb({ point: 'score', variant: 'piano', verb: 'pick' });
    const knob = ChoiceAct.Knob({ point: 'level:const:RAIN', value: -6 });
    expect(boundOf(pick)).toEqual(made);
    expect(boundOf(knob)).toEqual(made);
    expect(boundOf(ChoiceAct.Undo({ change: Option.none() }))).toEqual(made);
    expect(
      boundOf(ChoiceAct.Say({ point: 'score', variant: 'piano', say: { _tag: 'Approve' } })),
    ).toEqual(Option.none());
    // Already so: the lab wrote nothing, and an Undo would step an earlier write's change.
    const alreadySo: Wrote = {
      ...wrote('level:const:RAIN -12 (already so)', Option.none()),
      change: Option.none(),
    };
    expect(boundOf(knob, alreadySo)).toEqual(Option.none());
    expect(boundOf(pick, alreadySo)).toEqual(Option.none());
  });
});

describe('soundReceipt', () => {
  test('busy while it hears the mix, its findings counted, or why it could not run', () => {
    expect(soundReceipt(AsyncResult.initial())).toEqual(Option.none());
    expect(soundReceipt(AsyncResult.initial(true))).toEqual(
      Option.some(busy('sound check: hearing the mix…')),
    );
    expect(soundReceipt(AsyncResult.success({ findings: [] }))).toEqual(
      Option.some(said('sound check: clean')),
    );
    const failed = AsyncResult.fail<LabFailure, SoundCheck>(
      LabUnreachable.make({ message: 'LabUnreachable: no answer' }),
    );
    expect(soundReceipt(failed)).toEqual(Option.some(refused('sound check: no answer')));
  });
});

describe('partText', () => {
  test('names a part of the project', () => {
    expect(partText({ _tag: 'Film' })).toBe('the film');
    expect(partText({ _tag: 'Act', act: 'opening' })).toBe('act opening');
    expect(partText({ _tag: 'Scenes', ids: ['cold'] })).toBe('scene cold');
  });
});
