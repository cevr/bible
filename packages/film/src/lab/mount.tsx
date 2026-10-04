// The lab page's entry: build the page's host (`browser/host.ts`), stage the
// film its path names, mount the framework-free preview player
// (`mountPreview`) on the lab's time in the URL (`lab/place.ts`), and render
// the lab's Solid panels around it. The player page (`/films/<film>/play`,
// and the export page the renderer loads) never imports this.

import { render } from '@solidjs/web';
import { Effect, Option, Schema } from 'effect';
import type { Film } from '../canvas/film.ts';
import { legacyPlace } from '../core/api.ts';
import { type Host, addressOn, hostOf } from '../browser/host.ts';
import { BrowserHost } from '../browser/host-browser.ts';
import { type Films, type Player, mountPreview, showFailure, stageFilm } from '../player/main.ts';
import type { TimeInUrl } from '../player/t-in-url.ts';
import { ViewerStore } from '../browser/storage-browser.ts';
import { type Hub, makeHub } from '../command/hub.ts';
import { COMMAND_CSS } from './command/style.ts';
import { labHref, labOpensAt, labPlaceOf } from './place.ts';
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
  readonly hub: Hub;
}) => (
  <Lab.Root name={props.name} player={props.player} host={props.host} hub={props.hub}>
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

/**
 * The lab's time in the URL: an entry names the frame its place does
 * (`labOpensAt`), on opening and on Back, and each write keeps the place's
 * pick and note and puts the frame's scene in the path (`labHref`), so the
 * path and `#t=` move together across a scene boundary.
 */
const labTime = (name: string, film: Film, host: Host): TimeInUrl => {
  const address = addressOn(host);
  return {
    at: (href) => labOpensAt(film.placed, href),
    write: (T) => {
      const { selection, note } = labPlaceOf(address.href());
      address.replace(labHref(name, film.placed, { selection, note }, T));
    },
  };
};

const start = Effect.fn('lab.start')(
  function* (films: Films, host: Host) {
    const address = addressOn(host);
    // An old link the server could not see all of (a bare `#<seconds>`) goes on to its place.
    Option.map(legacyPlace(address.href()), address.replace);
    const staged = yield* Effect.tryPromise({
      try: () => stageFilm(films, address.href()),
      catch: (cause) => LabStartFailed.make({ reason: String(cause) }),
    });
    // The page's commands and its one key listener: the player's transport and every tool's verbs.
    const hub = yield* makeHub('lab', address.href, ViewerStore);
    yield* Effect.forkDetach(hub.listen);
    const player = mountPreview(staged, host, labTime(staged.name, staged.film, host), hub);
    const style = document.createElement('style');
    style.textContent = COMMAND_CSS;
    document.head.append(style);
    const root = document.createElement('div');
    root.className = 'lab-root';
    document.body.append(root);
    render(() => <LabPage name={staged.name} player={player} host={host} hub={hub} />, root);
    yield* Effect.logInfo(`lab.mounted film=${staged.name}`);
  },
  Effect.catchTag('LabStartFailed', (e) => Effect.sync(() => showFailure(e.reason))),
);

/** Mount the lab for `films` into the page, on the film its path names (`/films/<film>/lab…`). */
export const mountLab = (films: Films): void => {
  const host = hostOf(BrowserHost.layer);
  Effect.runForkWith(host)(start(films, host));
};
