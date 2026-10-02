// Upstream: packages/react/src/toast/useToastManager.ts (types),
// packages/react/src/toast/createToastManager.ts (types)
//
// The shapes a toast takes: what a caller passes to `add`, `update` and
// `promise`, and the toast object the store keeps and the parts render.
import type { JSX } from '@solidjs/web';

import type { ToastPositionerProps } from './ToastPositioner.tsx';

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
   */
  type?: string | undefined;
  /** The description of the toast. */
  description?: JSX.Element;
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
  /** A counter that increments whenever the toast is updated or upserted. */
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
  /** The props forwarded to the toast positioner element when rendering anchored toasts. */
  positionerProps?: ToastManagerPositionerProps | undefined;
  /** Custom data for the toast. */
  data?: Data | undefined;
}

/** The action button's props carried on a toast: any button attribute or handler, and its label. */
export type ToastObjectActionProps = Omit<JSX.HTMLAttributes<HTMLButtonElement>, 'children'> & {
  children?: JSX.Element;
  disabled?: boolean | undefined;
  [key: string]: unknown;
};

export interface ToastManagerPositionerProps extends Omit<
  ToastPositionerProps,
  'anchor' | 'toast'
> {
  /** An element to position the toast against. */
  anchor?: Element | null | undefined;
}

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

export interface ToastManagerUpdateOptions<Data extends object> extends Partial<
  Omit<ToastObject<Data>, 'id' | 'ref' | 'height' | 'transitionStatus' | 'limited' | 'updateKey'>
> {}

export interface ToastManagerPromiseOptions<Value, Data extends object> {
  loading: string | ToastManagerUpdateOptions<Data>;
  success:
    | string
    | ToastManagerUpdateOptions<Data>
    | ((result: Value) => string | ToastManagerUpdateOptions<Data>);
  error:
    | string
    | ToastManagerUpdateOptions<Data>
    | ((error: unknown) => string | ToastManagerUpdateOptions<Data>);
}

export type ToastManagerUpdater<Data extends object> =
  | ToastManagerUpdateOptions<Data>
  | ((prevToast: ToastObject<Data>) => ToastManagerUpdateOptions<Data>);
