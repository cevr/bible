// Upstream: packages/react/src/toast/useToastManager.ts (types),
// packages/react/src/toast/createToastManager.ts (types)
//
// The shapes a toast takes: what a caller passes to `add`, and the toast
// object the store keeps and the parts render.
import type { JSX } from '@solidjs/web';

export interface ToastObject<Data extends object = object> {
  /** The unique identifier for the toast. */
  id: string;
  /** The toast's root element, set by `Toast.Root` once it mounts (focus management reads it). */
  ref?: { current: HTMLElement | null } | undefined;
  /** The title of the toast. */
  title?: JSX.Element;
  /**
   * The type of the toast. Used to conditionally style the toast,
   * including conditionally rendering elements based on the type.
   * A `loading` toast does not auto-dismiss.
   */
  type?: string | undefined;
  /**
   * The amount of time (in ms) before the toast is auto dismissed.
   * A value of `0` will prevent the toast from being dismissed automatically.
   * @default 5000
   */
  timeout?: number | undefined;
  /**
   * The priority of the toast.
   * - `low` - The toast will be announced politely.
   * - `high` - The toast will be announced urgently.
   * @default 'low'
   */
  priority?: 'low' | 'high' | undefined;
  /** The transition status of the toast. */
  transitionStatus?: 'starting' | 'ending' | undefined;
  /** A counter that increments whenever the toast is upserted. */
  updateKey?: number | undefined;
  /** Whether the toast was limited because the toast limit was exceeded. */
  limited?: boolean | undefined;
  /** The measured height of the toast. */
  height?: number | undefined;
  /** Called when the toast is closed. */
  onClose?: (() => void) | undefined;
  /** Called when the toast is removed from the list after its exit animations finish. */
  onRemove?: (() => void) | undefined;
  /** The props for the action button (`Toast.Action`); `children` is its label. */
  actionProps?: ToastObjectActionProps | undefined;
  /** Custom data for the toast. */
  data?: Data | undefined;
}

/** The action button's props carried on a toast: any button attribute or handler, and its label. */
export type ToastObjectActionProps = Omit<JSX.HTMLAttributes<HTMLButtonElement>, 'children'> & {
  children?: JSX.Element;
  disabled?: boolean | undefined;
  [key: string]: unknown;
};

export interface ToastManagerAddOptions<Data extends object> extends Omit<
  ToastObject<Data>,
  'id' | 'height' | 'ref' | 'limited' | 'updateKey'
> {
  /**
   * The unique identifier for the toast. Adding a toast with an existing ID
   * updates it in place and refreshes its auto-dismiss timer.
   */
  id?: string | undefined;
}
