import { type Component, type Setter } from 'solid-js';

interface HeaderSearchInputProps {
  readonly setSearchInputRef: Setter<HTMLInputElement | undefined>;
  readonly searchQuery: () => string;
  readonly setSearchQuery: (q: string) => void;
  readonly openSearch: () => void;
}

// EGW-mode header center slot. The input owns no state — the query signal +
// ref setter live in App so the search panel and overlay stack can both reach
// them; this component is just the visual + event binding.
export const HeaderSearchInput: Component<HeaderSearchInputProps> = (props) => (
  <input
    ref={props.setSearchInputRef}
    type="search"
    class="w-[min(420px,100%)] h-[calc(28px*var(--ui-scale))] px-3 rounded-md border border-rule bg-[color-mix(in_srgb,var(--color-bg)_70%,var(--color-fg)_4%)] text-fg text-ui-base outline-none transition-[border-color] duration-[0.12s] ease-in-out [-webkit-app-region:no-drag] focus:border-accent"
    placeholder="Search or refcode (⌘K)"
    spellcheck={false}
    autocomplete="off"
    value={props.searchQuery()}
    onInput={(e) => {
      props.setSearchQuery(e.currentTarget.value);
      props.openSearch();
    }}
    onFocus={props.openSearch}
  />
);
