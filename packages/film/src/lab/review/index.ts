// The review (`film review`, `/`): renders compared in sync and read where
// they lie. `<Review.Root>` holds the page; `<Review.SetProvider>` a set's
// synced player and view; the pages read them.

import { Root, SetProvider } from './context.tsx';
import { FolderPage, Home, QualityToggle, SetPage, ViewTabs } from './section.tsx';

export const Review = { Root, SetProvider, Home, FolderPage, SetPage, QualityToggle, ViewTabs };
export { ReviewApi, reviewApiLayer } from './api.ts';
export type { ReviewCalls } from './api.ts';
export { useReview, useSet } from './context.tsx';
export type { ReviewContextValue, SetContextValue } from './context.tsx';
export { ReviewPage, mountReview } from './mount.tsx';
