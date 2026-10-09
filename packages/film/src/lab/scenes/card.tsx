// A scene's card (design language §6, One surface): the same card wherever a
// scene is shown whole, the scene's sheet (Scenes' and the Project's, the
// one `Sheet`) and the Project's grid. Its picture (a slot: the live frame on
// Scenes, the render on the Project), the scene's hue and name, its act and
// its in, out and length as timecode, its marks as chips (`marks.ts`) and a
// slot for its verb (Open in Lab, Approve); under it in the sheet, its
// findings (`SceneFindings`). The card is a `Target`: a right-click or a long
// press on it opens the commands of what it stands for (the scene on Scenes,
// its render on the Project). `tile` is the grid's size, `focus` the sheet's.

import { For, type JSX, Show } from '@solidjs/web';
import { Option } from 'effect';
import { Selection } from '../../command/selection.ts';
import type { ProjectScene, SceneSpan } from '../../core/catalogue.ts';
import { timecode } from '../../core/time.ts';
import { Target } from '../command/context-menu.tsx';
import { type SceneMarks, bandState, chipsOf } from './marks.ts';

/** Scene `i`'s hue, as every band, dot and rule of it is drawn: from the tokens' saturation and lightness. */
export const sceneHue = (i: number): string =>
  `hsl(${(i * 47) % 360} var(--scene-sat) var(--scene-light))`;

/**
 * A film's state band, as Project's head and a Films card draw it: a
 * segment a scene in film order, as wide as the scene is long (alike while
 * lengths are unknown), in its most pressing mark's state colour, else its hue.
 */
export const StateBand = (props: {
  readonly scenes: ReadonlyArray<ProjectScene>;
  readonly marks: (scene: string) => SceneMarks;
}) => (
  <div class="pj-band" aria-hidden="true">
    <For each={props.scenes} keyed={(s) => s.scene}>
      {(scene, i) => (
        <span
          data-scene={scene().scene}
          data-state={Option.getOrElse(bandState(props.marks(scene().scene)), () => 'none')}
          style={{
            'flex-grow': String(
              Option.getOrElse(
                Option.map(scene().span, (s) => s.dur),
                () => 1,
              ),
            ),
            '--hue': sceneHue(i()),
          }}
        />
      )}
    </For>
  </div>
);

interface SceneCardProps {
  readonly film: string;
  readonly scene: string;
  /** What the card stands for, its menu's: the scene when none. */
  readonly of?: Selection;
  /** The scene's place in the film, from 0: its hue. */
  readonly index: number;
  /** Where it sits in the film, in film seconds (none: not known, nothing shown), and the film's frame rate. */
  readonly span: Option.Option<SceneSpan>;
  readonly fps: number;
  readonly marks: SceneMarks;
  readonly size: 'tile' | 'focus';
  /** The card's picture. */
  readonly picture: JSX.Element;
  /** The scene's name as the card shows it (a page may make it a button): its plain name when none. */
  readonly name?: JSX.Element;
  /** The card's verb (Open in Lab, Approve). */
  readonly verb?: JSX.Element;
  /** Whether it is the one selected. */
  readonly selected?: boolean;
}

/** A scene's card. */
export const SceneCard = (props: SceneCardProps) => (
  <Target
    of={Option.getOrElse(Option.fromUndefinedOr(props.of), () =>
      Selection.cases.Scene.make({ film: props.film, scene: props.scene }),
    )}
    class="sc-card"
    data-size={props.size}
    data-scene={props.scene}
    data-selected={String(props.selected === true)}
  >
    <div class="sc-card-picture">
      {props.picture}
      <Show when={Option.getOrUndefined(Option.filter(props.span, () => props.size === 'tile'))}>
        {(span) => <span class="sc-card-length">{timecode(span().dur, props.fps)}</span>}
      </Show>
    </div>
    <div class="sc-card-head">
      <span class="sc-hue" style={{ background: sceneHue(props.index) }} />
      <span class="sc-card-name">
        {Option.getOrElse(Option.fromUndefinedOr(props.name), (): JSX.Element => props.scene)}
      </span>
    </div>
    <Show when={props.size === 'focus'}>
      <dl class="sc-card-facts">
        <Show when={Option.getOrUndefined(props.marks.act)}>
          {(act) => (
            <>
              <dt>act</dt>
              <dd>{act()}</dd>
            </>
          )}
        </Show>
        <Show when={Option.getOrUndefined(props.span)}>
          {(span) => (
            <>
              <dt>in</dt>
              <dd data-fact="in">{timecode(span().start, props.fps)}</dd>
              <dt>out</dt>
              <dd data-fact="out">{timecode(span().start + span().dur, props.fps)}</dd>
              <dt>length</dt>
              <dd data-fact="length">{timecode(span().dur, props.fps)}</dd>
            </>
          )}
        </Show>
      </dl>
    </Show>
    <div class="sc-chips">
      <For each={chipsOf(props.marks)} keyed={(c) => c.mark}>
        {(chip) => (
          <span
            class="sc-chip"
            data-mark={chip().mark}
            data-state={chip().state}
            title={chip().why}
          >
            {chip().text}
          </span>
        )}
      </For>
    </div>
    <Show when={props.verb}>
      <div class="sc-card-verb">{props.verb}</div>
    </Show>
  </Target>
);

/**
 * Why a scene's render and approval chips say what they say, as Scenes'
 * sheet prints it under its card: a chip's `title` never shows on touch.
 * Its findings chips' lines are `SceneFindings`'. The Project's sheet prints
 * the same section, and passes the lines of what the render is (the command
 * that renders a missing one) as `lines`, which follow the chips'.
 */
export const SceneState = (props: {
  readonly marks: SceneMarks;
  readonly lines?: ReadonlyArray<string>;
}) => {
  const said = () =>
    chipsOf(props.marks).filter((c) => c.mark !== 'errors' && c.mark !== 'warnings');
  const lines = () => Option.getOrElse(Option.fromUndefinedOr(props.lines), () => []);
  return (
    <Show when={said().length + lines().length > 0}>
      <section class="sc-section" data-section="state">
        <h3>State</h3>
        <For each={said()} keyed={(c) => c.mark}>
          {(chip) => (
            <p class="sc-finding" data-mark={chip().mark}>
              {chip().why}
            </p>
          )}
        </For>
        <For each={lines()}>{(line) => <p class="sc-finding">{line}</p>}</For>
      </section>
    </Show>
  );
};

/**
 * A scene's findings, as its sheet shows them under its card (on Scenes and
 * on the Project alike): each line's tag in its level's colour, then what it
 * says; nothing when the check found none about it.
 */
export const SceneFindings = (props: { readonly marks: SceneMarks }) => (
  <Show when={props.marks.findings.length > 0}>
    <section class="sc-section" data-section="findings">
      <h3>
        Findings <span>{props.marks.findings.length}</span>
      </h3>
      <For each={props.marks.findings}>
        {(line) => (
          <p class="sc-finding" data-level={line.level}>
            <b>{line.tag}</b> {line.message}
          </p>
        )}
      </For>
    </section>
  </Show>
);
