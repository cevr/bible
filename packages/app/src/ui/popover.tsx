import { Show, type JSX } from '@solidjs/web';
import { Option } from 'effect';
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
    if (Option.isNone(Option.fromNullishOr(props.open))) setLocalOpen(next);
    props.onOpenChange?.(next);
  };
  const expandedState = (): 'true' | 'false' => {
    if (open()) return 'true';
    return 'false';
  };
  const controls = () => {
    if (open()) return Option.some(id);
    return Option.none<string>();
  };
  let root = Option.none<HTMLDivElement>();
  let trigger = Option.none<HTMLButtonElement>();

  createEffect(open, (visible) => {
    if (!visible) return;
    const dismiss = (event: PointerEvent): void => {
      const container = root;
      if (!(event.target instanceof Node)) return;
      if (Option.isSome(container) && container.value.contains(event.target)) return;
      setOpen(false);
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      if (Option.isSome(trigger)) trigger.value.focus();
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
        root = Option.some(element);
      }}
      class="bible-popover-root"
    >
      <button
        ref={(element) => {
          trigger = Option.some(element);
        }}
        type="button"
        class="bible-popover-trigger"
        aria-label={props.label}
        aria-haspopup="dialog"
        aria-expanded={expandedState()}
        aria-controls={Option.getOrUndefined(controls())}
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
