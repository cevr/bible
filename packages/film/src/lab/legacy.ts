// The panels not yet in Solid, mounted into the Solid shell's panel and
// overlay as they were into the old page. Each moves to Solid in its own
// commit, and this bridge shrinks with it.

import { Option } from 'effect';
import { mountCompare } from '../player/lab-compare.ts';
import { mountMotion } from '../player/lab-motion.ts';
import { mountNotes } from '../player/lab-notes.ts';
import type { LabContextValue } from './shell.tsx';

/** Where the old panels mount: the panel, the overlay, and the box pinned layers go in. */
export interface LegacyHost {
  readonly panel: HTMLElement;
  readonly overlay: SVGSVGElement;
  readonly layers: HTMLElement;
}

export const mountLegacy = (lab: LabContextValue, host: LegacyHost): void => {
  const { player, api, view } = lab.meta;
  const pin = (layer: HTMLElement) => {
    host.layers.append(layer);
    lab.actions.pin(layer);
  };
  const selectedCue = () =>
    Option.getOrUndefined(Option.filter(lab.state.selection(), (s) => s.kind === 'cue'));
  mountMotion(player, host.panel, pin, selectedCue, view);
  mountCompare(player, host.panel, host.overlay, pin, api, view);
  mountNotes(player, host.panel, host.overlay, api);
};
