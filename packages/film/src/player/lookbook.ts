// The look-book page: a film's scenes page (`/films/<film>/scenes`, the Scenes
// tab), its sheet (`lookbook-sheet.ts`, the stills drawn in the film's own
// look) composed live from the code under a status bar in the studio's chrome.
// A still's click opens its scene in the lab at its time (`stillHref`); a
// short's opens its play page, as the lab opens films, not shorts. The bar
// is the studio's and reads its look through the tokens; only the sheet keeps
// its own colours.

import { Array as Arr, Effect, Option } from 'effect';
import type { Film } from '../canvas/film.ts';
import { pageHref } from '../core/api.ts';
import type { Placed } from '../core/layout.ts';
import type { SceneMoment } from '../core/moments.ts';
import { isShortKey } from '../core/shorts.ts';
import type { Host } from '../browser/host.ts';
import { PageLoad } from '../browser/page-load.ts';
import { composeLookbook } from './lookbook-sheet.ts';
import { onTheMs } from './t-in-url.ts';

/**
 * Where a still of page `name` (a film laid out as `placed`) opens: its scene
 * in the lab, at the still's time in that scene; a short's, its play page at
 * the still's time, as the lab opens films, not shorts.
 */
export const stillHref = (
  name: string,
  placed: ReadonlyArray<Placed>,
  moment: SceneMoment,
): string => {
  const scene = Arr.findFirst(placed, (p) => p.spec.id === moment.scene);
  if (isShortKey(name) || Option.isNone(scene))
    return pageHref.play(name, Option.some(onTheMs(moment.time)));
  return pageHref.labScene(
    name,
    moment.scene,
    {},
    Option.some(onTheMs(moment.time - scene.value.start)),
  );
};

/**
 * A film's scenes page (`/films/<film>/scenes`): the look-book sheet,
 * composed live from the code as it is now; a still opens that frame
 * (`stillHref`). It fills `into`, the page's body under the studio's shell,
 * whose page bar is the way to the film's other parts.
 */
export const mountLookbook = (
  film: Film,
  name: string,
  captions: boolean,
  host: Host,
  into: HTMLElement,
): void => {
  document.body.classList.add('lookbook');
  const bar = document.createElement('p');
  bar.className = 'lookbook-bar';
  bar.innerHTML = `<span class="lookbook-status">composing…</span>`;
  const status = bar.querySelector<HTMLSpanElement>('.lookbook-status');
  const sheet = document.createElement('div');
  sheet.className = 'lookbook-sheet';
  into.replaceChildren(bar, sheet);
  const say = (text: string) => {
    if (status !== null) status.textContent = text;
  };
  composeLookbook(film, {
    captions,
    onProgress: (done, of) => say(`composing… ${done}/${of}`),
  })
    .then(({ canvas, tiles }) => {
      say(`${tiles.length} stills · click one to open that frame in the lab`);
      sheet.append(canvas);
      canvas.addEventListener('click', (e) => {
        const r = canvas.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * canvas.width;
        const y = ((e.clientY - r.top) / r.height) * canvas.height;
        const hit = tiles.find((t) => x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h);
        if (hit !== undefined)
          Effect.runSyncWith(host)(
            PageLoad.use((load) => load.open(stillHref(name, film.placed, hit.moment))),
          );
      });
    })
    .catch((e: unknown) => say(`failed: ${String(e)}`));
};
