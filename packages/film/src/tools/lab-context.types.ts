// Compile-time checks for the long-lived server, run by the package
// typecheck. The lab runs for days, and Bun keeps a module as it first
// imported it, so neither the lab's handlers (`LabContext`, what
// `labHandler` runs them with) nor its choices (`ChoicesNeeds`, what
// `Choices.layer` is built on) hold a service that
// imports a film module or the app's sound library, or mixes a film in
// process: a handler or a choice that reached for one would not compile, and
// reads the film through `FreshFilm` instead. The lab's scene writer and its
// HEAD reader are held to the same by what their layers are built on
// (`LayerNeeds`): a cue write is judged fresh, never on this process's first
// import of the film. Each line below fails the typecheck if a loader joins
// one of the lists.

import type { Layer } from 'effect';
import type { ChoicesNeeds } from './choices.ts';
import type { FilmRepo } from './film-repo.ts';
import type { LabContext } from './lab.ts';
import type { SoundLibrary } from './library.ts';
import type { Mixer } from './mixer.ts';
import type { SceneHead } from './scene-head.ts';
import type { SceneWriter } from './scene-writer.ts';

/** The services that import a film's modules or the app's `sounds/library.ts` in their own process. */
type Loader = FilmRepo | SoundLibrary | Mixer;

/** `true` when `Context` holds no loader; otherwise the loaders it holds. */
type LoadsNothing<Context> = [Extract<Context, Loader>] extends [never]
  ? true
  : Extract<Context, Loader>;

/** What a layer is built on. */
type LayerNeeds<L> = L extends Layer.Layer<infer _Out, infer _E, infer In> ? In : never;

export const choicesLoadNothing: LoadsNothing<ChoicesNeeds> = true;

export const labLoadsNothing: LoadsNothing<LabContext> = true;

export const sceneWriterLoadsNothing: LoadsNothing<LayerNeeds<typeof SceneWriter.layer>> = true;

export const sceneHeadLoadsNothing: LoadsNothing<LayerNeeds<typeof SceneHead.layer>> = true;
