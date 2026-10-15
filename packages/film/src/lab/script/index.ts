// The Script page as compound components: `<Script.Provider>` holds the
// film's beats as the staged film plays them and as its script says them,
// what is lit and selected, and the page's commands; `<Script.Voice>`, inside
// it, holds each beat's staging take, Hear, and the write of a beat's
// delivery marks; `<Script.Notes>`, inside it, holds the film's notes about
// the words it selects and the reader's verbs on them; `<Script.Reader>`,
// inside all three, is the reader, a column beside the picture on a laptop
// and under it on a phone.

import { Provider } from './context.tsx';
import { NotesProvider } from './notes.tsx';
import { Reader } from './view.tsx';
import { VoiceProvider } from './voice.tsx';

export const Script = { Provider, Voice: VoiceProvider, Notes: NotesProvider, Reader };
