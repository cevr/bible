// The lab page's entry: build the page's host (`browser/host.ts`), stage the
// film, mount the framework-free preview player (`mountPreview`), and render
// the lab's Solid panels around it. The player page (`/`), which the
// renderer loads, never imports this.

import { render } from '@solidjs/web';
import { Effect, Schema } from 'effect';
import { type Host, hostOf } from '../browser/host.ts';
import { BrowserHost } from '../browser/host-browser.ts';
import { type Films, type Player, mountPreview, showFailure, stageFilm } from '../player/main.ts';
import { Compare } from './compare/index.ts';
import { Editor } from './editor/index.ts';
import { Motion } from './motion/index.ts';
import { Notes } from './notes/index.ts';
import { Studio } from './studio/index.ts';
import { Lab } from './shell.tsx';

/** The lab page could not start: the film did not load, or the page has no such film. */
class LabStartFailed extends Schema.TaggedError<LabStartFailed>()('LabStartFailed', {
  reason: Schema.String,
}) {}

/** The lab: the shell, and each tool in its place. */
const LabPage = (props: {
  readonly name: string;
  readonly player: Player;
  readonly host: Host;
}) => (
  <Lab.Root name={props.name} player={props.player} host={props.host}>
    <Editor.Provider>
      <Motion.Provider>
        <Compare.Provider>
          <Notes.Provider>
            <Motion.Onion />
            <Compare.Layer />
            <Lab.Overlay>
              <Notes.Marks />
              <Editor.Handles />
              <Compare.Divider />
            </Lab.Overlay>
            <Lab.Strip>
              <Editor.Strip />
            </Lab.Strip>
            <Notes.Pins />
            <Lab.Panel>
              <Lab.Header>
                <Notes.Pen />
                <Notes.Frame />
              </Lab.Header>
              <Editor.Section>
                <Editor.Knobs />
              </Editor.Section>
              <Motion.Section />
              <Compare.Section />
              <Notes.Section />
              <Studio.Provider>
                <Studio.Section />
              </Studio.Provider>
            </Lab.Panel>
          </Notes.Provider>
        </Compare.Provider>
      </Motion.Provider>
    </Editor.Provider>
  </Lab.Root>
);

const start = Effect.fn('lab.start')(
  function* (films: Films) {
    const staged = yield* Effect.tryPromise({
      try: () => stageFilm(films),
      catch: (cause) => LabStartFailed.make({ reason: String(cause) }),
    });
    const host = hostOf(BrowserHost.layer);
    const player = mountPreview(staged, host);
    const root = document.createElement('div');
    root.className = 'lab-root';
    document.body.append(root);
    render(() => <LabPage name={staged.name} player={player} host={host} />, root);
    yield* Effect.logInfo(`lab.mounted film=${staged.name}`);
  },
  Effect.catchTag('LabStartFailed', (e) => Effect.sync(() => showFailure(e.reason))),
);

/** Mount the lab for `films` into the page, on the film `?film=<name>` names. */
export const mountLab = (films: Films): void => {
  Effect.runFork(start(films));
};
