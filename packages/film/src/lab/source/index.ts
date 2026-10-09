// The Source view as compound components: `<Source.Provider>` holds the scene
// whose code is shown, that code, and the view's commands; `<Source.Column>`
// is the laptop's column and `<Source.Sheet>` the phone's own sheet (the
// selection's sheet holds the view as its second face, `Faces`); `<Source.At>`
// is a cue's or knob's `file:line` in the inspector.

import { Provider } from './context.tsx';
import { At } from './link.tsx';
import { Column, Faces, OwnSheet } from './view.tsx';

export const Source = { Provider, Column, Sheet: OwnSheet, Faces, At };
