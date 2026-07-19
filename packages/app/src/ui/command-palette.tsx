import { For, Show } from '@solidjs/web';
import { createMemo, createSignal } from 'solid-js';

import { Dialog } from './dialog.js';
import { SearchIcon } from './icon.js';

export interface CommandItem {
  readonly id: string;
  readonly label: string;
  readonly keywords?: readonly string[];
  readonly shortcut?: string;
  readonly run: () => void;
}

export interface CommandPaletteProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly commands: readonly CommandItem[];
  readonly restoreFocus?: () => HTMLElement | undefined;
}

export const CommandPalette = (props: CommandPaletteProps) => {
  const [query, setQuery] = createSignal('');
  const [active, setActive] = createSignal(0);
  const commands = createMemo(() => {
    const needle = query().trim().toLocaleLowerCase();
    if (needle === '') return props.commands;
    return props.commands.filter((command) =>
      [command.label, ...(command.keywords ?? [])].join(' ').toLocaleLowerCase().includes(needle),
    );
  });
  const close = (): void => {
    props.onOpenChange(false);
    setQuery('');
    setActive(0);
  };
  const run = (command: CommandItem): void => {
    command.run();
    close();
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => (open ? props.onOpenChange(true) : close())}
      title="Command palette"
      description="Search the library and move to a reading surface"
      restoreFocus={props.restoreFocus}
    >
      <div class="bible-command">
        <label class="bible-command__input">
          <SearchIcon />
          <span class="bible-visually-hidden">Search commands</span>
          <input
            value={query()}
            placeholder="Where would you like to go?"
            autocomplete="off"
            onInput={(event) => {
              setQuery(event.currentTarget.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              const count = commands().length;
              if (count === 0) return;
              if (event.key === 'ArrowDown') setActive((active() + 1) % count);
              else if (event.key === 'ArrowUp') setActive((active() - 1 + count) % count);
              else if (event.key === 'Enter') {
                const command = commands()[active()];
                if (command !== undefined) run(command);
              } else return;
              event.preventDefault();
            }}
          />
        </label>
        <div class="bible-command__list" role="listbox" aria-label="Commands">
          <Show when={commands().length > 0} fallback={<p>No matching place in the library.</p>}>
            <For each={commands()}>
              {(command, index) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={active() === index() ? 'true' : 'false'}
                  onPointerMove={() => setActive(index())}
                  onClick={() => run(command)}
                >
                  <span>{command.label}</span>
                  <Show when={command.shortcut}>{(shortcut) => <kbd>{shortcut()}</kbd>}</Show>
                </button>
              )}
            </For>
          </Show>
        </div>
      </div>
    </Dialog>
  );
};
