import type { ReactNode } from 'react';

/**
 * A navigator child drawn on the web only: on a phone, no child. One warns
 * about any other child of a native navigator; `React.Children` flattens an
 * empty list to none, so the navigator sees its screens alone.
 */
export const webOnly = (_: ReactNode): ReactNode => [];
