// The notes the staged film has, as compound components: `<Notes.Provider>`
// holds the composer machine and lends the page's notes (`list.tsx`: the
// feed, the list, the pen and Note frame, the server's as well) what needs
// the film; `<Notes.Section>` (the composer) goes in the notes' place in the
// page's panel, `<Notes.Marks>` first in the shell's overlay (its surface
// sits under every other mark), and `<Notes.Pins>` anywhere (they portal
// onto the player's timeline).

import { Provider } from './context.tsx';
import { Marks, Pins, Section } from './section.tsx';

export const Notes = { Provider, Section, Marks, Pins };
