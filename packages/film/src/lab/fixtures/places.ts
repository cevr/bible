// Every place a studio page is at (`Places`, `core/api.ts`), by a link the
// lab serves it at: the pages' server tests (the CSS budget, the pure
// render) walk them all, so a place added there is walked, or this fails to
// typecheck. A film's export page is no phone's: the renderer's and the
// easel's, drawn in the browser alone, with no server render.

import { type Places, pageHref } from '../../core/api.ts';

export const PLACE_HREFS = {
  home: pageHref.home(),
  production: pageHref.production('p'),
  ask: pageHref.ask('a0123456789'),
  draft: pageHref.draft('s', 'd'),
  draftBeat: pageHref.draftBeat('s', 'd', '1', '0-0'),
  folder: pageHref.folder('f'),
  set: pageHref.set('f', 'p'),
  choices: pageHref.choices('f'),
  project: pageHref.project('f'),
  scenes: pageHref.scenes('f'),
  scene: pageHref.scene('f', 's'),
  play: pageHref.play('f'),
  lab: pageHref.lab('f'),
  labScene: pageHref.labScene('f', 's'),
  script: pageHref.script('f'),
  scriptBeat: pageHref.scriptBeat('f', 's'),
  board: pageHref.board('f'),
  boardBeat: pageHref.boardBeat('f', 's'),
} satisfies Record<Exclude<keyof typeof Places, 'export'>, string>;
