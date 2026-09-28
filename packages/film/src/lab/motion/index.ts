// Motion as compound components: `<Motion.Provider>` holds the loop's
// machine, the speed and the onion's settings; `<Motion.Section>` goes in the
// shell's panel, `<Motion.Onion>` among the layers pinned over the film.

import { Provider } from './context.tsx';
import { Onion, Section } from './section.tsx';

export const Motion = { Provider, Section, Onion };
export { useMotion } from './context.tsx';
export type {
  MotionActions,
  MotionContextValue,
  MotionState,
  OnionView,
  Rate,
} from './context.tsx';
