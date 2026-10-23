/**
 * `react-native-gesture-handler` as the app's tests see it: a detector
 * draws its child, and keeps the gesture it was handed in `gestures`, the
 * latest last, so a test plays the touch a platform's recognizer would
 * report through the gesture's own callbacks. A root view is a plain view.
 */

import type { ReactNode } from 'react';
import { View } from 'react-native';

/** The touch a pan reports: where the finger is along the view, in points. */
interface PanTouch {
  readonly x: number;
}

/** A pan's config, as a screen hands it to `usePanGesture`. */
export interface PanConfig {
  readonly enabled?: boolean;
  readonly onBegin?: (touch: PanTouch) => void;
  readonly onUpdate?: (touch: PanTouch) => void;
  readonly onFinalize?: (end: PanTouch & { readonly canceled: boolean }) => void;
}

/** Each gesture a detector was drawn with, the latest last. */
export const gestures: Array<PanConfig> = [];

export const usePanGesture = (config: PanConfig) => config;

export function GestureDetector({
  gesture,
  children,
}: {
  readonly gesture: PanConfig;
  readonly children: ReactNode;
}) {
  gestures.push(gesture);
  return <>{children}</>;
}

export function GestureHandlerRootView({ children }: { readonly children: ReactNode }) {
  return <View>{children}</View>;
}
