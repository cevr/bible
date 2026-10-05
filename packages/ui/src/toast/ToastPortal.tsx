// Upstream: packages/react/src/toast/portal/ToastPortal.tsx
//
// A portal element that moves the viewport to a different part of the DOM.
// By default, the portal element is appended to `<body>`. Renders a `<div>`
// element.
import type { JSX } from '@solidjs/web';

import { FloatingPortal, type FloatingPortalProps } from '../floating-ui-solid/FloatingPortal.tsx';

export interface ToastPortalState {}

export interface ToastPortalProps extends FloatingPortalProps {}

export function ToastPortal(props: ToastPortalProps): JSX.Element {
  return <FloatingPortal {...props} />;
}
