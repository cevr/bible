# @bible/ui

Base UI's unstyled parts, ported to Solid 2 (the `2.0.0-rc` line of `solid-js` and `@solidjs/web`). No part ships a style: each part shows its state as `data-*` attributes (and, where a value has to reach CSS, as CSS custom properties), and the consumer styles it through those attributes and its own `class`. Each part is imported from its subpath, for example `import { Menu } from '@bible/ui/menu'`; the root entry `@bible/ui` re-exports every subpath except `press`. Unit tests run with `bun run test` and the browser tests with `bun run test:browser` (Playwright, `test/browser`), both from `packages/ui`.

Every part takes `class` and `style` (a value or a function of the part's state) and `render` (a function of the merged props and the state that replaces the default element). A part's state becomes attributes by one rule unless the part maps it otherwise: `true` becomes a bare `data-<key>` attribute (the key lowercased: `readOnly` is `data-readonly`), another truthy value its string, and a falsy value nothing. Attributes named `data-base-ui-*`, `data-rootownerid`, `data-tabindex`, `data-type="inside"` and `data-type="outside"` (the focus guards) are internal markers, not styling hooks. Every `Portal` takes `container` and `inline`: with `inline` its `<div>` renders where it is written instead of at the end of `<body>`, the same in the server's render and the browser's, so a popup open at the first render is in the server's markup (for a `position: fixed` popup under no transform, filter or `contain`); without it, a server render leaves the portal out.

## Parts

### Utilities

These subpaths render no element and set no attributes.

| Import                         | What it holds                                                                                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@bible/ui/merge-props`        | `mergeProps`, `mergePropsN`, `makeEventPreventable`: merge prop sets the way the parts do, kept reactive.                                                                |
| `@bible/ui/use-render`         | `useRender`: renders an element of your own component the parts' way (`render`, state as `data-*`, merged props).                                                        |
| `@bible/ui/direction-provider` | `DirectionProvider` and `useDirection`: the text direction (`ltr` or `rtl`) the parts' arrow keys follow.                                                                |
| `@bible/ui/press`              | `claimPress`, `liftHeldByOther`, `LONG_PRESS_DELAY`, `LONG_PRESS_MOVE_THRESHOLD`: one owner per press, shared with the context menu's long press. Not in the root entry. |

### Menu

`import { Menu } from '@bible/ui/menu'`

- `Menu.Root`: no element; owns the menu's state.
  - `Menu.Trigger`: `<button>` that opens the menu.
  - `Menu.Portal`: `<div>` at the end of `<body>` (or `container`), rendered while the menu is mounted or with `keepMounted`.
    - `Menu.Backdrop`: `<div role="presentation">` under the menu.
    - `Menu.Positioner`: `<div role="presentation">` that places the popup.
      - `Menu.Popup`: `<div role="menu">`.
        - `Menu.Arrow`: `<div aria-hidden>` pointing at the anchor.
        - `Menu.Item`: `<div role="menuitem">` that runs an action.
        - `Menu.LinkItem`: `<a>` that navigates.
        - `Menu.CheckboxItem`: `<div role="menuitemcheckbox">`.
          - `Menu.CheckboxItemIndicator`: `<span aria-hidden>`, mounted while checked or with `keepMounted`.
        - `Menu.RadioGroup`: `<div role="group">`.
          - `Menu.RadioItem`: `<div role="menuitemradio">`.
            - `Menu.RadioItemIndicator`: `<span aria-hidden>`, mounted while checked or with `keepMounted`.
        - `Menu.Group`: `<div role="group">`.
          - `Menu.GroupLabel`: `<div aria-hidden>` that names the group.
        - `Menu.Separator`: `<div role="separator">`.
        - `Menu.SubmenuRoot`: no element; a nested menu.
          - `Menu.SubmenuTrigger`: `<div role="menuitem">` that opens the submenu, followed by the submenu's own `Menu.Portal > Menu.Positioner > Menu.Popup`.

| Member                                                | Attribute                                   | Present when                                                                                     |
| ----------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `Trigger`                                             | `data-popup-open`, `data-pressed`           | the menu this trigger opened is open (both together)                                             |
| `Trigger`                                             | `data-disabled`                             | the trigger or the menu is disabled                                                              |
| `Backdrop`                                            | `data-open` / `data-closed`                 | the menu is open / closed                                                                        |
| `Backdrop`                                            | `data-starting-style` / `data-ending-style` | the enter transition's first frame / the exit transition                                         |
| `Positioner`                                          | `data-open` / `data-closed`                 | the menu is open / closed                                                                        |
| `Positioner`, `Popup`                                 | `data-side`                                 | always: `top`, `bottom`, `left`, `right`, `inline-start` or `inline-end` (after collision flips) |
| `Positioner`, `Popup`                                 | `data-align`                                | always: `start`, `center` or `end`                                                               |
| `Positioner`                                          | `data-anchor-hidden`                        | the anchor has scrolled out of view                                                              |
| `Positioner`, `Popup`                                 | `data-nested`                               | the menu is a submenu                                                                            |
| `Positioner`, `Popup`                                 | `data-instant`                              | transitions are skipped, with the reason: `click`, `dismiss` or `group`                          |
| `Popup`                                               | `data-open` / `data-closed`                 | the menu is open / closed                                                                        |
| `Popup`                                               | `data-starting-style` / `data-ending-style` | the enter transition's first frame / the exit transition                                         |
| `Arrow`                                               | `data-open` / `data-closed`                 | the menu is open / closed                                                                        |
| `Arrow`                                               | `data-side`, `data-align`                   | always, as on the positioner                                                                     |
| `Arrow`                                               | `data-uncentered`                           | the arrow cannot point at the anchor's center                                                    |
| `Item`, `CheckboxItem`, `RadioItem`, `SubmenuTrigger` | `data-highlighted`                          | the item is under the keyboard or the pointer                                                    |
| `LinkItem`                                            | `data-highlighted`                          | the link is under the keyboard or the pointer                                                    |
| `Item`, `CheckboxItem`, `RadioItem`, `SubmenuTrigger` | `data-disabled`                             | the item (or the menu, or for a radio item its group) is disabled                                |
| `CheckboxItem`, `RadioItem`                           | `data-checked` / `data-unchecked`           | the item is checked / unchecked                                                                  |
| `CheckboxItemIndicator`, `RadioItemIndicator`         | `data-checked` / `data-unchecked`           | the item is checked / unchecked                                                                  |
| `CheckboxItemIndicator`, `RadioItemIndicator`         | `data-highlighted`, `data-disabled`         | as on the item                                                                                   |
| `CheckboxItemIndicator`, `RadioItemIndicator`         | `data-starting-style` / `data-ending-style` | the indicator's enter frame on check / its exit transition on uncheck                            |
| `RadioGroup`                                          | `data-disabled`                             | the group is disabled                                                                            |
| `SubmenuTrigger`                                      | `data-popup-open`                           | its submenu is open (no `data-pressed`)                                                          |
| `Separator`                                           | `data-orientation`                          | always: `horizontal` unless `orientation` says otherwise                                         |

`Group` and `GroupLabel` set none.

CSS variables on `Menu.Positioner`: `--anchor-width`, `--anchor-height` (the anchor's size, snapped to device pixels), `--available-width`, `--available-height` (the room before the collision boundary; `100vw` and `100vh` until measured), `--transform-origin` (the anchor's side, for a scale from the anchor).

### Context menu

`import { ContextMenu } from '@bible/ui/context-menu'`

- `ContextMenu.Root`: no element; a menu opened by a right click or by a touch held still for 500 ms (`LONG_PRESS_DELAY`; moving more than 10 px first cancels it). The lift of the touch that opened it is spent, so it never chooses the item that opened under the finger, and a press a drag has claimed (`@bible/ui/press`) opens nothing.
  - `ContextMenu.Trigger`: `<div>`, the area that opens the menu.
  - `ContextMenu.Portal > ContextMenu.Positioner > ContextMenu.Popup`, and every other member, are the menu's (`Backdrop`, `Arrow`, `Item`, `LinkItem`, `CheckboxItem`, `CheckboxItemIndicator`, `RadioGroup`, `RadioItem`, `RadioItemIndicator`, `Group`, `GroupLabel`, `Separator`, `SubmenuRoot`, `SubmenuTrigger`); the root positioner sits at the pointer.

| Member    | Attribute                         | Present when                             |
| --------- | --------------------------------- | ---------------------------------------- |
| `Trigger` | `data-popup-open`, `data-pressed` | the context menu is open (both together) |

The other members set the menu's attributes and CSS variables (see Menu). The root menu is never `data-nested`; its submenus are.

### Dialog

`import { Dialog } from '@bible/ui/dialog'`

- `Dialog.Root`: no element; owns the dialog's state.
  - `Dialog.Trigger`: `<button>` that opens the dialog.
  - `Dialog.Portal`: `<div>` at the end of `<body>`, rendered while mounted or with `keepMounted`.
    - `Dialog.Backdrop`: `<div role="presentation">`; only the outermost dialog of a nested stack renders one, unless `forceRender`.
    - `Dialog.Viewport`: `<div role="presentation">`, a positioning (and scrolling) container around the popup.
      - `Dialog.Popup`: `<div role="dialog">`.
        - `Dialog.Title`: `<h2>` that labels the popup.
        - `Dialog.Description`: `<p>` that describes the popup.
        - `Dialog.Close`: `<button>` that closes the dialog.

| Member              | Attribute                                   | Present when                                             |
| ------------------- | ------------------------------------------- | -------------------------------------------------------- |
| `Trigger`           | `data-popup-open`                           | the dialog this trigger opened is open                   |
| `Trigger`           | `data-disabled`                             | the trigger is disabled                                  |
| `Backdrop`          | `data-open` / `data-closed`                 | the dialog is open / closed                              |
| `Backdrop`          | `data-starting-style` / `data-ending-style` | the enter transition's first frame / the exit transition |
| `Viewport`, `Popup` | `data-open` / `data-closed`                 | the dialog is open / closed                              |
| `Viewport`, `Popup` | `data-starting-style` / `data-ending-style` | the enter transition's first frame / the exit transition |
| `Viewport`, `Popup` | `data-nested`                               | the dialog is nested in another dialog                   |
| `Viewport`, `Popup` | `data-nested-dialog-open`                   | a dialog nested in this one is open                      |
| `Close`             | `data-disabled`                             | the button is disabled                                   |

`Title` and `Description` set none.

CSS variables on `Dialog.Popup`: `--nested-dialogs` (how many dialogs nested in it are open).

### Alert dialog

`import { AlertDialog } from '@bible/ui/alert-dialog'`

- `AlertDialog.Root`: no element; a dialog that is always modal and never closed by an outside press.
  - `AlertDialog.Trigger`, `AlertDialog.Portal > AlertDialog.Backdrop | AlertDialog.Viewport > AlertDialog.Popup > AlertDialog.Title | AlertDialog.Description | AlertDialog.Close` are the dialog's parts; the popup renders `<div role="alertdialog">`.

The attributes and CSS variables are the dialog's (see Dialog).

### Drawer

`import { Drawer } from '@bible/ui/drawer'`

- `Drawer.Provider`: no element; tracks the drawers open inside it for `Drawer.Indent`.
  - `Drawer.IndentBackground`: `<div>`, the layer behind the indented page.
  - `Drawer.Indent`: `<div>` around the page content that steps back while a drawer is open.
  - `Drawer.Root`: no element; a dialog that slides in from an edge (`swipeDirection`, `down` by default) and swipes away, settling at `snapPoints` when given (a vertical drawer's; a number up to 1 is a fraction of the viewport's height, a larger one pixels, a string `px` or `rem`; `snapPoint`, `defaultSnapPoint`, `onSnapPointChange`, `snapToSequentialPoints`).
    - `Drawer.Trigger`: the dialog's `<button>`.
    - `Drawer.SwipeArea`: `<div role="presentation" aria-hidden>`, an invisible strip that opens the drawer with a swipe.
    - `Drawer.Portal`: the dialog's portal `<div>`.
      - `Drawer.Backdrop`: `<div role="presentation">`; only the outermost drawer renders one, unless `forceRender`.
      - `Drawer.Viewport`: `<div role="presentation">` that carries the swipe.
        - `Drawer.Popup`: `<div role="dialog">`.
          - `Drawer.Content`: `<div data-drawer-content>`, a region where a mouse press never starts a swipe.
          - `Drawer.Title`, `Drawer.Description`, `Drawer.Close`: the dialog's `<h2>`, `<p>` and `<button>`.

| Member                       | Attribute                                   | Present when                                                                          |
| ---------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------- |
| `Trigger`                    | `data-popup-open`, `data-disabled`          | as on `Dialog.Trigger`                                                                |
| `SwipeArea`                  | `data-open` / `data-closed`                 | the drawer is open / closed                                                           |
| `SwipeArea`                  | `data-swipe-direction`                      | always: the direction that opens the drawer (`up`, `down`, `left` or `right`)         |
| `SwipeArea`                  | `data-swiping`                              | the swipe area is being swiped                                                        |
| `SwipeArea`                  | `data-disabled`                             | the swipe area is disabled                                                            |
| `Backdrop`                   | `data-open` / `data-closed`                 | the drawer is open / closed                                                           |
| `Backdrop`                   | `data-starting-style` / `data-ending-style` | the enter transition's first frame / the exit transition                              |
| `Backdrop`                   | `data-swiping`                              | the drawer is being swiped (open or shut)                                             |
| `Backdrop`, `Popup`          | `data-swipe-dismiss`                        | the drawer is being dismissed by a swipe release                                      |
| `Viewport`                   | `data-open` / `data-closed`                 | the drawer is open / closed                                                           |
| `Viewport`                   | `data-starting-style` / `data-ending-style` | the enter transition's first frame / the exit transition                              |
| `Viewport`                   | `data-nested`                               | the drawer is nested in another drawer or dialog (no `data-nested-dialog-open`)       |
| `Popup`                      | `data-open` / `data-closed`                 | the drawer is open / closed                                                           |
| `Popup`                      | `data-starting-style` / `data-ending-style` | the enter transition's first frame / the exit transition (also after a swipe dismiss) |
| `Popup`                      | `data-nested`                               | the drawer is nested in another drawer or dialog                                      |
| `Popup`                      | `data-expanded`                             | the active snap point is the full height (`1`)                                        |
| `Popup`                      | `data-nested-drawer-open`                   | a drawer nested in this one is open                                                   |
| `Popup`                      | `data-nested-drawer-swiping`                | a drawer nested in this one is being swiped                                           |
| `Popup`                      | `data-swipe-direction`                      | always: the direction a swipe dismisses it (`up`, `down`, `left` or `right`)          |
| `Popup`                      | `data-swiping`                              | the drawer is being swiped                                                            |
| `Close`                      | `data-disabled`                             | the button is disabled                                                                |
| `Indent`, `IndentBackground` | `data-active` / `data-inactive`             | a drawer in the provider is open / none is                                            |

`Content`, `Title` and `Description` set none (`data-drawer-content` on `Content` is a fixed marker).

CSS variables:

- `Drawer.Popup`: `--drawer-swipe-movement-x`, `--drawer-swipe-movement-y` (the drag so far, while dragged), `--drawer-snap-point-offset` (the active snap point's offset, negative for an upward drawer; `0px` without snap points), `--drawer-swipe-strength` (0.1 to 1, to shorten the exit after a hard flick; `1` otherwise), `--drawer-height` (the measured height, while a nested drawer is present or while closing), `--nested-drawers` (how many nested drawers are open), `--drawer-frontmost-height` (the height of the frontmost nested drawer, while one is open), `--drawer-swipe-progress` (a nested drawer's swipe progress, `0` at rest).
- `Drawer.Backdrop`: `--drawer-swipe-progress` (0 at rest, toward 1 as a swipe dismisses), `--drawer-height` (the frontmost drawer's height, during a swipe), `--drawer-swipe-strength`.
- `Drawer.Indent`: `--drawer-swipe-progress` and `--drawer-height`, following the frontmost drawer's swipe.

### Toast

`import { Toast } from '@bible/ui/toast'`

- `Toast.Provider`: no element; owns the toasts (with `Toast.useToastManager` inside and `Toast.createToastManager` outside the tree).
  - `Toast.Portal`: `<div>` at the end of `<body>`.
    - `Toast.Viewport`: `<div role="region">` the stacked toasts live in.
      - `Toast.Root`: `<div role="dialog">` (`alertdialog` for high priority), one toast.
        - `Toast.Content`: `<div>` around the toast's content.
          - `Toast.Title`: `<h2>`, rendered only when there is a title.
          - `Toast.Description`: `<p>`, rendered only when there is a description.
          - `Toast.Action`: `<button>`, rendered only when it has a label.
          - `Toast.Close`: `<button>` that closes the toast.
      - `Toast.Positioner`: `<div role="presentation">` around an anchored toast's `Toast.Root`, placing it against its anchor.
        - `Toast.Arrow`: `<div aria-hidden>` inside that `Toast.Root`, pointing at the anchor.

| Member                                    | Attribute                                   | Present when                                                  |
| ----------------------------------------- | ------------------------------------------- | ------------------------------------------------------------- |
| `Viewport`                                | `data-expanded`                             | the stack is expanded (hovered or focused)                    |
| `Root`                                    | `data-expanded`                             | the stack is expanded                                         |
| `Root`                                    | `data-limited`                              | the toast is past the provider's `limit` (it is also `inert`) |
| `Root`                                    | `data-type`                                 | the toast has a `type`: its value                             |
| `Root`                                    | `data-swiping`                              | the toast is being swiped                                     |
| `Root`                                    | `data-swipe-direction`                      | a swipe has a direction: `up`, `down`, `left` or `right`      |
| `Root`                                    | `data-starting-style` / `data-ending-style` | the enter transition's first frame / the exit transition      |
| `Content`                                 | `data-expanded`                             | the stack is expanded                                         |
| `Content`                                 | `data-behind`                               | the toast is behind the frontmost one                         |
| `Title`, `Description`, `Action`, `Close` | `data-type`                                 | the toast has a `type`: its value                             |
| `Positioner`                              | `data-side`, `data-align`                   | always (values as in Menu)                                    |
| `Positioner`                              | `data-anchor-hidden`                        | the anchor has scrolled out of view                           |
| `Arrow`                                   | `data-side`, `data-align`                   | always                                                        |
| `Arrow`                                   | `data-uncentered`                           | the arrow cannot point at the anchor's center                 |

CSS variables:

- `Toast.Viewport`: `--toast-frontmost-height` (the frontmost toast's height, once measured).
- `Toast.Root`: `--toast-index` (its place in the stack, 0 frontmost), `--toast-offset-y` (the summed heights in front of it), `--toast-height` (its measured height), `--toast-swipe-movement-x`, `--toast-swipe-movement-y` (the swipe so far).
- `Toast.Positioner`: `--toast-index`, and `--anchor-width`, `--anchor-height`, `--available-width`, `--available-height`, `--transform-origin` (as in Menu).

### Field

`import { Field } from '@bible/ui/field'`

- `Field.Root`: `<div>` grouping a control with its label, description and error.
  - `Field.Label`: `<label>` pointing at the field's control.
  - `Field.Description`: `<p>` that describes the control.
  - `Field.Error`: `<div>`, rendered while the field is invalid and not disabled (or always, with `match`).

| Member                                  | Attribute       | Present when                 |
| --------------------------------------- | --------------- | ---------------------------- |
| `Root`, `Label`, `Description`, `Error` | `data-disabled` | the field is disabled        |
| `Root`, `Label`, `Description`, `Error` | `data-invalid`  | the root's `invalid` is true |

The port has no validity state of its own, so `data-valid` is never set; nor are upstream's `data-touched`, `data-dirty`, `data-filled` or `data-focused`.

`NumberField` is the control a field ties up: inside `Field.Root` its input is named by `Field.Label`, described by `Field.Description` and a shown `Field.Error`, and `aria-invalid` while the field is `invalid`; it is disabled with the field, and submits under the root's `name` when it names none. The number field's own parts never carry `data-invalid`.

### Number field

`import { NumberField } from '@bible/ui/number-field'`

- `NumberField.Root`: `<div>` that owns the value (with a visually hidden `<input type="number">` for forms).
  - `NumberField.ScrubArea`: `<span role="presentation">` dragged across to change the value.
    - `NumberField.ScrubAreaCursor`: `<span role="presentation">`, portalled to the body, standing in for the hidden cursor during a pointer-locked mouse scrub.
  - `NumberField.Group`: `<div role="group">`.
    - `NumberField.Decrement`: `<button>` that decreases the value (held, it repeats).
    - `NumberField.Input`: `<input>`, the text input.
    - `NumberField.Increment`: `<button>` that increases the value.

Every member carries the same attributes:

| Member | Attribute        | Present when                                                                                                 |
| ------ | ---------------- | ------------------------------------------------------------------------------------------------------------ |
| all    | `data-disabled`  | the field is disabled; on `Increment` and `Decrement` also at `max` / `min`, or when that button is disabled |
| all    | `data-readonly`  | the field is read-only                                                                                       |
| all    | `data-required`  | the field is required                                                                                        |
| all    | `data-scrubbing` | the value is being scrubbed                                                                                  |

The value and the input's text are not attributes. No CSS variables.

Two root props are not upstream's. `commitOnEnter` makes Enter commit typed text as blur does (reported as `keyboard`; a form still submits). `allowExpressions` keeps typed arithmetic as text and reads it on commit: `0.42*2`, `(1+2)/4`; text opening with `+`, `*` or `/` is relative to the value before typing began (`+0.1`, `*2`, `/2`), `×` and `÷` read as `*` and `/`, and a leading `-` is a negative number.

### Toggle

`import { Toggle } from '@bible/ui/toggle'`

- `Toggle`: `<button aria-pressed>`, a two-state button; inside a `ToggleGroup` or `Toolbar` it joins their roving focus.

| Member   | Attribute       | Present when           |
| -------- | --------------- | ---------------------- |
| `Toggle` | `data-pressed`  | the toggle is pressed  |
| `Toggle` | `data-disabled` | the toggle is disabled |

### Toggle group

`import { ToggleGroup } from '@bible/ui/toggle-group'`

- `ToggleGroup`: `<div role="group">` sharing a pressed state among the `Toggle`s inside it.
  - `Toggle`: see Toggle.

| Member        | Attribute          | Present when                                             |
| ------------- | ------------------ | -------------------------------------------------------- |
| `ToggleGroup` | `data-disabled`    | the group is disabled                                    |
| `ToggleGroup` | `data-multiple`    | several toggles can be pressed at once (`multiple`)      |
| `ToggleGroup` | `data-orientation` | always: `horizontal` unless `orientation` says otherwise |

### Toolbar

`import { Toolbar } from '@bible/ui/toolbar'`

- `Toolbar.Root`: `<div role="toolbar">` with one tab stop.
  - `Toolbar.Group`: `<div role="group">`; disabling it disables its items.
    - `Toolbar.Button`: `<button>` (render a menu trigger through `render`; arrow keys in that menu's popup stay in the menu).
    - `Toolbar.Link`: `<a>`.
    - `Toolbar.Input`: `<input>`.
  - `Toolbar.Separator`: `<div role="separator">`, perpendicular to the toolbar by default.

| Member                                     | Attribute          | Present when                                                                    |
| ------------------------------------------ | ------------------ | ------------------------------------------------------------------------------- |
| `Root`, `Group`, `Button`, `Link`, `Input` | `data-orientation` | always: the toolbar's orientation (`horizontal` by default)                     |
| `Root`, `Group`, `Button`, `Input`         | `data-disabled`    | the toolbar, the group or the item is disabled                                  |
| `Button`, `Input`                          | `data-focusable`   | the item stays focusable when disabled (`focusableWhenDisabled`, on by default) |
| `Separator`                                | `data-orientation` | always: `vertical` in a horizontal toolbar, `horizontal` in a vertical one      |

### Tabs

`import { Tabs } from '@bible/ui/tabs'`

- `Tabs.Root`: `<div>` that owns the selected value.
  - `Tabs.List`: `<div role="tablist">` with one tab stop.
    - `Tabs.Tab`: `<button role="tab">`.
    - `Tabs.Indicator`: `<span role="presentation">` marking the active tab; nothing while no tab is selected.
  - `Tabs.Panel`: `<div role="tabpanel">`, mounted while its tab is active (or with `keepMounted`).

| Member                                      | Attribute                                   | Present when                                                                                             |
| ------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `Root`, `List`, `Tab`, `Indicator`, `Panel` | `data-orientation`                          | always: `horizontal` unless `orientation` says otherwise                                                 |
| `Root`, `List`, `Tab`, `Indicator`, `Panel` | `data-activation-direction`                 | always: where the active tab sits relative to the previous one (`left`, `right`, `up`, `down` or `none`) |
| `Tab`                                       | `data-active`                               | the tab is selected                                                                                      |
| `Tab`                                       | `data-disabled`                             | the tab is disabled                                                                                      |
| `Panel`                                     | `data-hidden`                               | the panel's tab is not active                                                                            |
| `Panel`                                     | `data-starting-style` / `data-ending-style` | the panel's enter frame / its exit transition                                                            |
| `Panel`                                     | `data-index`                                | always: the panel's index among the panels                                                               |

CSS variables on `Tabs.Indicator`: `--active-tab-left`, `--active-tab-right`, `--active-tab-top`, `--active-tab-bottom`, `--active-tab-width`, `--active-tab-height` (the active tab's box in px, relative to the list's padding box).

## Styling contract

The studio styles these parts through its tokens (`packages/film/src/player/tokens.css`), in rules (`packages/film/src/lab/command/style.ts`) that select on the `data-*` attributes above and on its own class names. No part writes a colour, a size or a font family; the only inline styles a part sets are mechanics (position, `pointer-events`, `user-select`, `touch-action`, a transition turned off for a frame or during a drag, an opacity held at 0 until the first position, `will-change: transform` at a device pixel ratio of 1.5 or more) and the CSS variables listed above. A part that needs a visual state exposes it as a `data-*` attribute rather than styling it.
