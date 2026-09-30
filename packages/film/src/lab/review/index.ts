// The review (`film review`, `/`): renders compared in sync and read where
// they lie. `<Review.Root>` holds the page; `<Review.SetProvider>` a set's
// synced player and view; the pages read them.

import { Root, SetProvider } from './context.tsx';
import { FilmPage } from './options/section.tsx';
import { FolderPage, Home, QualityToggle, SetPage, ViewTabs } from './section.tsx';

export const Review = {
  Root,
  SetProvider,
  Home,
  FolderPage,
  SetPage,
  FilmPage,
  QualityToggle,
  ViewTabs,
};
export { ChoiceAct, OptionsApi, optionsApiLayer } from './options/api.ts';
export type { OptionsCalls, Wrote } from './options/api.ts';
export { FilmProvider, Heard, useFilm } from './options/context.tsx';
export type { FilmContextValue } from './options/context.tsx';
export { ReviewApi, reviewApiLayer } from './api.ts';
export type { ReviewCalls } from './api.ts';
export { useReview, useSet } from './context.tsx';
export type { ReviewContextValue, SetContextValue } from './context.tsx';
export { ReviewPage, mountReview } from './mount.tsx';
