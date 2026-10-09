// The Source view (the studio's "the code is part of the studio"): the
// scene's file as it stands, in the panel's monospace, with the cues playing
// at the frame lit where the code writes them (their literal in the
// `timeline`) and reads them (`f.at('lift')`), a meter on each playing
// literal's line, and the line `?code=<n>` holds. It is lit by the clock
// (`liveAt`), never by what ran, so a link with `#t=` lights what its sender
// saw. The text is one text node painted through the page's highlights
// (`browser/highlights.ts`), so it stays selectable and copyable.
//
// Closed at rest; opened by `?code=follow` (the view scrolls to what plays)
// or `?code=<line>` (held there). On a laptop it is a column beside the
// picture; on a phone it is a face of the selection's sheet (Inspect ·
// Source), or a sheet of its own while nothing is selected.

import { Toggle } from '@bible/ui/toggle';
import { ToggleGroup } from '@bible/ui/toggle-group';
import { For, type JSX, Portal, Show } from '@solidjs/web';
import { Array as Arr, Boolean as Bool, Effect, Match, Option, Result } from 'effect';
import { createEffect, createMemo, onCleanup } from 'solid-js';
import { Highlights } from '../../browser/highlights.ts';
import { sceneOf } from '../../core/layout.ts';
import type { CodeRange, SceneCode } from '../../core/schema.ts';
import { liveAt } from '../../core/timeline.ts';
import { Sheet } from '../review/inspector.tsx';
import { useLab } from '../shell.tsx';
import { PHONE, useMatches } from '../viewport.ts';
import { useSource } from './context.tsx';
import { type Lit, followLine, lineStarts, litNow } from './lit.ts';
import { FOLLOW } from './open.ts';

/** What `code` lights at the frame shown: its cues playing now, by the clock. */
const useLit = (code: () => SceneCode) => {
  const { state, meta } = useLab();
  return createMemo((): Lit => {
    const c = code();
    state.revision();
    const start = Option.getOrElse(
      Option.map(Result.getSuccess(sceneOf(meta.film.placed, c.scene)), (p) => p.start),
      () => 0,
    );
    return litNow(c, liveAt(meta.stage.cuesOf(c.scene), state.T() - start, meta.film.fps));
  });
};

/** The file's text with its lit spans, meters and held line. */
const Text = (props: { readonly code: SceneCode }) => {
  const { meta } = useLab();
  const { open } = useSource();
  const lit = useLit(() => props.code);
  const lines = createMemo(() => lineStarts(props.code.text).length);
  const numbers = createMemo(() => Arr.makeBy(lines(), (i) => i + 1).join('\n'));
  let scroller = Option.none<HTMLElement>();
  let text = Option.none<HTMLElement>();

  // The ranges lit, painted on the text node; cleared when the view goes.
  const paint = (name: 'lab-live' | 'lab-read', ranges: ReadonlyArray<CodeRange>) =>
    Option.map(
      Option.filter(
        Option.flatMap(text, (el) => Option.fromNullishOr(el.firstChild)),
        (node): node is Text => node instanceof globalThis.Text,
      ),
      (node) => Effect.runSyncWith(meta.host)(Highlights.use((h) => h.paint(name, node, ranges))),
    );
  createEffect(
    () => lit(),
    (now) => {
      paint('lab-live', now.literals);
      paint('lab-read', now.reads);
    },
  );
  onCleanup(() =>
    Effect.runSyncWith(meta.host)(
      Highlights.use((h) => Effect.andThen(h.clear('lab-live'), h.clear('lab-read'))),
    ),
  );

  // The line the view looks at: what plays while it follows, the held line otherwise.
  const held = createMemo(() =>
    Option.flatMap(open(), (o) =>
      Match.value(o).pipe(
        Match.tag('Follow', () => Option.none<number>()),
        Match.tag('Line', ({ line }) => Option.some(Math.min(line, lines()))),
        Match.exhaustive,
      ),
    ),
  );
  const looking = createMemo(() =>
    Option.orElse(held(), () =>
      Option.flatMap(
        Option.filter(open(), (o) => o._tag === 'Follow'),
        () => followLine(props.code, lit()),
      ),
    ),
  );
  createEffect(
    () => looking(),
    (line) => {
      Option.map(Option.all({ line, box: scroller, el: text }), ({ line: n, box, el }) => {
        const lh = Number.parseFloat(getComputedStyle(el).lineHeight);
        if (Number.isNaN(lh) || lh === 0) return;
        const top = (n - 1) * lh;
        const margin = 2 * lh;
        const inView =
          top >= box.scrollTop + margin && top + lh <= box.scrollTop + box.clientHeight - margin;
        if (!inView) box.scrollTo({ top: Math.max(0, top - box.clientHeight / 3) });
      });
    },
  );
  return (
    <div
      class="lab-source-scroll"
      ref={(el: HTMLDivElement) => {
        scroller = Option.some(el);
      }}
    >
      <div
        class="lab-source-page"
        data-live-lines={lit()
          .meters.map((m) => m.line)
          .join(' ')}
      >
        <pre class="lab-source-numbers" aria-hidden="true">
          {numbers()}
        </pre>
        <pre
          class="lab-source-text"
          tabindex="0"
          aria-label={`${props.code.file}, the scene's code`}
        >
          <code
            ref={(el: HTMLElement) => {
              text = Option.some(el);
            }}
          >
            {props.code.text}
          </code>
        </pre>
        <Show when={Option.getOrUndefined(held())}>
          {(line) => <i class="lab-source-held" data-line={line()} style={{ '--line': line() }} />}
        </Show>
        <For each={lit().meters}>
          {(m) => (
            <i
              class="lab-source-meter"
              data-cue={m.name}
              style={{ '--line': m.line, '--done': m.progress }}
            />
          )}
        </For>
      </div>
    </div>
  );
};

/** The view's head: the file it shows, and the cues playing in it. */
const Head = (props: { readonly code: SceneCode; readonly close: boolean }) => {
  const { actions } = useLab();
  const lit = useLit(() => props.code);
  return (
    <header class="lab-source-head">
      <span class="lab-source-file">{props.code.file}</span>
      <span class="lab-source-live" data-empty={String(lit().names.length === 0)}>
        {Bool.match(lit().names.length === 0, {
          onTrue: () => 'nothing playing',
          onFalse: () => lit().names.join(' · '),
        })}
      </span>
      <Show when={props.close}>
        <button
          type="button"
          class="sh-btn lab-source-close"
          data-act="close-source"
          onClick={() => actions.dismissCode()}
        >
          Close
        </button>
      </Show>
    </header>
  );
};

/** The scene's code with its head, once the server has read it. */
const Body = (props: { readonly close: boolean }) => {
  const { code, scene } = useSource();
  return (
    <section class="lab-source" data-role="source" data-scene={scene()}>
      <Show
        when={Option.getOrUndefined(code())}
        fallback={
          <p class="lab-source-note" role="status">
            {`Reading ${scene()}…`}
          </p>
        }
      >
        {(c) => (
          <>
            <Head code={c()} close={props.close} />
            <Text code={c()} />
          </>
        )}
      </Show>
    </section>
  );
};

/** On a laptop, the open view as a column beside the picture, at the window's edge. */
export const Column = () => {
  const { state, meta } = useLab();
  const phone = useMatches(meta.host, PHONE);
  return (
    <Show when={!phone() && Option.isSome(state.code())}>
      <Portal mount={document.body}>
        <aside class="lab-source-col" aria-label="Source">
          <Body close />
        </aside>
      </Portal>
    </Show>
  );
};

/** On a phone with nothing selected, the open view in a sheet of its own. */
export const OwnSheet = () => {
  const { state, actions, meta } = useLab();
  const phone = useMatches(meta.host, PHONE);
  const { scene } = useSource();
  return (
    <Show when={phone() && Option.isSome(state.code()) && Option.isNone(state.selection())}>
      <Sheet
        host={meta.host}
        hub={meta.hub}
        role="source"
        class="lab-source-sheet"
        title={`Source · ${scene()}`}
        initialFocus={() => false}
        onClose={actions.dismissCode}
      >
        <Body close={false} />
      </Sheet>
    </Show>
  );
};

type Face = 'inspect' | 'source';

/**
 * A phone's selection sheet with the Source view as its second face: the tabs
 * (Inspect · Source) are the view's open state in the URL, so Back, Close and a
 * reload each leave the face they left.
 */
export const Faces = (props: { readonly children: JSX.Element }) => {
  const { state, actions } = useLab();
  const face = (): Face =>
    Bool.match(Option.isSome(state.code()), {
      onTrue: (): Face => 'source',
      onFalse: (): Face => 'inspect',
    });
  return (
    <>
      <ToggleGroup<Face>
        class="sh-seg lab-source-tabs"
        aria-label="Face"
        value={[face()]}
        onValueChange={(pressed) => {
          Option.map(Arr.head(pressed), (next) => {
            if (next === face()) return;
            if (next === 'source') actions.showCode(Option.some(FOLLOW));
            else actions.dismissCode();
          });
        }}
      >
        <Toggle<Face> value="inspect" data-face="inspect">
          Inspect
        </Toggle>
        <Toggle<Face> value="source" data-face="source">
          Source
        </Toggle>
      </ToggleGroup>
      <Show when={face() === 'source'} fallback={props.children}>
        <Body close={false} />
      </Show>
    </>
  );
};
