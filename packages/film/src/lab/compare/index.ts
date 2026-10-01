// Compare as compound components: `<Compare.Provider>` holds its machine and
// the scene at HEAD; `<Compare.Section>` goes in the shell's panel,
// `<Compare.Layer>` among the layers pinned over the film, and
// `<Compare.Divider>` in the shell's overlay.

import { Provider } from './context.tsx';
import { Divider, Layer, Section } from './section.tsx';

export const Compare = { Provider, Section, Layer, Divider };
