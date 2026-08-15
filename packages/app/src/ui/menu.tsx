import { For, Portal, Show, type JSX } from '@solidjs/web';
import { Effect, Option, type Fiber } from 'effect';
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
  let popup = Option.none<HTMLDivElement>();
  let typeahead = '';
  let typeaheadFiber = Option.none<Fiber.Fiber<void>>();
  const enabled = () => props.items.filter((item) => !item.disabled);
  const focusAt = (index: number): void => {
    const items = enabled();
    const item = Option.fromNullishOr(items[(index + items.length) % items.length]);
    if (Option.isSome(item)) {
      document.getElementById(`${props.id}-${item.value.id}`)?.focus();
    }
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
      const container = popup;
      if (!(event.target instanceof Node)) return;
      if (Option.isSome(container) && container.value.contains(event.target)) return;
      props.close();
    };
    document.addEventListener('pointerdown', outside, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      focusFiber.interruptUnsafe();
      if (Option.isSome(typeaheadFiber)) typeaheadFiber.value.interruptUnsafe();
    };
  });

  return (
    <div
      ref={(element) => {
        popup = Option.some(element);
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
          if (Option.isSome(typeaheadFiber)) typeaheadFiber.value.interruptUnsafe();
          typeaheadFiber = Option.some(
            Effect.runFork(
              Effect.sleep('500 millis').pipe(
                Effect.andThen(
                  Effect.sync(() => {
                    typeahead = '';
                  }),
                ),
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
  let trigger = Option.none<HTMLButtonElement>();
  return (
    <div class="bible-menu-root">
      <button
        ref={(element) => {
          trigger = Option.some(element);
        }}
        type="button"
        class="bible-menu-trigger"
        aria-label={props.label}
        aria-haspopup="menu"
        aria-expanded={expandedState()}
        aria-controls={Option.getOrUndefined(controls())}
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
          restoreFocus={() => {
            if (Option.isSome(trigger)) trigger.value.focus();
          }}
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
  const [position, setPosition] = createSignal<
    Option.Option<{ readonly x: number; readonly y: number }>
  >(Option.none());
  let target = Option.none<HTMLDivElement>();
  let restoreTarget = Option.none<HTMLElement>();
  const close = (): void => {
    setPosition(Option.none());
  };
  const openAt = (x: number, y: number): void => {
    restoreTarget = Option.none();
    if (document.activeElement instanceof HTMLElement) {
      restoreTarget = Option.some(document.activeElement);
    }
    setPosition(Option.some({ x, y }));
  };
  return (
    <>
      <div
        {...props.targetProps}
        ref={(element) => {
          target = Option.some(element);
        }}
        class="bible-context-menu-target"
        onContextMenu={(event) => {
          event.preventDefault();
          openAt(event.clientX, event.clientY);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
          event.preventDefault();
          const bounds = Option.map(target, (element) => element.getBoundingClientRect());
          if (Option.isSome(bounds)) openAt(bounds.value.left + 16, bounds.value.top + 16);
        }}
      >
        {props.children}
      </div>
      <Show when={Option.getOrUndefined(position())}>
        {(current) => (
          <Portal>
            <MenuList
              id={id}
              label={props.label}
              items={props.items}
              close={close}
              restoreFocus={() => {
                if (Option.isSome(restoreTarget)) restoreTarget.value.focus();
              }}
              style={{ left: `${String(current().x)}px`, top: `${String(current().y)}px` }}
            />
          </Portal>
        )}
      </Show>
    </>
  );
};
