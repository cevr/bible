// The studio as compound components: `<Studio.Provider>` holds its runtime,
// the beats and the recorder; `<Studio.Section>` goes in the shell's panel.

import { Provider } from './context.tsx';
import { Section } from './section.tsx';

export const Studio = { Provider, Section };
