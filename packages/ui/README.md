# @bible/ui

Base UI's unstyled parts, ported to Solid 2 (the `2.0.0-rc` line of `solid-js` and `@solidjs/web`). No part ships a style: each part shows its state as `data-*` attributes (and, where a value has to reach CSS, as CSS custom properties), and the consumer styles it through those attributes and its own `class`. Each part is imported from its subpath, for example `import { Menu } from '@bible/ui/menu'`; there is no root entry. The package keeps only the parts a page draws: a part upstream has and this list lacks returns with its first consumer, and the attribute names below are the styling contract (no `*DataAttributes` constants are exported). Unit tests run with `bun run test` and the browser tests with `bun run test:browser` (Playwright, `test/browser`), both from `packages/ui`.

Every part takes `class` and `style` (a value or a function of the part's state) and `render` (a function of the merged props and the state that replaces the default element). A part's state becomes attributes by one rule unless the part maps it otherwise: `true` becomes a bare `data-<key>` attribute (the key lowercased), another truthy value its string, and a falsy value nothing. Attributes named `data-base-ui-*`, `data-rootownerid`, `data-tabindex`, `data-type="inside"` and `data-type="outside"` (the focus guards) are internal markers, not styling hooks. Every `Portal` takes `inline`: with it its `<div>` renders where it is written instead of at the end of `<body>`, the same in the server's render and the browser's, so a popup open at the first render is in the server's markup (for a `position: fixed` popup under no transform, filter or `contain`); without it, a server render leaves the portal out.

## Parts

### Press

`@bible/ui/press` renders no element and sets no attributes. It holds `claimPress`, `liftHeldByOther`, `LONG_PRESS_DELAY` and `LONG_PRESS_MOVE_THRESHOLD`: one owner per press, shared with the context menu's long press. The parts read the text direction as `ltr`; upstream's `DirectionProvider`, `useRender` and the `mergeProps` subpath are left out.

### Menu

`import { Menu } from '@bible/ui/menu'`

- `Menu.Root`: no element; owns the menu's state (`onOpenChange`, `onOpenChangeComplete`). A menu is vertical and modal, wraps its arrow keys, and opens only from its trigger.
  - `Menu.Trigger`: `<button>` that opens the menu on press or with the arrow keys.
  - `Menu.Portal`: `<div>` at the end of `<body>`, rendered while the menu is mounted.
    - `Menu.Positioner`: `<div role="presentation">` that places the popup under the trigger (`sideOffset`, `align`), flipping above it or to the other alignment and shifting to stay in view.
      - `Menu.Popup`: `<div role="menu">`.
        - `Menu.Item`: `<div role="menuitem">` that runs an action and closes the menu (`label` for typeahead).
        - `Menu.Group`: `<div role="group">`.
          - `Menu.GroupLabel`: `<div aria-hidden>` that names the group.
        - `Menu.Separator`: `<div role="separator">`.

Upstream's hover opening, submenus, arrow (and `arrowPadding`), backdrop, link, checkbox and radio items, `defaultOpen`, `keepMounted`, `actionsRef` and `highlightItemOnHover` are left out, and so are the options no page passes: the root's `open`, `modal`, `disabled`, `loopFocus`, `orientation` and `onItemHighlighted`; the trigger's and item's `disabled` and `nativeButton`; the item's `closeOnClick`; the positioner's `side`, `alignOffset`, `anchor`, `positionMethod` and collision options; the popup's `finalFocus`; the separator's `orientation`. A part or an option returns with its first consumer.

| Member                | Attribute                                   | Present when                                                   |
| --------------------- | ------------------------------------------- | -------------------------------------------------------------- |
| `Trigger`             | `data-popup-open`, `data-pressed`           | the menu this trigger opened is open (both together)           |
| `Positioner`          | `data-open` / `data-closed`                 | the menu is open / closed                                      |
| `Positioner`, `Popup` | `data-side`                                 | always: `bottom`, or `top` after a collision flip              |
| `Positioner`, `Popup` | `data-align`                                | always: `start`, `center` or `end`                             |
| `Positioner`          | `data-anchor-hidden`                        | the anchor has scrolled out of view                            |
| `Positioner`, `Popup` | `data-instant`                              | transitions are skipped, with the reason: `click` or `dismiss` |
| `Popup`               | `data-open` / `data-closed`                 | the menu is open / closed                                      |
| `Popup`               | `data-starting-style` / `data-ending-style` | the enter transition's first frame / the exit transition       |
| `Item`                | `data-highlighted`                          | the item is under the keyboard or the pointer                  |

`Group`, `GroupLabel` and `Separator` set none.

Upstream's positioner CSS variables (`--anchor-width`, `--anchor-height`, `--available-width`, `--available-height` and `--transform-origin`) are left out: no stylesheet reads them. A variable returns with its first stylesheet reader.

### Context menu

`import { ContextMenu } from '@bible/ui/context-menu'`

- `ContextMenu.Root`: no element; a menu opened by a right click or by a touch held still for 500 ms (`LONG_PRESS_DELAY`; moving more than 10 px first cancels it). The lift of the touch that opened it is spent, so it never chooses the item that opened under the finger, and a press a drag has claimed (`@bible/ui/press`) opens nothing.
  - `ContextMenu.Trigger`: `<div>`, the area that opens the menu.
  - `ContextMenu.Portal > ContextMenu.Positioner > ContextMenu.Popup`, and every other member, are the menu's (`Item`, `Group`, `GroupLabel`, `Separator`); the positioner sits at the pointer, start-aligned and nudged so the first item is under it, and takes no `sideOffset` or `align`. The root's `disabled` is left out.

| Member    | Attribute                         | Present when                             |
| --------- | --------------------------------- | ---------------------------------------- |
| `Trigger` | `data-popup-open`, `data-pressed` | the context menu is open (both together) |

The other members set the menu's attributes and CSS variables (see Menu).

### Dialog

`import { Dialog } from '@bible/ui/dialog'`

- `Dialog.Root`: no element; owns the dialog's state. Its owner opens it through `open` (there is no trigger part); on close, focus returns to what had it before.
  - `Dialog.Portal`: `<div>` at the end of `<body>`, rendered while mounted.
    - `Dialog.Backdrop`: `<div role="presentation">`; a press on it closes its own dialog only.
    - `Dialog.Popup`: `<div role="dialog">`.
      - `Dialog.Title`: `<h2>` that labels the popup.
      - `Dialog.Description`: `<p>` that describes the popup.
      - `Dialog.Close`: `<button>` that closes the dialog.

Upstream's trigger, `Dialog.Viewport`, nested dialog stacks (`data-nested`, `data-nested-dialog-open`, `--nested-dialogs`, the backdrop's `forceRender`), `defaultOpen`, the portal's `keepMounted` and `actionsRef`, the `'trap-focus'` modal mode (`modal` is a boolean) and the popup's `initialFocus` and `finalFocus` are left out; a part or an option returns with its first consumer. Dialogs open side by side close one at a time, newest first.

| Member     | Attribute                                   | Present when                                             |
| ---------- | ------------------------------------------- | -------------------------------------------------------- |
| `Backdrop` | `data-open` / `data-closed`                 | the dialog is open / closed                              |
| `Backdrop` | `data-starting-style` / `data-ending-style` | the enter transition's first frame / the exit transition |
| `Popup`    | `data-open` / `data-closed`                 | the dialog is open / closed                              |
| `Popup`    | `data-starting-style` / `data-ending-style` | the enter transition's first frame / the exit transition |

`Close`, `Title` and `Description` set none.

### Drawer

`import { Drawer } from '@bible/ui/drawer'`

- `Drawer.Root`: no element; a dialog that slides in from an edge (`swipeDirection`, `down` by default) and swipes away.
  - `Drawer.Portal`: the dialog's portal `<div>`.
    - `Drawer.Viewport`: `<div role="presentation">` that carries the swipe.
      - `Drawer.Popup`: `<div role="dialog">` that takes focus on open, or gives it to what its `initialFocus` function returns (`false` for nothing).
        - `Drawer.Content`: `<div data-drawer-content>`, a region where a mouse press never starts a swipe.
        - `Drawer.Title`, `Drawer.Close`: the dialog's `<h2>` and `<button>`.

Upstream's swipe area, backdrop, description, snap points, nested drawer stacks (and a drawer's `data-nested` inside a dialog), `defaultOpen`, the provider's indent, the root's `onOpenChangeComplete` and the popup's `finalFocus` are left out; a part or an option returns with its first consumer.

A swipe released past half the popup (or flicked) calls `onOpenChange(false, details)` with the reason `swipe`. An owner that refuses it calls `details.cancel()`, and the sheet springs back. Otherwise the sheet holds its exit pose (`data-swipe-dismiss`, `data-ending-style`) until the owner closes the drawer, however many frames later. Upstream instead reads `open` still being true a frame later as a refusal. An owner that neither cancels nor closes leaves the sheet held in its exit pose, with no timeout. Every film owner closes.

| Member     | Attribute                                   | Present when                                                                          |
| ---------- | ------------------------------------------- | ------------------------------------------------------------------------------------- |
| `Viewport` | `data-open` / `data-closed`                 | the drawer is open / closed                                                           |
| `Viewport` | `data-starting-style` / `data-ending-style` | the enter transition's first frame / the exit transition                              |
| `Popup`    | `data-open` / `data-closed`                 | the drawer is open / closed                                                           |
| `Popup`    | `data-starting-style` / `data-ending-style` | the enter transition's first frame / the exit transition (also after a swipe dismiss) |
| `Popup`    | `data-swipe-direction`                      | always: the direction a swipe dismisses it (`up`, `down`, `left` or `right`)          |
| `Popup`    | `data-swiping`                              | the drawer is being swiped                                                            |
| `Popup`    | `data-swipe-dismiss`                        | the drawer is being dismissed by a swipe release                                      |

`Close`, `Content` and `Title` set none (`data-drawer-content` on `Content` is a fixed marker).

CSS variables on `Drawer.Popup`: `--drawer-swipe-movement-x`, `--drawer-swipe-movement-y` (the drag so far, while dragged). Upstream's `--drawer-swipe-strength` is left out: no stylesheet reads it.

### Toast

`import { Toast } from '@bible/ui/toast'`

- `Toast.Provider`: no element; owns the toasts, added and closed through a `Toast.createToastManager` made outside the tree and listed inside it with `Toast.useToastManager().toasts`.
  - `Toast.Portal`: `<div>` at the end of `<body>`.
    - `Toast.Viewport`: `<div role="region">` the stacked toasts live in.
      - `Toast.Root`: `<div role="dialog">`, one toast, labelled by its title.
        - `Toast.Content`: `<div>` around the toast's content.
          - `Toast.Title`: `<h2>`, rendered only when there is a title.
          - `Toast.Action`: `<button>`, rendered only when it has a label.
          - `Toast.Close`: `<button>` that closes the toast.

A manager has `add` and `close(id)`; an `add` with an existing `id` updates that toast in place and restarts its timer. A toast shows for its `timeout` (5000 ms unless it says, never at 0). Upstream's description, anchored toasts (`Toast.Positioner`, `Toast.Arrow`, `positionerProps`), `update` and `promise` are left out, and so are a toast's `priority` (and the urgent announcement of a high one), its `onClose` and the `loading` type, closing every toast, the provider's `timeout`, and `useToastManager`'s `add` and `close`; a part or option returns with its first consumer.

| Member                     | Attribute                                   | Present when                                                  |
| -------------------------- | ------------------------------------------- | ------------------------------------------------------------- |
| `Viewport`                 | `data-expanded`                             | the stack is expanded (hovered or focused)                    |
| `Root`                     | `data-expanded`                             | the stack is expanded                                         |
| `Root`                     | `data-limited`                              | the toast is past the provider's `limit` (it is also `inert`) |
| `Root`                     | `data-type`                                 | the toast has a `type`: its value                             |
| `Root`                     | `data-swiping`                              | the toast is being swiped                                     |
| `Root`                     | `data-swipe-direction`                      | a swipe has a direction: `up`, `down`, `left` or `right`      |
| `Root`                     | `data-starting-style` / `data-ending-style` | the enter transition's first frame / the exit transition      |
| `Content`                  | `data-expanded`                             | the stack is expanded                                         |
| `Content`                  | `data-behind`                               | the toast is behind the frontmost one                         |
| `Title`, `Action`, `Close` | `data-type`                                 | the toast has a `type`: its value                             |

CSS variables on `Toast.Root`: `--toast-swipe-movement-x`, `--toast-swipe-movement-y` (the swipe so far). Upstream's stack variables (`--toast-index`, `--toast-offset-y`, `--toast-height` and the viewport's `--toast-frontmost-height`) and the height measurement behind them are left out: the receipts are a flat column. `Toast.Close` is always exposed to assistive technology (upstream hides it while the stack is collapsed).

### Number field

`import { NumberField } from '@bible/ui/number-field'`

- `NumberField.Root`: `<div>`. Its owner holds `value` and hears only `onValueCommitted`: the field shows its own change (typed, stepped, scrubbed) from the change until its commit, then the owner's value again, so a value the owner declines goes back (upstream's hidden form input, `name`, `form` and `required` are left out).
  - `NumberField.ScrubArea`: `<span role="presentation">` dragged across horizontally to change the value, a step every 2 pixels (under pointer lock for a mouse, outside WebKit).
  - `NumberField.Input`: `<input>`, the text input; the arrow keys step it (Shift `largeStep`, Alt `smallStep`).

Upstream's stepper buttons, `Group`, `ScrubAreaCursor` and `allowWheelScrub` are left out, and so are the root's `defaultValue`, `onValueChange`, `id`, `readOnly`, `snapOnStep`, `allowOutOfRange` and `step: 'any'`, and the scrub area's `direction` and `pixelSensitivity`; a part or option returns with its first consumer.

Every member carries the same attributes:

| Member | Attribute        | Present when                |
| ------ | ---------------- | --------------------------- |
| all    | `data-disabled`  | the field is disabled       |
| all    | `data-scrubbing` | the value is being scrubbed |

The value and the input's text are not attributes. No CSS variables.

Two root props are not upstream's. `commitOnEnter` makes Enter commit typed text as blur does (reported as `keyboard`). `allowExpressions` keeps typed arithmetic as text and reads it on commit: `0.42*2`, `(1+2)/4`; text opening with `+`, `*` or `/` is relative to the value before typing began (`+0.1`, `*2`, `/2`), `×` and `÷` read as `*` and `/`, and a leading `-` is a negative number.

### Toggle

`import { Toggle } from '@bible/ui/toggle'`

- `Toggle`: `<button aria-pressed>`, a two-state button, pressed while its `value` is among its `ToggleGroup`'s; it joins the group's roving focus. It renders only inside a group.

Upstream's lone toggle (`pressed`, `defaultPressed`, `onPressedChange`) and `disabled` are left out; an option returns with its first consumer.

| Member   | Attribute      | Present when          |
| -------- | -------------- | --------------------- |
| `Toggle` | `data-pressed` | the toggle is pressed |

### Toggle group

`import { ToggleGroup } from '@bible/ui/toggle-group'`

- `ToggleGroup`: `<div role="group">`, one of its `Toggle`s pressed at a time. Its owner holds `value`; a press offers `onValueChange` the pressed toggle's value alone, or `[]` for the one already pressed. The left and right arrows (wrapping at the ends), Home and End move its one tab stop.
  - `Toggle`: see Toggle.

Upstream's uncontrolled mode (`defaultValue`), `multiple`, `disabled`, `orientation` and `loopFocus` are left out; an option returns with its first consumer. The group carries no attributes.

## Styling contract

The studio styles these parts through its tokens (`packages/film/src/player/tokens.css`), in rules that select on the `data-*` attributes above and on its own class names. The menus, dialogs, drawers and toasts are styled in `packages/film/src/lab/command/style.ts`; the toggle group (`.sh-seg`, its toggles' `data-pressed`) and the number field's input (`.lab-num`) in `packages/film/src/lab/page-shell-style.ts`. No part writes a colour, a size or a font family; the only inline styles a part sets are mechanics (position, `pointer-events`, `user-select`, `touch-action`, a transition turned off for a frame or during a drag, an opacity held at 0 until the first position, `will-change: transform` at a device pixel ratio of 1.5 or more) and the CSS variables listed above. A part that needs a visual state exposes it as a `data-*` attribute rather than styling it.
