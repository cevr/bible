// How the Script reader shows the staging voice (`voice.tsx`) and a line's
// delivery marks (`delivery.ts`): in a line, a pause's glyph in its gap
// (`/` a breath, `//` and its seconds a hold) and a stressed word set apart;
// in a beat's head, its take (▶ and its pace once ready, else that it is
// voicing, not voiced, or refused, and why); in the reader's head, Hear (the
// script from the beat under the frame on) and the day's spend, one quiet
// line; and in the box under the line while its words are selected, the
// delivery of them: Stress, what stands in the gap before them (nothing, a
// breath or a hold, its seconds picked from a few), and Hear them. Every
// edit is a tap on a choice, written at once.

import { Toggle } from '@bible/ui/toggle';
import { ToggleGroup } from '@bible/ui/toggle-group';
import { For, Show } from '@solidjs/web';
import { Array as Arr, Match, Option } from 'effect';
import type { StagingTake } from '../../core/api.ts';
import { HOLD_DEFAULT, type Mark } from '../../core/delivery.ts';
import { pressed } from '../pressed.ts';
import { useScript } from './context.tsx';
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

/** What a press on Hear or ▶ says it does, by whether something is heard now. */
const HEAR_TITLE = { true: 'Stop', false: 'Hear the staging take' } as const;
const HEAR_GLYPH = { true: '■', false: '▶' } as const;
const HEAR_ALL = { true: 'Stop', false: 'Hear' } as const;

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

/** The pause in the gap before a word, as a glyph in the line: none for an empty gap. */
export const GapGlyph = (props: { readonly gap: Gap }) =>
  Match.value(props.gap).pipe(
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
      {(t) =>
        Match.value<StagingTake>(t()).pipe(
          Match.tagsExhaustive({
            Ready: (ready) => (
              <>
                <button
                  type="button"
                  class="lab-script-hear"
                  data-act="hear-beat"
                  aria-pressed={pressed(hearing())}
                  title={HEAR_TITLE[pressed(hearing())]}
                  onClick={() => {
                    if (hearing()) voice.stop();
                    else voice.hear(props.beat, Option.none(), false);
                  }}
                >
                  {HEAR_GLYPH[pressed(hearing())]}
                </button>
                {Option.toArray(paceOf(ready.words)).map((pace) => (
                  <span
                    class="lab-script-pace"
                    data-band={pace.band}
                    title={`The take's pace; the band is ${BAND}`}
                  >
                    {pace.wpm} wpm
                  </span>
                ))}
              </>
            ),
            Voicing: () => <span class="lab-script-voicing">voicing…</span>,
            Unvoiced: () => <span class="lab-script-voicing">not voiced</span>,
            Refused: (r) => (
              <span class="lab-script-voicing" data-refused="true" title={r.reason}>
                not voiced: {r.reason}
              </span>
            ),
          }),
        )
      }
    </Show>
  );
};

/** The reader's head: Hear the script from the beat under the frame on, or Stop. */
export const HearAll = () => {
  const script = useScript();
  const voice = useVoice();
  const on = () => Option.isSome(voice.hearing());
  return (
    <button
      type="button"
      class="sh-btn lab-script-hear-all"
      data-act="hear-script"
      aria-pressed={pressed(on())}
      title="Hear the staging voice from this beat on"
      onClick={() => {
        if (on()) voice.stop();
        else
          Option.map(
            Arr.findFirst(
              Arr.dropWhile(script.beats, (b) => b.id !== script.live()),
              (b) => Option.exists(voice.take(b.id), (t) => t._tag === 'Ready'),
            ),
            (b) => voice.hear(b.id, Option.none(), true),
          );
      }}
    >
      {HEAR_ALL[pressed(on())]}
    </button>
  );
};

/** The day's staging spend, one quiet line: what the voice has cost today against its cap. */
export const Spend = () => {
  const voice = useVoice();
  const line = () =>
    Option.getOrElse(
      Option.orElse(
        Option.map(voice.unread(), (why) => `staging voice unread: ${why}`),
        () =>
          Option.map(
            voice.spend(),
            (s) =>
              `staging voice: ${s.spent.toLocaleString('en-US')} of ${s.cap.toLocaleString('en-US')} characters today`,
          ),
      ),
      () => '',
    );
  return (
    <Show when={line() !== ''}>
      <p class="lab-script-spend">{line()}</p>
    </Show>
  );
};

/** What the reader's write of marks says while it is out or once it failed: nothing at rest. */
const markingNote = (m: Marking, beat: string): string => {
  if (m._tag === 'Idle' || m.beat !== beat) return '';
  return Marking.$match(m, {
    Idle: () => '',
    Writing: () => 'marking…',
    Written: () => 'marked; the page reloads with it',
    Failed: (f) => `not marked: ${f.reason}`,
  });
};

/**
 * The delivery of the words selected in beat `beat`: Stress, the gap before
 * them (none for the line's first word, whose silence is the beat's lead),
 * a hold's seconds, and Hear them once the take is ready.
 */
export const Delivery = (props: { readonly beat: string }) => {
  const script = useScript();
  const voice = useVoice();
  const beat = Arr.findFirst(script.beats, (b) => b.id === props.beat);
  const marks = () =>
    Option.getOrElse(
      Option.map(beat, (b) => b.delivery),
      () => [],
    );
  const words = () =>
    Option.getOrElse(
      Option.map(
        Option.flatMap(beat, (b) => b.line),
        (l) => l.rows.length,
      ),
      () => 0,
    );
  const selected = () => Option.filter(script.selected(), (w) => w.scene === props.beat);
  const write = (next: ReadonlyArray<Mark>) => voice.mark(props.beat, next);
  return (
    <Show when={Option.getOrUndefined(selected())}>
      {(w) => {
        const allStressed = () => Arr.range(w().from, w().to).every((i) => stressed(marks(), i));
        const gap = () => gapBefore(marks(), w().from);
        const ready = () => Option.exists(voice.take(props.beat), (t) => t._tag === 'Ready');
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
              <Show when={ready()}>
                <button
                  type="button"
                  class="sh-btn"
                  data-act="hear-words"
                  title="Hear these words in the staging take"
                  onClick={() =>
                    voice.hear(props.beat, Option.some({ from: w().from, to: w().to }), false)
                  }
                >
                  Hear
                </button>
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
            <Show when={markingNote(voice.marking(), props.beat) !== ''}>
              <p class="lab-script-delivery-note" role="status">
                {markingNote(voice.marking(), props.beat)}
              </p>
            </Show>
          </div>
        );
      }}
    </Show>
  );
};
