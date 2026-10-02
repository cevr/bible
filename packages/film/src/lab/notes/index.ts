// The notes as compound components: `<Notes.Provider>` holds the feed and the
// composer machines; `<Notes.Pen>` and `<Notes.Frame>` (the Note frame
// button, `n`'s touch path) go in the panel's header,
// `<Notes.Section>` in the panel, `<Notes.Marks>` first in the shell's
// overlay (its surface sits under every other mark), and `<Notes.Pins>`
// anywhere (they portal onto the player's timeline).

import { Provider } from './context.tsx';
import { Frame, Marks, Pen, Pins, Section } from './section.tsx';

export const Notes = { Provider, Pen, Frame, Section, Marks, Pins };
