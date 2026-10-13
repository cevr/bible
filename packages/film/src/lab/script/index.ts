// The Script page as compound components: `<Script.Provider>` holds the
// film's beats as the staged film plays them and as its script says them,
// what is lit and selected, and the page's commands; `<Script.Reader>` is the
// reader, a column beside the picture on a laptop and under it on a phone.

import { Provider } from './context.tsx';
import { Reader } from './view.tsx';

export const Script = { Provider, Reader };
