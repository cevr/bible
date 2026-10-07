// The lab page's browser entry: mount the studio's shell and the Lab's
// panel (`film-page.tsx`, `panel.tsx`) as every studio page mounts
// (`mountStudio`), hydrated over the markup the lab rendered them with on the
// server (`film-server.tsx`) or rendered anew, then stage the film its path
// names, mount the framework-free preview player (`mountPreview`) on the
// lab's time in the URL (`lab/place.ts`), and put each tool's controls in
// its section of the panel. The render page the renderer loads never
// imports this.

import { Effect, Schema } from 'effect';
import type { Film } from '../canvas/film.ts';
import { type Host, addressOn } from '../browser/host.ts';
import { type Films, type Player, mountPreview, stageFilm } from '../player/main.ts';
import { TIME_MOVE, type TimeInUrl } from '../player/t-in-url.ts';
import { LabClient } from './api.ts';
import { labHrefWith, labOpensAt } from './place.ts';
import { ShellTools, useShellTime } from './page-shell.tsx';
import { type FilmBody, LAB_PAGE, labOn } from './film-page.tsx';
import { mountStudio } from './page-client.tsx';
import { Compare } from './compare/index.ts';
import { Editor } from './editor/index.ts';
import { Motion } from './motion/index.ts';
import { Notes } from './notes/index.ts';
import { Studio } from './studio/index.ts';
import { Lab, useLab } from './shell.tsx';

/** The lab page could not start: the film did not load, or the page has no such film. */
class LabStartFailed extends Schema.TaggedError<LabStartFailed>()('LabStartFailed', {
  reason: Schema.String,
}) {}

/** The header's timecode: the lab's playhead, at the film's rate. */
const LabTime = () => {
  const { state, meta } = useLab();
  useShellTime(state.T, meta.film.fps);
  return <></>;
};

/**
 * The staged lab in the Lab's page: each tool in its place around the
 * staged film's player, its controls in its section of the page's panel.
 */
const LabBody = (props: { readonly player: Player }) => (
  <Lab.Root player={props.player}>
    <LabTime />
    <Editor.Provider>
      <ShellTools>
        <Editor.History />
      </ShellTools>
      <Motion.Provider>
        <Compare.Provider>
          <Notes.Provider>
            <Motion.Onion />
            <Compare.Layer />
            <Lab.Overlay>
              <Notes.Marks />
              <Editor.Handles />
              <Compare.Divider />
              <Compare.Hold />
            </Lab.Overlay>
            <Lab.Strip>
              <Editor.Strip />
            </Lab.Strip>
            <Notes.Pins />
            <Editor.Section>
              <Editor.Knobs />
            </Editor.Section>
            <Motion.Section />
            <Compare.Section />
            <Notes.Section />
            <Studio.Provider>
              <Studio.Section />
            </Studio.Provider>
          </Notes.Provider>
        </Compare.Provider>
      </Motion.Provider>
    </Editor.Provider>
  </Lab.Root>
);

/**
 * The lab's time in the URL: an entry names the frame its place does
 * (`labOpensAt`), on opening and on Back, and each write keeps the place's
 * pick, note, compare mode and loop and puts the frame's scene in the path
 * (`labHrefWith`), so the path and `#t=` move together across a scene
 * boundary. Play crossing one rewrites the entry; a jump to another scene is
 * a step Back walks.
 */
const labTime = (name: string, film: Film, host: Host): TimeInUrl => {
  const address = addressOn(host);
  return {
    at: (href) => labOpensAt(film.placed, href),
    write: (T, cause) =>
      address[TIME_MOVE[cause]](labHrefWith(name, film.placed, address.href(), {}, T)),
  };
};

/** Nothing: the body of a lab whose film did not start (the failure is the page's). */
const NoBody = () => <></>;

/**
 * The lab's body for `films` over `host`: the film its path names staged,
 * its preview mounted on the page's commands, and the lab around it. A film
 * that does not start, or whose faces do not load, fails the page (`fail`:
 * its panel's notes feed and its keys end, and it says why in its place).
 */
const labBody =
  (films: Films, host: Host, fail: (why: string) => Effect.Effect<void>): FilmBody =>
  (hub) =>
    Effect.runPromiseWith(host)(
      Effect.gen(function* () {
        const address = addressOn(host);
        const staged = yield* Effect.tryPromise({
          try: () => stageFilm(films, address.href()),
          catch: (cause) => LabStartFailed.make({ reason: String(cause) }),
        });
        const player = mountPreview(
          staged,
          host,
          labTime(staged.name, staged.film, host),
          hub,
          fail,
        );
        yield* Effect.logInfo(`lab.mounted film=${staged.name}`);
        return {
          default: () => <LabBody player={player} />,
        };
      }).pipe(
        Effect.catchTag('LabStartFailed', (e) => Effect.as(fail(e.reason), { default: NoBody })),
      ),
    );

/**
 * Mount the lab for `films` into the page, on the film its path names
 * (`/films/<film>/lab…`): the shell at once, hydrated over the server's
 * markup or rendered anew, and the lab in its body once the film is staged.
 */
export const mountLab = (films: Films): void =>
  // The page's commands: the player's transport and every tool's verbs.
  mountStudio({
    page: LAB_PAGE,
    event: 'lab.shell',
    on: (host, fail) =>
      labOn(host, Object.keys(films), LabClient.layer, labBody(films, host, fail)),
  });
