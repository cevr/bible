import { For, Portal, Show, type JSX } from '@solidjs/web';
import { Effect, type Fiber } from 'effect';
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
  readonly initialFocus?: 'first' | 'last';
  readonly style?: JSX.CSSProperties;
}

const MenuList = (props: MenuListProps) => {
  let popup: HTMLDivElement | undefined;
  let typeahead = '';
  let typeaheadFiber: Fiber.Fiber<void> | undefined;
  const enabled = () => props.items.filter((item) => !item.disabled);
  const focusAt = (index: number): void => {
    const items = enabled();
    const item = items[(index + items.length) % items.length];
    if (item !== undefined) document.getElementById(`${props.id}-${item.id}`)?.focus();
  };

  onSettled(() => {
    let initialIndex = 0;
    if (props.initialFocus === 'last') initialIndex = -1;
    const focusFiber = Effect.runFork(
      Effect.andThen(
        Effect.yieldNow,
        Effect.sync(() => focusAt(initialIndex)),
      ),
    );
    const outside = (event: PointerEvent): void => {
      if (event.target instanceof Node && !popup?.contains(event.target)) props.close();
    };
    document.addEventListener('pointerdown', outside, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      focusFiber.interruptUnsafe();
      typeaheadFiber?.interruptUnsafe();
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
          typeaheadFiber?.interruptUnsafe();
          typeaheadFiber = Effect.runFork(
            Effect.sleep('500 millis').pipe(
              Effect.andThen(
                Effect.sync(() => {
                  typeahead = '';
                }),
              ),
            ),
          );
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
  const [initialFocus, setInitialFocus] = createSignal<'first' | 'last'>('first');
  const open = () => props.open ?? localOpen();
  const setOpen = (next: boolean): void => {
    if (props.open === undefined) setLocalOpen(next);
    props.onOpenChange?.(next);
  };
  const expandedState = (): 'true' | 'false' => {
    if (open()) return 'true';
    return 'false';
  };
  const controls = (): string | undefined => {
    if (open()) return id;
    return undefined;
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
        aria-expanded={expandedState()}
        aria-controls={controls()}
        onClick={() => {
          setInitialFocus('first');
          setOpen(!open());
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          event.preventDefault();
          if (event.key === 'ArrowUp') setInitialFocus('last');
          else setInitialFocus('first');
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
          initialFocus={initialFocus()}
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
  let restoreTarget: HTMLElement | undefined;
  const close = (): void => setPosition(undefined);
  const openAt = (x: number, y: number): void => {
    restoreTarget = undefined;
    if (document.activeElement instanceof HTMLElement) restoreTarget = document.activeElement;
    setPosition({ x, y });
  };
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
          openAt(event.clientX, event.clientY);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
          event.preventDefault();
          const bounds = target?.getBoundingClientRect();
          if (bounds !== undefined) openAt(bounds.left + 16, bounds.top + 16);
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
              restoreFocus={() => restoreTarget?.focus()}
              style={{ left: `${String(current().x)}px`, top: `${String(current().y)}px` }}
            />
          </Portal>
        )}
      </Show>
    </>
  );
};
