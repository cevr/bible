// The lab's editor as compound components: `<Editor.Provider>` holds its
// machine and what it knows of the scenes' sources; `<Editor.Strip>` goes in
// the shell's strip slot, `<Editor.Section>` in its panel.

import { Provider } from './context.tsx';
import { Section } from './inspector.tsx';
import { Strip } from './strip.tsx';

export const Editor = { Provider, Strip, Section };
export { useEditor } from './context.tsx';
export type { EditorActions, EditorContextValue, EditorState, Known, Press } from './context.tsx';
