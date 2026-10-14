// The notes the staged film has, as compound components: `<Notes.Provider>`
// holds the composer machine and lends the page's notes (`list.tsx`: the
// feed, the list, the pen and Note frame, the server's as well) what needs
// the film, about what the page selected and its tools lend (the Script's
// words); `<Notes.LabProvider>` is the Lab's, lending its in and out points
// and the Source view's line, with Note this line. `<Notes.Form>` is the
// composer, which `<Notes.Section>` puts in the notes' place in the Lab's
// panel; `<Notes.Marks>` goes first in the shell's overlay (its surface sits
// under every other mark), and `<Notes.Pins>` anywhere (they portal onto the
// player's timeline).

import { LabProvider, Provider } from './context.tsx';
import { Form, Marks, Pins, Section } from './section.tsx';

export const Notes = { Provider, LabProvider, Form, Section, Marks, Pins };
