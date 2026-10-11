# @bible/ui

Base UI's unstyled parts, and React Aria's sheet (see Sheet), ported to Solid 2 (the `2.0.0-rc` line of `solid-js` and `@solidjs/web`). No part ships a style: each part shows its state as `data-*` attributes (and, where a value has to reach CSS, as CSS custom properties), and the consumer styles it through those attributes and its own `class`. Each part is imported from its subpath, for example `import { Menu } from '@bible/ui/menu'`; there is no root entry. The package keeps only the parts a page draws: a part upstream has and this list lacks returns with its first consumer, and the attribute names below are the styling contract (no `*DataAttributes` constants are exported). Unit tests run with `bun run test` and the browser tests with `bun run test:browser` (Playwright, `test/browser`), both from `packages/ui`.

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
        - `Menu.RadioGroup`: `<div role="group">` of radio items, one checked; its owner holds `value`, and a press on an item offers that item's value to `onValueChange`. A `Menu.GroupLabel` inside it names it.
          - `Menu.RadioItem`: `<div role="menuitemradio">`, `aria-checked` while its `value` is the group's (`label` for typeahead). It is an item as `Menu.Item` is, and keeps the menu open on a press unless `closeOnClick`.
            - `Menu.RadioItemIndicator`: `<span aria-hidden>`, rendered while its item is checked (always with `keepMounted`).
        - `Menu.Separator`: `<div role="separator">` (see Separator).

Upstream's hover opening, submenus, arrow (and `arrowPadding`), backdrop, link and checkbox items, `defaultOpen`, `keepMounted`, `actionsRef` and `highlightItemOnHover` are left out, and so are the options no page passes: the root's `open`, `modal`, `disabled`, `loopFocus`, `orientation` and `onItemHighlighted`; the trigger's and items' `disabled` and `nativeButton`; the plain item's `closeOnClick`; the radio group's `defaultValue` and `disabled`; the indicator's exit transition; the positioner's `side`, `alignOffset`, `anchor`, `positionMethod` and collision options; the popup's `finalFocus`. A part or an option returns with its first consumer.

| Member                            | Attribute                                   | Present when                                                   |
| --------------------------------- | ------------------------------------------- | -------------------------------------------------------------- |
| `Trigger`                         | `data-popup-open`, `data-pressed`           | the menu this trigger opened is open (both together)           |
| `Positioner`                      | `data-open` / `data-closed`                 | the menu is open / closed                                      |
| `Positioner`, `Popup`             | `data-side`                                 | always: `bottom`, or `top` after a collision flip              |
| `Positioner`, `Popup`             | `data-align`                                | always: `start`, `center` or `end`                             |
| `Positioner`                      | `data-anchor-hidden`                        | the anchor has scrolled out of view                            |
| `Positioner`, `Popup`             | `data-instant`                              | transitions are skipped, with the reason: `click` or `dismiss` |
| `Popup`                           | `data-open` / `data-closed`                 | the menu is open / closed                                      |
| `Popup`                           | `data-starting-style` / `data-ending-style` | the enter transition's first frame / the exit transition       |
| `Item`, `RadioItem`               | `data-highlighted`                          | the item is under the keyboard or the pointer                  |
| `RadioItem`, `RadioItemIndicator` | `data-checked` / `data-unchecked`           | the item's value is / is not the group's                       |

`Group`, `GroupLabel` and `RadioGroup` set none; `Separator` sets its own (see Separator).

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

### Sheet

`import { Sheet } from '@bible/ui/sheet'`

React Aria's Sheet (`react-aria-components` 1.22.1, with `useViewportSize` from `react-aria` 3.53.1), in place of Base UI's Drawer, which is left out: Copyright 2020-2026 Adobe, under the Apache License 2.0 in `src/sheet/LICENSE`. Each file names its upstream path and says what changed. It is built on the dialog above (its root, store, portal, title and close), as upstream's is built on its Modal and Dialog.

- `Sheet.Root`: no element; a dialog that rests on an edge (`position`: `bottom` by default, `top`, `left`, `right` or `center`) and is swiped away (`swipeDirection`: the position's by default, `vertical` for `center`; also `horizontal`). Its owner opens it through `open`; `onOpenChange(open, details)`, `onOpenChangeComplete(open)` (after it has scrolled in, and after it has scrolled out and unmounted), `modal` (`true` by default), `disablePointerDismissal`, `preventDismissal` and `snapPoints`.
  - `Sheet.Portal`: the dialog's portal `<div>`.
    - `Sheet.Overlay`: `<div>` over the viewport, clipped, that owns the sheet's motion and its keyboard variables.
      - `Sheet.Backdrop`: `<div role="presentation">`; a press on it is the sheet's outside press.
      - `Sheet.Popup`: the panel, a `<div>` inside two of the sheet's own (the scroll container and the stage); `swipeAnimation`, `swipeAnimationRange`, `stackAnimation`, `overscrollPadding`.
        - `Sheet.Content`: `<div role="dialog" data-sheet-content>` that fills the panel and takes focus once the sheet has scrolled in, or gives it to what its `initialFocus` function returns (`false` for nothing).
          - `Sheet.Title`, `Sheet.Description`, `Sheet.Close`: the dialog's `<h2>`, `<p>` and `<button>`.

A swipe is the browser's own scrolling. The panel sits in a scroll container two viewports long along the swipe axis (three when it leaves by either edge), with scroll snapping: resting open is scrolled in, gone is scrolled out, and each snap point (the amount of the panel showing: a number of pixels or a CSS length, a percentage of the panel) is a 1 px marker in the panel whose viewport-long `scroll-margin` rests it at the viewport's edge. Opening scrolls the sheet in smoothly (to its first snap point when it has some); focus moves in, and a modal sheet hides the page, only once it has (`data-entering` until then). Closing (Escape, an outside press, `Sheet.Close`, the owner) scrolls it out the way it leaves, and it unmounts once the scroll settles. Either scroll settles where it was sent, on its `scrollend`, or, taken over on the way (a page's own scroll into view, a focus, a swipe: one that may end with no `scrollend`, as with none at all in Safari before 26.2), once it has moved and then stood still for 5 frames and 300 ms; a page too busy to start the scroll at once is not taken for one that has settled. A page's scroll into view of something in a sheet still scrolling in stops the sheet where it is, and its snapping takes it on from there, out of view (a swipe) as like as not: a page waits for the sheet to stand. An IntersectionObserver watches the content: all of it showing is `data-expanded`, and once it has shown and then left the screen (the user scrolled it away) the sheet calls `onOpenChange(false, details)` with the reason `swipe`. An owner that cancels scrolls it back in; an owner that closes later (an address's Back) finds it still out of view. A sheet hidden with what holds it (`display: none` round an inline sheet) is not swiped away: it stays open, and rests again at once when it is laid out. A window resized under an open sheet (its container is the viewport's length) rests it again at once too, at its first snap point: the browser re-snaps a sheet at rest, but not one still scrolling in. A scroll inside the content scrolls the content first and chains to the sheet at its end, as the browser chains any scroll. `preventDismissal` turns down Escape, an outside press and a focus out, and clamps the scroll so the sheet stops at its first snap point (or a pixel short of fully open); its own `Close` and its owner still close it.

`swipeAnimation` (on the panel and the backdrop) names `@keyframes` authored from gone to open, which run along the sheet's view timeline (`--sheet-timeline-<stack index>`, on the content), limited by `swipeAnimationRange` to snap point indices. `stackAnimation` names `@keyframes` the panel runs for each sheet opened in front of it, along that sheet's timeline, composed one onto the next (`animation-composition: accumulate`); the timelines reach the sheets behind through a `timeline-scope` on `<html>`, which the sheets own while any is mounted. A browser without scroll-driven animations (Firefox today) plays `swipeAnimation` over 300 ms while the sheet scrolls in or out, does not run `stackAnimation`, and still opens, snaps, closes and is swiped away. `overscrollPadding` continues the panel a viewport past the edge it rests on, for the browser's bounce.

A sheet that is not modal (the lab's) stands fixed over a page that stays live: the overlay takes presses exactly over the panel's resting rect, and clips the sheet there. The browser scrolls only a container a press lands on, so the container cannot let presses through to the page around the panel. Nothing of the panel draws outside that rect, a `box-shadow` included: a clip grown to show one would take the page's presses under it, and a `filter: drop-shadow()` on an element round the sheet stops Chromium scrolling it by touch. A modal sheet stands on the page at its origin, over a page whose scroll is locked.

Upstream's `SheetTrigger`, `DismissButton`, the reveal held back until a software keyboard has opened, `usePreventScroll`'s iOS handling (the dialog's scroll lock stands in), `UNSTABLE_deferUntilEntered` (always on here), the render-prop children and right-to-left placement (`start` and `end`) are left out; a part or an option returns with its first consumer. A sheet open at the first render is in the server's markup scrolled out, and scrolls in once the browser has mounted it.

| Member                         | Attribute                                   | Present when                                                  |
| ------------------------------ | ------------------------------------------- | ------------------------------------------------------------- |
| `Overlay`, `Backdrop`, `Popup` | `data-position`                             | always: the edge it rests on                                  |
| `Overlay`, `Backdrop`, `Popup` | `data-swipe-direction`                      | always: the way a swipe dismisses it                          |
| `Overlay`, `Backdrop`, `Popup` | `data-stack-index`                          | always: its place among the mounted sheets, `0` for the first |
| `Overlay`, `Backdrop`, `Popup` | `data-has-descendants`                      | another sheet stands in front of it                           |
| `Overlay`, `Backdrop`, `Popup` | `data-expanded`                             | all of the content shows                                      |
| `Overlay`, `Backdrop`, `Popup` | `data-entering`                             | it is scrolling in                                            |
| `Overlay`, `Backdrop`, `Popup` | `data-exiting`                              | it is scrolling out, closed                                   |
| `Content`                      | `data-open` / `data-closed`                 | the sheet is open / closed                                    |
| `Content`                      | `data-starting-style` / `data-ending-style` | the first frame open / closed until it unmounts               |

`Close`, `Title` and `Description` set none (`data-sheet-content` on `Content` is a fixed marker).

CSS variables on `Sheet.Overlay`: `--visual-viewport-width` and `--visual-viewport-height` (the visual viewport, which a software keyboard shrinks; set once the browser has measured it), `--sheet-scroll-padding-x` and `--sheet-scroll-padding-y` (how much of the window the keyboard covers, or a page's scrollbar takes, the visual viewport's width being at most the page's: pad the content's end by it, or stand a sheet that is not modal off the scrollbar with it), `--page-width` and `--page-height` (a modal sheet's page size).

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

- `ToggleGroup`: `<div role="group">`, one of its `Toggle`s pressed at a time. Its owner holds `value`; a press offers `onValueChange` the pressed toggle's value alone, or `[]` for the one already pressed. The left and right arrows (wrapping at the ends), Home and End move its one tab stop, which starts on the toggle drawn pressed (`aria-pressed`; the first when none is pressed). A value changed from outside the group later (Back, a key) leaves the tab stop where it was.
  - A mouse press from outside the group takes no focus. Focus goes where the platform sends it for a press on content that takes none: to the group's nearest focusable ancestor (a sheet's or dialog's popup, so Tab and the keys stay in it), else off every control (`body`, so the page keeps its keys: Space, the arrows). Either way a field that had focus commits on its own blur, before the press's `onValueChange`, and the pressed toggle takes the tab stop. When focus is already in the group, the press moves it to the pressed toggle. Upstream focuses the toggle on every press.
  - `Toggle`: see Toggle.

Upstream's uncontrolled mode (`defaultValue`), `multiple`, `disabled`, `orientation` and `loopFocus` are left out; an option returns with its first consumer. The group carries no attributes.

### Separator

`import { Separator } from '@bible/ui/separator'`

- `Separator`: `<div role="separator">` between groups of items or controls, `aria-orientation` saying its `orientation` (`horizontal`, the default, or `vertical`). The menus' `Menu.Separator` is the same part.

| Member      | Attribute          | Present when                       |
| ----------- | ------------------ | ---------------------------------- |
| `Separator` | `data-orientation` | always: `horizontal` or `vertical` |

## Styling contract

The studio styles these parts through its tokens (`packages/film/src/player/tokens.css`), in rules that select on the `data-*` attributes above and on its own class names. The menus, dialogs, sheets and toasts are styled in `packages/film/src/lab/command/style.ts`; the toggle group (`.sh-seg`, its toggles' `data-pressed`) and the number field's input (`.lab-num`) in `packages/film/src/lab/page-shell-style.ts`. No part writes a colour, a size or a font family; the only inline styles a part sets are mechanics (position, `pointer-events`, `user-select`, `touch-action`, a transition turned off for a frame or during a drag, an opacity held at 0 until the first position, `will-change: transform` at a device pixel ratio of 1.5 or more; the sheet's overlay, scroll container, stage and snap markers, their clip, snapping and scroll-driven motion) and the CSS variables listed above. A part that needs a visual state exposes it as a `data-*` attribute rather than styling it.
