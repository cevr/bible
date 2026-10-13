// The studio's section of the panel: the beats with where each take stands,
// the recorder's controls and status, the microphone (named when not the
// default; picked from ⌘K) and its meter, the teleprompter (the selected
// beat's lines and quotations, as the reading sheet sets them), the
// recording to hear before it is submitted, and the beat's earlier attempts
// to hear and keep. Every piece reads the studio's context.
//
// The studio's keys (R record, Space stop, K submit or accept, ←/→ beat,
// Esc cancel) are commands on the page's hub that run only while focus is
// in the section (`commands.ts`); there they are the studio's alone, so the
// lab's keys bound to the same chords (Space play, ←/→ frame, Esc) never
// fire from here, while its others ([ ] scene, c captions, n note, ⌘Z) do.
// A focused picker or player keeps its own keys.

import { For, Show } from '@solidjs/web';
import { type Accessor, createEffect, onCleanup, onSettled } from 'solid-js';
import { Option } from 'effect';
import type { Part } from '../../core/sheet.ts';
import { BY_BUTTON } from '../../command/command.ts';
import { hubKeys, registerWhile } from '../command/changes.ts';
import { focusFor } from '../focus.ts';
import { pressed } from '../pressed.ts';
import { Lab, useLab } from '../shell.tsx';
import { micCommands, studioCommands } from './commands.ts';
import { type AttemptRow, useStudio } from './context.tsx';
import { type Act, beatBadge } from './view.ts';

/** One stretch of the beat as the owner reads it: a line (its reader named), or a quotation set apart. */
const Stretch = (props: { readonly part: Part }) => {
  const part = props.part;
  if (part.kind === 'quotation')
    return (
      <blockquote class="studio-quotation">
        <p>{part.text}</p>
        <Show when={part.by}>{(by) => <cite>{by()}</cite>}</Show>
      </blockquote>
    );
  return (
    <p class="studio-line">
      <Show when={part.voice}>{(voice) => <span class="studio-voice">{voice()}: </span>}</Show>
      {part.text}
    </p>
  );
};

/** The selected beat's words, large, to read from. */
const Prompter = () => {
  const { state } = useStudio();
  return (
    <div class="studio-prompter" data-role="prompter">
      <Show when={Option.getOrUndefined(state.current())}>
        {(beat) => <For each={beat().parts}>{(part) => <Stretch part={part} />}</For>}
      </Show>
    </div>
  );
};

/**
 * Every beat, each with a dot in its take's state colour and shape: the dots
 * are the count at a glance, every beat on screen with no list to scroll.
 * The words are disclosed: each beat's in its name (`thesis: scratch`, its
 * title on a pointer), the counts in the list's (`1 recorded · 1 scratch ·
 * 1 stale`), and the selected beat's under the list, which a tap shows.
 */
const Beats = () => {
  const { state, actions } = useStudio();
  return (
    <div class="studio-beats">
      <Show when={state.beatsStatus()}>{(status) => <p class="lab-status">{status()}</p>}</Show>
      <ol aria-label={`Beats: ${state.counts()}`} title={state.counts()} data-role="beats">
        <For each={state.beats()}>
          {(beat) => (
            <li>
              <button
                type="button"
                data-beat={beat.id}
                class={['sh-btn', { selected: beat.id === state.beat() }]}
                aria-pressed={pressed(beat.id === state.beat())}
                aria-label={`${beat.id}: ${beatBadge(beat)}`}
                title={`${beat.id}: ${beatBadge(beat)}`}
                onClick={() => actions.select(beat.id)}
              >
                <span class="studio-dot" data-state={beat.state} data-role="badge" />
                <span class="studio-beat-id">{beat.id}</span>
              </button>
            </li>
          )}
        </For>
      </ol>
      <Show when={Option.getOrUndefined(state.current())}>
        {(beat) => (
          <p class="studio-beat-state" data-role="beat-state" data-state={beat().state}>
            {beatBadge(beat())}
          </p>
        )}
      </Show>
    </div>
  );
};

/**
 * The microphone in use, named only when it is not the default (one picked
 * before and gone says so), and its level while it is open. The picker is
 * ⌘K's (`micCommands`: Choose microphone …).
 */
const Mic = () => {
  const { state } = useStudio();
  return (
    <div class="studio-mic">
      <For each={state.mics().filter((o) => o.selected && o.id !== '')} keyed={(o) => o.id}>
        {(o) => (
          <p class="studio-mic-name" data-role="mic">
            {o().label}
          </p>
        )}
      </For>
      <Meter />
    </div>
  );
};

/** Peak and RMS in dBFS with a bar, and the clip warning at −1 dBFS; empty while the microphone is closed. */
const Meter = () => {
  const { state } = useStudio();
  return (
    <div class="studio-meter" data-role="meter">
      <Show when={Option.getOrUndefined(state.meter())}>
        {(m) => (
          <>
            <div class="studio-meter-bar">
              <div
                class={{ 'studio-meter-fill': true, clip: m().clip }}
                style={{ width: `${(m().fill * 100).toFixed(1)}%` }}
              />
            </div>
            <span class="studio-meter-text" data-role="peak">
              peak {m().peak}
            </span>
            <span class="studio-meter-text" data-role="rms">
              rms {m().rms}
            </span>
            <Show when={m().clip}>
              <span class="studio-clip" data-role="clip">
                clipping: turn the input down
              </span>
            </Show>
          </>
        )}
      </Show>
    </div>
  );
};

/** The controls that start or end a take, edged in the recording's colour (design language §5, §7); the rest are quiet. */
const STATE: Partial<Record<Act, 'recording'>> = { arm: 'recording', stop: 'recording' };

/** The tones whose line is said to assistive tech: a take refused or kept, once each; never the line that ticks while recording. */
const SAID: ReadonlySet<string> = new Set(['refused', 'kept']);

/**
 * What the owner can do now, and where the recorder stands: its line, and the
 * same line said politely (`.sh-sr`) when a take is refused or kept.
 */
const Controls = () => {
  const { state } = useStudio();
  const { meta } = useLab();
  // Each button is its command, and names its key as bound now: a rebound key reads as rebound.
  const keys = hubKeys(meta.hub);
  return (
    <div class="studio-controls">
      <div class="studio-buttons">
        <For each={state.controls()} keyed={(c) => c.act}>
          {(c) => (
            <button
              type="button"
              class="sh-btn"
              data-act={c().act}
              data-state={STATE[c().act]}
              onClick={() => meta.hub.invokeId(c().command, BY_BUTTON)}
            >
              {keys.titled(c().label, c().command)}
            </button>
          )}
        </For>
      </div>
      <p class="studio-status" data-role="status" data-tone={state.tone()}>
        {state.status()}
      </p>
      <p class="sh-sr" role="status" data-role="said">
        {Option.getOrElse(
          Option.liftPredicate(state.status(), () => SAID.has(state.tone())),
          () => '',
        )}
      </p>
      <Show when={Option.getOrUndefined(state.review())}>
        {(src) => <audio class="studio-review" data-role="review" controls src={src()} />}
      </Show>
    </div>
  );
};

/** One recording's row: kept by its file, so a player in it keeps playing while the recorder moves. */
const Attempt = (props: { readonly row: Accessor<AttemptRow> }) => {
  const { state, actions } = useStudio();
  const { meta } = useLab();
  const row = props.row;
  return (
    <li class={['studio-attempt', { kept: row().kept }]} data-file={row().file}>
      <div class="studio-attempt-head">
        <span class="studio-attempt-line">{row().line}</span>
        <Show when={row().kept}>
          <span class="sh-badge" data-state="approved">
            kept
          </span>
        </Show>
        <Show when={!row().current}>
          <span class="sh-badge" data-state="stale" title="recorded for the line as it read before">
            earlier line
          </span>
        </Show>
      </div>
      <div class="studio-attempt-row">
        <audio controls preload="none" src={row().src} />
        <button
          type="button"
          class="sh-btn"
          data-act="keep"
          disabled={!(state.keepable() && row().current && !row().kept)}
          // Enter or Space on it is the keyboard's; a click, the pointer's (`Hub.input`).
          onClick={() => actions.keep(row().file, meta.hub.input())}
        >
          Keep
        </button>
      </div>
    </li>
  );
};

/** The selected beat's recordings, newest first, each to hear and keep. */
const Attempts = () => {
  const { state } = useStudio();
  return (
    <div class="studio-attempts">
      <strong>Attempts</strong>
      <Show when={state.attemptsStatus()}>{(status) => <p class="lab-status">{status()}</p>}</Show>
      <ol>
        <For each={state.attempts()} keyed={(row) => row.file}>
          {(row) => <Attempt row={row} />}
        </For>
      </ol>
    </div>
  );
};

/**
 * Focus moved to the section leaves the page where it is (a click lands where it was aimed);
 * each move shows the ring iff a key asked for it (`focusFor`).
 */
const STAY = { preventScroll: true } as const;

/** What the section holds of the DOM: itself, and the element in it that last had focus. */
interface Held {
  root: Option.Option<HTMLElement>;
  last: Option.Option<Element>;
}

/** What takes the focus on a press of its own. */
const FOCUSABLE =
  'a[href], button, input, select, textarea, audio[controls], video[controls], [tabindex], [contenteditable]';

/** Whether a press on `target` focuses `root` itself: no control of its own between them. */
const heldBy = (target: EventTarget, root: Option.Option<HTMLElement>) =>
  target instanceof Element && Option.exists(root, (r) => target.closest(FOCUSABLE) === r);

/** Whether `target` is a button (or inside one). */
const onButton = (target: EventTarget) =>
  target instanceof Element && Option.isSome(Option.fromNullishOr(target.closest('button')));

/**
 * The studio: its keys while focus is in it, and its pieces. Focus stays in
 * it while its controls change under it: a button clicked leaves focus on the
 * section, not on the button (the next state may take the button away), an
 * element that had focus and is gone hands it back to the section, and focus
 * in the studio comes back after the reload a take kept causes.
 */
export const Section = () => {
  const { state, actions } = useStudio();
  const { meta } = useLab();
  const held: Held = { root: Option.none(), last: Option.none() };
  /** Whether the target is in the studio. */
  const within = (target: EventTarget) =>
    target instanceof Node && Option.exists(held.root, (root) => root.contains(target));
  // Focus lost with the element that had it (a control the new state took
  // away) goes back to the section, showing the ring iff the viewer's last
  // input was a key: a control pressed away, or a take that stopped itself.
  // The effect runs once the DOM has changed.
  createEffect(
    () => [state.controls(), state.attempts()],
    () => {
      const lost = Option.exists(held.last, (el) => !el.isConnected);
      if (lost && document.activeElement === document.body)
        Option.map(held.root, (r) => focusFor(r, meta.hub.input(), STAY));
    },
  );
  // A kept take's reload gives the focus back as the input that kept it left it.
  onSettled(() => {
    Option.map(state.refocus, (input) => Option.map(held.root, (r) => focusFor(r, input, STAY)));
  });
  onCleanup(meta.hub.commands.register(...studioCommands(actions)));
  registerWhile(meta.hub, () => micCommands(state.mics(), actions.pick));
  // A press anywhere in the studio the section itself holds the focus for (a button, the
  // prompter, a beat's line) keeps the focus on the section without the ring: a ring the
  // keyboard left there goes. A button's own focus is refused (the next state may take the
  // button away); a control of its own (the mic's picker, a player) takes the focus as the
  // browser gives it.
  const onMouseDown = (e: MouseEvent) => {
    const target = Option.fromNullishOr(e.target);
    if (Option.exists(target, onButton)) e.preventDefault();
    else if (!Option.exists(target, (t) => heldBy(t, held.root))) return;
    Option.map(held.root, (r) => focusFor(r, 'pointer', STAY));
  };
  const onFocusIn = (e: FocusEvent) => {
    held.last = Option.filter(Option.fromNullishOr(e.target), (t) => t instanceof Element);
    actions.focused(true);
  };
  // A control the new state disabled under the focus (Keep, while its take is kept) loses it to
  // the body: it goes back to the section as the input that pressed it left it, as a control
  // taken away does.
  const onFocusOut = (e: FocusEvent) => {
    const to = Option.fromNullishOr(e.relatedTarget);
    const disabled = e.target instanceof Element && e.target.matches(':disabled');
    if (Option.isNone(to) && disabled)
      Option.map(held.root, (r) => focusFor(r, meta.hub.input(), STAY));
    else actions.focused(Option.exists(to, within));
  };
  return (
    <Lab.Fill at="record">
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- no action of its own: it holds focus for the studio's commands, and a click on a button leaves focus here */}
      <div
        class="studio"
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable so the studio's keys are heard while focus is in it
        tabindex="0"
        data-role="studio"
        ref={(el) => {
          held.root = Option.some(el);
        }}
        onMouseDown={onMouseDown}
        onFocusIn={onFocusIn}
        onFocusOut={onFocusOut}
      >
        {/* No heading of its own: the mode tray's Record names the panel. */}
        {/* Record (R) and the meter stand over the prompter, on a phone's first screen. */}
        <Beats />
        <Controls />
        <Mic />
        <Prompter />
        <Attempts />
      </div>
    </Lab.Fill>
  );
};
