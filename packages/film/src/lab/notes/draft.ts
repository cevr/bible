// A note's draft, pure: what it is about beside its frame (its scope: the cue
// selected, the in and out points, a line of the scene's file and the words
// of its line selected), what a note on words asks of them (a note, a
// correction or a removal) and whether its text says no more than that, and
// the draft a save posts (the scene and the cue edge and mark nearest it; the
// box, the ink, the range, the line and the words only when there are any).

import { Option } from 'effect';
import { type Placed, sceneAt } from '../../core/layout.ts';
import { kindOf, nearestMoment } from '../../core/notes.ts';
import type {
  InkStroke,
  NoteBox,
  NoteCue,
  NoteDraft,
  NoteKind,
  NoteRange,
  NoteSource,
  NoteWords,
  ResolvedCue,
} from '../../core/schema.ts';

/** What the composer holds: the frame noted, what is marked on it, and the words. */
interface Composed {
  readonly T: number;
  readonly box: Option.Option<NoteBox>;
  readonly ink: ReadonlyArray<InkStroke>;
  readonly text: string;
}

/**
 * What the page has selected as a note is written, which the note is about
 * beside its frame (its scope): the cue selected, and the in and out points
 * marked (film seconds).
 */
interface Scope {
  readonly cue: Option.Option<{ readonly scene: string; readonly name: string }>;
  readonly range: Option.Option<{ readonly from: number; readonly to: number }>;
  /** A line of a scene's file. */
  readonly source: Option.Option<{ readonly scene: string; readonly source: NoteSource }>;
  /** Words of a beat's line selected, as they read. */
  readonly words: Option.Option<NoteWords>;
}

/** No scope: a note about its frame alone. */
export const NO_SCOPE: Scope = {
  cue: Option.none(),
  range: Option.none(),
  source: Option.none(),
  words: Option.none(),
};

/** A scope as a note at `T` carries it: the cue, the line and the words if they are in the note's scene, the range cut to that scene. */
interface Scoped {
  readonly scene: string;
  readonly cue: Option.Option<NoteCue>;
  readonly range: Option.Option<NoteRange>;
  readonly source: Option.Option<NoteSource>;
  readonly words: Option.Option<NoteWords>;
}

/**
 * What a note asks of the words it is about (`NoteKind`): its kind, and a
 * correction's words to say in their place.
 */
interface Asked {
  readonly kind: NoteKind;
  readonly replace: string;
}

/** A note that asks nothing of its words but to be read: a note. */
const NOTE_ASKED: Asked = { kind: 'note', replace: '' };

/**
 * What a note on `words` asking `asked` says when its writer says nothing:
 * a correction or a removal says what it asks; a note must say something.
 */
const ASKED_TEXT: Readonly<
  Record<NoteKind, (asked: Asked, words: NoteWords) => Option.Option<string>>
> = {
  note: () => Option.none(),
  correction: (asked, words) => Option.some(`say “${asked.replace.trim()}” for “${words.text}”`),
  removal: (_, words) => Option.some(`remove “${words.text}”`),
};

/**
 * Whether `note` says no more than what it asks of its words (its writer
 * wrote nothing of their own): what it asks says it, so it is said once.
 */
export const saysOnlyAsked = (
  note: Pick<NoteDraft, 'text' | 'words' | 'kind' | 'replace'>,
): boolean =>
  Option.exists(Option.fromUndefinedOr(note.words), (words) =>
    Option.contains(
      ASKED_TEXT[kindOf(note)](
        {
          kind: kindOf(note),
          replace: Option.getOrElse(Option.fromUndefinedOr(note.replace), () => ''),
        },
        words,
      ),
      note.text,
    ),
  );

/**
 * Whether `asked` asks something of `words`: a correction only once it says
 * other words than theirs.
 */
const asksOf = (asked: Asked, words: NoteWords): boolean =>
  asked.kind !== 'correction' ||
  (asked.replace.trim() !== '' && asked.replace.trim() !== words.text);

/** What a draft on `words` carries of what it asks: its kind, and a correction's words. */
const askedFields = (
  asked: Asked,
  words: NoteWords,
): Pick<NoteDraft, 'words' | 'kind' | 'replace'> => ({
  words,
  kind: asked.kind,
  ...Option.match(
    Option.liftPredicate(asked, (a) => a.kind === 'correction'),
    { onNone: () => ({}), onSome: (a) => ({ replace: a.replace.trim() }) },
  ),
});

/** The edge of `cue` nearest `local`: an instant has one. */
const nearerEdge = (cue: ResolvedCue, local: number): NoteCue['edge'] =>
  Option.getOrElse(
    Option.liftPredicate(
      'end' as const,
      () => cue.dur > 0 && Math.abs(local - cue.end) < Math.abs(local - cue.start),
    ),
    () => 'start' as const,
  );

/** `scope` as a note at `T` carries it, in the scene under `T`; none past the film. */
const scopedAt = (placed: ReadonlyArray<Placed>, scope: Scope, T: number): Option.Option<Scoped> =>
  Option.map(sceneAt(placed, T), (p) => {
    const local = Math.max(0, T - p.start);
    return {
      scene: p.spec.id,
      cue: Option.flatMap(
        Option.filter(scope.cue, (c) => c.scene === p.spec.id),
        (c) =>
          Option.map(Option.fromUndefinedOr(p.cues.get(c.name)), (cue): NoteCue => ({
            name: c.name,
            edge: nearerEdge(cue, local),
          })),
      ),
      range: Option.filter(
        Option.map(scope.range, (r): NoteRange => ({
          from: Math.max(0, r.from - p.start),
          to: Math.min(p.dur, r.to - p.start),
        })),
        (r) => r.to > r.from,
      ),
      source: Option.map(
        Option.filter(scope.source, (s) => s.scene === p.spec.id),
        (s) => s.source,
      ),
      words: Option.filter(scope.words, (w) => w.beat === p.spec.id),
    };
  });

/**
 * What a note saying `text` about `words` (none: about its frame alone)
 * says, asking `asked` of them: its writer's words, else what a correction
 * or a removal asks; none for a note that says nothing.
 */
const saidOf = (text: string, words: Option.Option<NoteWords>, asked: Asked) =>
  Option.orElse(
    Option.liftPredicate(text.trim(), (t) => t !== ''),
    () => Option.flatMap(words, (w) => ASKED_TEXT[asked.kind](asked, w)),
  );

/** Why a note is no draft, as its composer says it, and the field that says too little: the words to say instead, or the note's own. */
export interface Unsaid {
  readonly field: 'instead' | 'note';
  readonly says: string;
}

/**
 * Why a note saying `text` about `words`, asking `asked` of them, is no
 * draft, as its composer says it: a correction that says no other words
 * (its field of the words to say instead), a note that says nothing (its
 * own field). None when it is one.
 */
export const unsaid = (
  text: string,
  words: Option.Option<NoteWords>,
  asked: Asked,
): Option.Option<Unsaid> =>
  Option.firstSomeOf([
    Option.as(
      Option.filter(words, (w) => !asksOf(asked, w)),
      { field: 'instead', says: 'Write the words to say instead.' } as const,
    ),
    Option.as(Option.liftPredicate(saidOf(text, words, asked), Option.isNone), {
      field: 'note',
      says: 'Write the note first.',
    } as const),
  ]);

/**
 * The draft `composed` posts, about `scope`, asking `asked` of the words in
 * it: none when it is no draft (`unsaid`: a correction or a removal of
 * words says what it asks, a note must say something), or when it sits past
 * the film. Words out of its scene leave its kind out with them: a note of
 * the frame alone asks nothing of a line.
 */
export const draftOf = (
  placed: ReadonlyArray<Placed>,
  fps: number,
  composed: Composed,
  scope: Scope = NO_SCOPE,
  asked: Asked = NOTE_ASKED,
): Option.Option<NoteDraft> => {
  const { T } = composed;
  const scoped = scopedAt(placed, scope, T);
  const inScope = <A>(f: (s: Scoped) => Option.Option<A>) => Option.flatMap(scoped, f);
  const words = inScope((s) => s.words);
  if (Option.isSome(unsaid(composed.text, words, asked))) return Option.none();
  const said = saidOf(composed.text, words, asked);
  if (Option.isNone(said)) return Option.none();
  const text = said.value;
  return Option.map(nearestMoment(placed, T), (m): NoteDraft => ({
    scene: m.scene,
    T,
    local: m.local,
    frame: Math.round(T * fps),
    text,
    ...Option.match(
      Option.orElse(
        inScope((s) => s.cue),
        () => m.cue,
      ),
      { onNone: () => ({}), onSome: (cue) => ({ cue }) },
    ),
    ...Option.match(
      inScope((s) => s.range),
      { onNone: () => ({}), onSome: (range) => ({ range }) },
    ),
    ...Option.match(
      inScope((s) => s.source),
      { onNone: () => ({}), onSome: (source) => ({ source }) },
    ),
    ...Option.match(words, { onNone: () => ({}), onSome: (w) => askedFields(asked, w) }),
    ...Option.match(m.mark, { onNone: () => ({}), onSome: (mark) => ({ mark }) }),
    ...Option.match(composed.box, { onNone: () => ({}), onSome: (box) => ({ box }) }),
    ...Option.match(
      Option.liftPredicate(composed.ink, (ink) => ink.length > 0),
      { onNone: () => ({}), onSome: (ink) => ({ ink }) },
    ),
  }));
};
