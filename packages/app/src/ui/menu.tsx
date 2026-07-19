import { For, Portal, Show, type JSX } from '@solidjs/web';
import { createSignal, createUniqueId, onSettled } from 'solid-js';

export interface MenuItem {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
  readonly select: () => void;
}

interface MenuListProps {
  readonly id: string;
  readonly label: string;
  readonly items: readonly MenuItem[];
  readonly close: () => void;
  readonly restoreFocus?: () => void;
  readonly style?: JSX.CSSProperties;
}

const MenuList = (props: MenuListProps) => {
  let popup: HTMLDivElement | undefined;
  let typeahead = '';
  let typeaheadTimer: ReturnType<typeof setTimeout> | undefined;
  const enabled = () => props.items.filter((item) => !item.disabled);
  const focusAt = (index: number): void => {
    const items = enabled();
    const item = items[(index + items.length) % items.length];
    if (item !== undefined) document.getElementById(`${props.id}-${item.id}`)?.focus();
  };

  onSettled(() => {
    queueMicrotask(() => focusAt(0));
    const outside = (event: PointerEvent): void => {
      if (event.target instanceof Node && !popup?.contains(event.target)) props.close();
    };
    document.addEventListener('pointerdown', outside, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      if (typeaheadTimer !== undefined) clearTimeout(typeaheadTimer);
    };
  });

  return (
    <div
      ref={(element) => {
        popup = element;
      }}
      id={props.id}
      class="bible-menu"
      role="menu"
      aria-label={props.label}
      style={props.style}
      onKeyDown={(event) => {
        const items = enabled();
        const current = items.findIndex(
          (item) => document.activeElement?.id === `${props.id}-${item.id}`,
        );
        if (event.key === 'ArrowDown') focusAt(current + 1);
        else if (event.key === 'ArrowUp') focusAt(current - 1);
        else if (event.key === 'Home') focusAt(0);
        else if (event.key === 'End') focusAt(items.length - 1);
        else if (event.key === 'Escape') {
          props.close();
          props.restoreFocus?.();
        } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
          typeahead += event.key.toLocaleLowerCase();
          if (typeaheadTimer !== undefined) clearTimeout(typeaheadTimer);
          typeaheadTimer = setTimeout(() => (typeahead = ''), 500);
          const match = items.findIndex((item) =>
            item.label.toLocaleLowerCase().startsWith(typeahead),
          );
          if (match >= 0) focusAt(match);
        } else return;
        event.preventDefault();
      }}
    >
      <For each={props.items}>
        {(item) => (
          <button
            id={`${props.id}-${item.id}`}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            tabindex="-1"
            onClick={() => {
              item.select();
              props.close();
            }}
          >
            {item.label}
          </button>
        )}
      </For>
    </div>
  );
};

export interface MenuProps {
  readonly label: string;
  readonly trigger: JSX.Element;
  readonly items: readonly MenuItem[];
  readonly open?: boolean;
  readonly defaultOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}

export const Menu = (props: MenuProps) => {
  const id = `menu-${createUniqueId()}`;
  const [localOpen, setLocalOpen] = createSignal(props.defaultOpen ?? false);
  const open = () => props.open ?? localOpen();
  const setOpen = (next: boolean): void => {
    if (props.open === undefined) setLocalOpen(next);
    props.onOpenChange?.(next);
  };
  let trigger: HTMLButtonElement | undefined;
  return (
    <div class="bible-menu-root">
      <button
        ref={(element) => {
          trigger = element;
        }}
        type="button"
        class="bible-menu-trigger"
        aria-label={props.label}
        aria-haspopup="menu"
        aria-expanded={open() ? 'true' : 'false'}
        aria-controls={open() ? id : undefined}
        onClick={() => setOpen(!open())}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          event.preventDefault();
          setOpen(true);
        }}
      >
        {props.trigger}
      </button>
      <Show when={open()}>
        <MenuList
          id={id}
          label={props.label}
          items={props.items}
          close={() => setOpen(false)}
          restoreFocus={() => trigger?.focus()}
        />
      </Show>
    </div>
  );
};

export interface ContextMenuProps {
  readonly label: string;
  readonly items: readonly MenuItem[];
  readonly children: JSX.Element;
  readonly targetProps?: JSX.HTMLAttributes<HTMLDivElement>;
}

export const ContextMenu = (props: ContextMenuProps) => {
  const id = `context-menu-${createUniqueId()}`;
  const [position, setPosition] = createSignal<{ readonly x: number; readonly y: number }>();
  let target: HTMLDivElement | undefined;
  const close = (): void => setPosition(undefined);
  return (
    <>
      <div
        {...props.targetProps}
        ref={(element) => {
          target = element;
        }}
        class="bible-context-menu-target"
        onContextMenu={(event) => {
          event.preventDefault();
          setPosition({ x: event.clientX, y: event.clientY });
        }}
      >
        {props.children}
      </div>
      <Show when={position()}>
        {(current) => (
          <Portal>
            <MenuList
              id={id}
              label={props.label}
              items={props.items}
              close={close}
              restoreFocus={() => target?.focus()}
              style={{ left: `${String(current().x)}px`, top: `${String(current().y)}px` }}
            />
          </Portal>
        )}
      </Show>
    </>
  );
};
