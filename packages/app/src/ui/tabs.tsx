import { For, Show, type JSX } from '@solidjs/web';
import { createSignal, createUniqueId } from 'solid-js';

export interface TabItem {
  readonly id: string;
  readonly label: string;
  readonly content: () => JSX.Element;
}

export interface TabsProps {
  readonly label: string;
  readonly items: readonly TabItem[];
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
}

export const Tabs = (props: TabsProps) => {
  const identity = createUniqueId();
  const [localValue, setLocalValue] = createSignal(props.defaultValue ?? props.items[0]?.id ?? '');
  const value = () => props.value ?? localValue();
  const select = (next: string): void => {
    if (props.value === undefined) setLocalValue(next);
    props.onValueChange?.(next);
  };
  const move = (current: string, offset: number): void => {
    const index = props.items.findIndex((item) => item.id === current);
    const next = props.items[(index + offset + props.items.length) % props.items.length];
    if (next === undefined) return;
    select(next.id);
    document.getElementById(`${identity}-tab-${next.id}`)?.focus();
  };

  return (
    <div class="bible-tabs">
      <div class="bible-tabs__list" role="tablist" aria-label={props.label}>
        <For each={props.items}>
          {(item, index) => (
            <button
              id={`${identity}-tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={value() === item.id ? 'true' : 'false'}
              aria-controls={`${identity}-panel-${item.id}`}
              tabindex={value() === item.id ? 0 : -1}
              onClick={() => select(item.id)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight') move(item.id, 1);
                else if (event.key === 'ArrowLeft') move(item.id, -1);
                else if (event.key === 'Home') move(item.id, -index());
                else if (event.key === 'End') move(item.id, props.items.length - index() - 1);
                else return;
                event.preventDefault();
              }}
            >
              {item.label}
            </button>
          )}
        </For>
      </div>
      <For each={props.items}>
        {(item) => (
          <Show when={value() === item.id}>
            <div
              id={`${identity}-panel-${item.id}`}
              class="bible-tabs__panel"
              role="tabpanel"
              aria-labelledby={`${identity}-tab-${item.id}`}
            >
              {item.content()}
            </div>
          </Show>
        )}
      </For>
    </div>
  );
};
