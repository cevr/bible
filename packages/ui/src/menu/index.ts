// Upstream: packages/react/src/menu/index.ts
//
// The menu: `Menu.Root`, `Menu.Trigger`, `Menu.Portal`, `Menu.Positioner`,
// `Menu.Popup`, the items and groups. Prop and state types are not
// re-exported: nothing imports them, and a part's props are
// `ComponentProps<typeof Menu.Part>`.
export * as Menu from './index.parts.ts';
