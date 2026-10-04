// The lab's editor as compound components: `<Editor.Provider>` holds its
// machine and what it knows of the scenes' sources; `<Editor.Strip>` goes in
// the shell's strip slot, `<Editor.Section>` in its panel with `<Editor.Knobs>`
// (the inspected scene's knob rows) inside it, `<Editor.History>` (Undo, Redo)
// in the studio header's tools, and `<Editor.Handles>` in the
// shell's overlay (a handle on the frame for each point knob).

import { Provider } from './context.tsx';
import { History, Section } from './inspector.tsx';
import { Handles, Rows } from './knobs.tsx';
import { Strip } from './strip.tsx';

export const Editor = { Provider, Strip, Section, History, Knobs: Rows, Handles };
