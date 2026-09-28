// The panel not yet in Solid (the notes), mounted into the Solid shell's
// panel and overlay as it was into the old page. It moves to Solid in its own
// commit, and this bridge goes with it.

import { mountNotes } from '../player/lab-notes.ts';
import type { LabContextValue } from './shell.tsx';

/** Where the notes mount: the panel and the overlay. */
export interface LegacyHost {
  readonly panel: HTMLElement;
  readonly overlay: SVGSVGElement;
}

export const mountLegacy = (lab: LabContextValue, host: LegacyHost): void => {
  mountNotes(lab.meta.player, host.panel, host.overlay, lab.meta.api);
};
