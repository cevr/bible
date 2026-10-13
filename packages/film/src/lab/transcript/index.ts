// The Transcript view as compound components: `<Transcript.Provider>` holds
// the talk's words as the server reads them, what is lit and selected, and
// the view's writes and commands; `<Transcript.Column>` is the laptop's column
// and `<Transcript.Sheet>` the phone's own sheet.

import { Provider } from './context.tsx';
import { Column, OwnSheet } from './view.tsx';

export const Transcript = { Provider, Column, Sheet: OwnSheet };
