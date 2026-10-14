// The Board page as compound components: `<Board.Provider>` holds the film's
// storyboard on its narration clock, the panel picked, the sketch over it and
// the panel's requests; `<Board.Picture>`, inside it, paints the animatic over
// the film; `<Board.Column>` is the column of beats (`<Board.Beat>`, each of
// its panels a `<Board.Panel>`), the panel picked open under its beat with
// `<Panel.Tries>`, `<Panel.Notes>` and, in the draw view, the sketch over
// `<Panel.Canvas>` (`../sketch/surface.tsx`).

import { Provider } from './context.tsx';
import { Picture } from './picture.tsx';
import { Beat, Canvas, Column, Notes, PanelChip, Tries } from './view.tsx';

export const Board = { Provider, Picture, Column, Beat, Panel: PanelChip };

export const Panel = { Canvas, Notes, Tries };
