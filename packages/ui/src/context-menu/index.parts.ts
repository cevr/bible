// Upstream: packages/react/src/context-menu/index.parts.ts
//
// The parts of a context menu: its own root, trigger and positioner, and the
// menu's other parts, used as `ContextMenu.Root`, `ContextMenu.Item` and so on.
export { ContextMenuRoot as Root } from './root/ContextMenuRoot.tsx';
export { ContextMenuTrigger as Trigger } from './trigger/ContextMenuTrigger.tsx';
export { ContextMenuPositioner as Positioner } from './positioner/ContextMenuPositioner.tsx';

export { MenuArrow as Arrow, MenuBackdrop as Backdrop } from '../menu/arrow/MenuArrow.tsx';
export {
  MenuCheckboxItem as CheckboxItem,
  MenuCheckboxItemIndicator as CheckboxItemIndicator,
} from '../menu/checkbox-item/MenuCheckboxItem.tsx';
export { MenuGroup as Group, MenuGroupLabel as GroupLabel } from '../menu/group/MenuGroup.tsx';
export { MenuItem as Item } from '../menu/item/MenuItem.tsx';
export { MenuLinkItem as LinkItem } from '../menu/link-item/MenuLinkItem.tsx';
export { MenuPopup as Popup } from '../menu/popup/MenuPopup.tsx';
export { MenuPortal as Portal } from '../menu/portal/MenuPortal.tsx';
export {
  MenuRadioGroup as RadioGroup,
  MenuRadioItem as RadioItem,
  MenuRadioItemIndicator as RadioItemIndicator,
} from '../menu/radio-group/MenuRadioGroup.tsx';
export {
  MenuSubmenuRoot as SubmenuRoot,
  MenuSubmenuTrigger as SubmenuTrigger,
} from '../menu/submenu-root/MenuSubmenuRoot.tsx';
export { Separator } from '../separator/Separator.tsx';
