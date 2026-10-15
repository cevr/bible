// How the Script reader shows the staging voice (`voice.tsx`) and a line's
// delivery marks (`delivery.ts`): in a line, a pause's glyph in its gap
// (`/` a breath, `//` and its seconds a hold) and a stressed word in a
// heavier weight; in a beat's head, its take (▶, which plays it and the
// ready beats after it, and its pace, named slow or fast outside the band;
// else that it is voicing, or refused and why; a beat not voiced yet shows
// nothing); the day's spend, one quiet line at the top of the page; and,
// while words are selected, Hear them in the box's head and their delivery
// under it: Stress and what stands in the gap before them (nothing, a breath
// or a hold, its seconds picked from a few). Every edit is a tap on a
// choice, written at once.

import { Toggle } from '@bible/ui/toggle';
import { ToggleGroup } from '@bible/ui/toggle-group';
import { For, Show } from '@solidjs/web';
import type { Accessor } from 'solid-js';
import { Array as Arr, Match, Option } from 'effect';
import type { StagingTake } from '../../core/api.ts';
import { HOLD_DEFAULT, type Mark } from '../../core/delivery.ts';
import { PlayIcon } from '../page-shell.tsx';
import { pressed } from '../pressed.ts';
import {
  type Gap,
  HOLD_CHOICES,
  gapBefore,
  gapOpen,
  gapSet,
  paceOf,
  stressToggled,
  stressed,
} from './delivery.ts';
import { Marking, useVoice } from './voice.tsx';

/** The band the delivery rules time a line at, as a pace's title says it. */
const BAND = '150–165 wpm';

/** A hold's seconds as the reader writes them: `0.6 s`. */
const secondsOf = (seconds: number): string => `${seconds} s`;

/** A take's pace as its beat's head says it: the bare number in the band, named slow or fast outside it. */
const paceText = (pace: {
  readonly wpm: number;
  readonly band: 'slow' | 'in' | 'fast';
}): string => {
  if (pace.band === 'in') return `${pace.wpm} wpm`;
  return `${pace.wpm} wpm ${pace.band}`;
};

/** What a press on ▶ says it does, by whether its beat is heard now. */
const HEAR_TITLE = {
  true: 'Stop',
  false: 'Hear the staging take, and the beats ready after it',
} as const;
/** ▶'s name, for one who cannot see the glyph: which beat it plays. */
const hearLabel = (hearing: boolean, beat: string): string => {
  if (hearing) return `Stop beat ${beat}`;
  return `Hear beat ${beat}`;
};
/** What the reader's head press says, by whether the script is heard now. */
const HEAR_ALL = { true: '■ Stop', false: '▶ Hear it' } as const;

/** What a gap's choice puts in it: a hold starts at the default seconds. */
const GAP_OF: Readonly<Record<Gap['_tag'], Gap>> = {
  None: { _tag: 'None' },
  Breath: { _tag: 'Breath' },
  Hold: { _tag: 'Hold', seconds: HOLD_DEFAULT },
};

/** A hold's seconds, when the gap holds one. */
const holdOf = (gap: Gap): Option.Option<number> =>
  Match.value(gap).pipe(
    Match.tag('Hold', (h) => Option.some(h.seconds)),
    Match.orElse(() => Option.none<number>()),
  );

/** The pause in the gap before a word, as a glyph in the line: none for an empty gap (read in the JSX: it follows the marks). */
export const GapGlyph = (props: { readonly gap: Gap }) => (
  <>
    {Match.value(props.gap).pipe(
      Match.tagsExhaustive({
        None: () => <></>,
        Breath: () => (
          <span class="lab-script-gap" data-gap="breath" title="A breath">
            /{' '}
          </span>
        ),
        Hold: (h) => (
          <span class="lab-script-gap" data-gap="hold" title={`A hold of ${secondsOf(h.seconds)}`}>
            {`// ${secondsOf(h.seconds)}`}{' '}
          </span>
        ),
      }),
    )}
  </>
);

/** Whether word `at` of `marks` is stressed, as the word's attribute says it. */
export const stressAttr = (marks: ReadonlyArray<Mark>, at: number) =>
  Option.getOrUndefined(Option.liftPredicate('true', () => stressed(marks, at)));

/** A beat's take in its head: ▶ and its pace once ready (■ while it plays), else where it stands. */
export const TakeState = (props: { readonly beat: string }) => {
  const voice = useVoice();
  const take = () => voice.take(props.beat);
  const hearing = () => Option.contains(voice.hearing(), props.beat);
  return (
    <Show when={Option.getOrUndefined(take())}>
      {(t) => (
        <>
          {Match.value<StagingTake>(t()).pipe(
            Match.tagsExhaustive({
              Ready: (ready) => (
                <>
                  <button
                    type="button"
                    class="lab-script-hear"
                    data-act="hear-beat"
                    aria-pressed={pressed(hearing())}
                    aria-label={hearLabel(hearing(), props.beat)}
                    title={HEAR_TITLE[pressed(hearing())]}
                    onClick={() => {
                      if (hearing()) voice.stop();
                      else voice.hear(props.beat, Option.none(), true);
                    }}
                  >
                    <PlayIcon playing={hearing()} />
                  </button>
                  {Option.toArray(paceOf(ready.words)).map((pace) => (
                    <span
                      class="lab-script-pace"
                      data-band={pace.band}
                      title={`The take's pace; the band is ${BAND}`}
                    >
                      {paceText(pace)}
                    </span>
                  ))}
                </>
              ),
              Voicing: () => <span class="lab-script-voicing">voicing…</span>,
              // Nothing to do about a beat not voiced yet: its missing ▶ says it.
              Unvoiced: () => <></>,
              Refused: (r) => (
                <span class="lab-script-voicing" data-refused="true" title={r.reason}>
                  not voiced: {r.reason}
                </span>
              ),
            }),
          )}
        </>
      )}
    </Show>
  );
};

/** The words selected in a beat, as a reader's delivery reads them: word `from` to word `to`. */
export interface Words {
  readonly from: number;
  readonly to: number;
}

/** In the selection's box head: Hear `words` of beat `beat` (none selected: nothing), once its take is ready. */
export const HearWords = (props: {
  readonly beat: string;
  readonly words: Option.Option<Words>;
}) => {
  const voice = useVoice();
  const words = () =>
    Option.filter(props.words, () =>
      Option.exists(voice.take(props.beat), (t) => t._tag === 'Ready'),
    );
  return (
    <Show when={Option.getOrUndefined(words())}>
      {(w) => (
        <button
          type="button"
          class="sh-btn"
          data-act="hear-words"
          title="Hear these words in the staging take"
          onClick={() => voice.hear(props.beat, Option.some({ from: w().from, to: w().to }), false)}
        >
          Hear
        </button>
      )}
    </Show>
  );
};

/** How many of `takes` stand as `tag`. */
const counted = (takes: ReadonlyArray<StagingTake>, tag: StagingTake['_tag']) =>
  takes.filter((t) => t._tag === tag).length;

/** The takes' line: their state, and what the voice cost today (none when the lab makes none). */
interface TakesLine {
  readonly takes: string;
  readonly cost: Option.Option<string>;
}

/**
 * The takes' state, one quiet line: how many are ready of how many, what is
 * being voiced or was refused, and (`cost`, which an ask's reader leaves
 * out) what the voice has cost today against its cap; or that
 * the lab makes none (its fill off), so a beat with no ▶ is said.
 */
const takesLine = (
  takes: ReadonlyArray<StagingTake>,
  spend: { readonly spent: number; readonly cap: number },
): TakesLine => {
  if (takes.length > 0 && counted(takes, 'Unvoiced') === takes.length)
    return { takes: 'staging voice off in this lab: no takes are made', cost: Option.none() };
  const parts = [
    `${counted(takes, 'Ready')} of ${takes.length} takes ready`,
    ...Option.toArray(
      Option.map(
        Option.liftPredicate(counted(takes, 'Voicing'), (n) => n > 0),
        (n) => `${n} voicing`,
      ),
    ),
    ...Option.toArray(
      Option.map(
        Option.liftPredicate(counted(takes, 'Refused'), (n) => n > 0),
        (n) => `${n} refused`,
      ),
    ),
  ];
  return {
    takes: parts.join(' · '),
    cost: Option.some(
      `${spend.spent.toLocaleString('en-US')} of ${spend.cap.toLocaleString('en-US')} characters today`,
    ),
  };
};

/**
 * The takes' state and, with `cost`, the day's staging spend: one quiet line
 * (`takesLine`), its words one run of text.
 */
export const Spend = (props: { readonly cost: boolean }) => {
  const voice = useVoice();
  const line = () =>
    Option.orElse(
      Option.map(voice.unread(), (why) => ({
        takes: `staging voice unread: ${why}`,
        cost: Option.none<string>(),
      })),
      () => Option.map(voice.spend(), (s) => takesLine(voice.takes(), s)),
    );
  return (
    <Show when={Option.getOrUndefined(line())}>
      {(l) => (
        <p class="lab-script-spend">
          {[l().takes, ...Option.toArray(Option.filter(l().cost, () => props.cost))].join(' · ')}
        </p>
      )}
    </Show>
  );
};

/**
 * Hear the script from its first beat with a take ready, on through the
 * ready beats after it (■ Stop while it plays): the reader's one labelled
 * press for its sound, at its head. Nothing until a take is ready.
 */
export const HearIt = (props: { readonly beats: ReadonlyArray<string> }) => {
  const voice = useVoice();
  const first = () =>
    Arr.findFirst(props.beats, (id) => Option.exists(voice.take(id), (t) => t._tag === 'Ready'));
  const hearing = () => Option.isSome(voice.hearing());
  return (
    <Show when={Option.getOrUndefined(first())}>
      {(beat: Accessor<string>) => (
        <button
          type="button"
          class="sh-btn lab-script-hear-all"
          data-act="hear-script"
          aria-pressed={pressed(hearing())}
          onClick={() => {
            if (hearing()) voice.stop();
            else voice.hear(beat(), Option.none(), true);
          }}
        >
          {HEAR_ALL[pressed(hearing())]}
        </button>
      )}
    </Show>
  );
};

/** What the reader's write of marks says while it is out or once it failed: nothing at rest. */
const markingNote = (m: Marking, beat: string, written: string): string => {
  if (m._tag === 'Idle' || m.beat !== beat) return '';
  return Marking.$match(m, {
    Idle: () => '',
    Writing: () => 'marking…',
    Written: () => written,
    Failed: (f) => `not marked: ${f.reason}`,
  });
};

/**
 * The delivery of `selected`, words of beat `beat` (its line `spoken`, as the
 * page read it, said with `marks`): Stress, the gap before them (none for the
 * line's first word, whose silence is the beat's lead), and a hold's seconds.
 * A write carries the line it was made on (its words and marks), so it lands on these or not at
 * all. Nothing while no word of it is selected.
 */
export const Delivery = (props: {
  readonly beat: string;
  readonly marks: ReadonlyArray<Mark>;
  readonly spoken: string;
  readonly selected: Option.Option<Words>;
}) => {
  const voice = useVoice();
  const marks = () => props.marks;
  const words = () => props.spoken.split(' ').filter((w) => w !== '').length;
  const selected = () => props.selected;
  const write = (next: ReadonlyArray<Mark>) =>
    voice.mark(props.beat, next, { spoken: props.spoken, marks: props.marks });
  return (
    <Show when={Option.getOrUndefined(selected())}>
      {(w) => {
        const allStressed = () => Arr.range(w().from, w().to).every((i) => stressed(marks(), i));
        const gap = () => gapBefore(marks(), w().from);
        return (
          <div class="lab-script-delivery" role="group" aria-label="Delivery">
            <div class="lab-script-delivery-row">
              <button
                type="button"
                class="sh-btn"
                data-act="stress-words"
                aria-pressed={pressed(allStressed())}
                title="Stress these words"
                onClick={() => write(stressToggled(marks(), w().from, w().to))}
              >
                Stress
              </button>
              <Show when={gapOpen(w().from, words())}>
                <ToggleGroup<Gap['_tag']>
                  class="sh-seg"
                  aria-label="Before these words"
                  value={[gap()._tag]}
                  onValueChange={(next) =>
                    Option.map(Arr.head(next), (tag) =>
                      write(gapSet(marks(), w().from, GAP_OF[tag])),
                    )
                  }
                >
                  <Toggle<Gap['_tag']> value="None" title="No pause before these words">
                    no pause
                  </Toggle>
                  <Toggle<Gap['_tag']> value="Breath" title="A breath before these words">
                    breath
                  </Toggle>
                  <Toggle<Gap['_tag']> value="Hold" title="A hold before these words">
                    hold
                  </Toggle>
                </ToggleGroup>
              </Show>
            </div>
            <Show when={Option.getOrUndefined(holdOf(gap()))}>
              {(seconds) => (
                <ToggleGroup
                  class="sh-seg lab-script-holds"
                  aria-label="Hold for"
                  value={[String(seconds())]}
                  onValueChange={(next) =>
                    Option.map(Arr.head(next), (s) =>
                      write(gapSet(marks(), w().from, { _tag: 'Hold', seconds: Number(s) })),
                    )
                  }
                >
                  <For each={HOLD_CHOICES}>
                    {(s) => (
                      <Toggle value={String(s)} title={`Hold ${secondsOf(s)}`}>
                        {secondsOf(s)}
                      </Toggle>
                    )}
                  </For>
                </ToggleGroup>
              )}
            </Show>
            <Show when={markingNote(voice.marking(), props.beat, voice.written) !== ''}>
              <p class="lab-script-delivery-note" role="status">
                {markingNote(voice.marking(), props.beat, voice.written)}
              </p>
            </Show>
          </div>
        );
      }}
    </Show>
  );
};
