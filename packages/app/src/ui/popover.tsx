import { Show, type JSX } from '@solidjs/web';
import { createEffect, createSignal, createUniqueId } from 'solid-js';

export interface PopoverProps {
  readonly label: string;
  readonly trigger: JSX.Element;
  readonly children: JSX.Element;
  readonly open?: boolean;
  readonly defaultOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}

export const Popover = (props: PopoverProps) => {
  const id = `popover-${createUniqueId()}`;
  const [localOpen, setLocalOpen] = createSignal(props.defaultOpen ?? false);
  const open = () => props.open ?? localOpen();
  const setOpen = (next: boolean): void => {
    if (props.open === undefined) setLocalOpen(next);
    props.onOpenChange?.(next);
  };
  let root: HTMLDivElement | undefined;
  let trigger: HTMLButtonElement | undefined;

  createEffect(open, (visible) => {
    if (!visible) return;
    const dismiss = (event: PointerEvent): void => {
      if (event.target instanceof Node && !root?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      trigger?.focus();
    };
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', dismiss, true);
      document.removeEventListener('keydown', escape, true);
    };
  });

  return (
    <div
      ref={(element) => {
        root = element;
      }}
      class="bible-popover-root"
    >
      <button
        ref={(element) => {
          trigger = element;
        }}
        type="button"
        class="bible-popover-trigger"
        aria-label={props.label}
        aria-haspopup="dialog"
        aria-expanded={open() ? 'true' : 'false'}
        aria-controls={open() ? id : undefined}
        onClick={() => setOpen(!open())}
      >
        {props.trigger}
      </button>
      <Show when={open()}>
        <div id={id} class="bible-popover" role="dialog" aria-label={props.label}>
          {props.children}
        </div>
      </Show>
    </div>
  );
};
