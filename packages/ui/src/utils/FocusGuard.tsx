// Upstream: packages/react/src/utils/FocusGuard.tsx,
// packages/react/src/utils/InternalBackdrop.tsx
//
// A focus guard is an invisible tabbable span at a popup's edge: Tab onto it
// and the focus manager sends focus where it belongs (wraps inside a modal,
// returns to the page from a portal). The internal backdrop is a fixed,
// transparent layer under a modal popup that catches outside presses, with
// an optional hole cut over the trigger.
import type { JSX } from '@solidjs/web';
import { createMemo, omit } from 'solid-js';

import { platform } from './platform.ts';
import { visuallyHidden } from './visuallyHidden.ts';

export interface FocusGuardProps {
  ref?: ((el: HTMLSpanElement) => void) | undefined;
  'data-type'?: string | undefined;
  onFocus?: ((event: FocusEvent) => void) | undefined;
}

export function FocusGuard(props: FocusGuardProps): JSX.Element {
  // VoiceOver on Safari skips a span with no role; a button role keeps it reachable.
  const role = platform.os.apple && platform.engine.webkit ? 'button' : undefined;
  return (
    <span
      ref={props.ref}
      data-type={props['data-type']}
      onFocus={(event) => props.onFocus?.(event)}
      style={visuallyHidden}
      aria-hidden={role ? undefined : 'true'}
      tabindex={0}
      role={role}
      data-base-ui-focus-guard=""
    />
  );
}

export interface InternalBackdropProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** An element left uncovered (the trigger), so presses reach it. */
  cutout?: Element | null | undefined;
}

export function InternalBackdrop(props: InternalBackdropProps): JSX.Element {
  const rest = omit(props, 'cutout');
  const clipPath = createMemo(() => {
    const cutout = props.cutout;
    if (!cutout) {
      return undefined;
    }
    const rect = cutout.getBoundingClientRect();
    return `polygon(0% 0%,100% 0%,100% 100%,0% 100%,0% 0%,${rect.left}px ${rect.top}px,${rect.left}px ${rect.bottom}px,${rect.right}px ${rect.bottom}px,${rect.right}px ${rect.top}px,${rect.left}px ${rect.top}px)`;
  });
  return (
    <div
      role="presentation"
      data-base-ui-inert=""
      {...rest}
      style={{
        position: 'fixed',
        inset: '0',
        'user-select': 'none',
        '-webkit-user-select': 'none',
        'clip-path': clipPath(),
      }}
    />
  );
}
