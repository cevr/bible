# `desktop/src/motion/` — Solid-native motion library

Internal library (not a workspace package). Drives every animation we ship today (drawer slide+width, library fade, settings sheet slide+drag-to-close, backdrop fade, theme swap, TOC stripe), plus runway for layout/reorder/drag.

Sources surveyed:

- `motion-dom` (vanilla) — `/Users/cvr/.cache/repo/motiondivision/motion/packages/motion-dom/src/`
- `framer-motion` (React) — `/Users/cvr/.cache/repo/motiondivision/motion/packages/framer-motion/src/`
- `solid-motionone` — `/Users/cvr/.cache/repo/solidjs-community/solid-motionone/src/`
- `solid-transition-group/src/index.ts`, `solid-flip/src/`, `blankeos/solid-layout-motion/` (demo, no lib).

Current usage to migrate: `packages/desktop/src/styles/reader.css:196,215-242,769,910-933` (CSS @keyframes fade-in / slide-in-left / slide-up + width transition) and `packages/desktop/src/app.tsx:85,329-341` (manual `sheetDragStartY` / threshold close).

## 1. Vanilla layer — what `motion-dom` already gives us

`motion-dom` is framework-free; we depend on it directly and Solid-bridge over it. Exports we use:

- `MotionValue<T>` + `motionValue()` — reactive scalar with `.get/.set/.jump`, `.on('change'|'animationStart'|...)`, velocity, dependent tracking. `motion-dom/src/value/index.ts:84-415`.
- `springValue` / `attachSpring` / `followValue` — derived MV that springs toward a source. `motion-dom/src/value/spring-value.ts:1-46`, `follow-value.ts`.
- `transform()` + `mix*()` — number/color/complex interpolators. `motion-dom/src/utils/{transform,mix}/`.
- Generators `spring`, `inertia`, `keyframes` — pure math, `{ next(t) → { value, done } }`. `motion-dom/src/animation/generators/`.
- Easings: `easeIn/Out/InOut`, `circ*`, `back*`, `anticipate`, `cubicBezier`, `steps`, modifiers. `motion-utils/src/easing/`.
- Engines: `animateSingleValue` (JS, via `JSAnimation`) and `startWaapiAnimation` (compiled generator → linear-easing → WAAPI). `motion-dom/src/animation/{animate/single-value.ts:1-22,waapi/start-waapi-animation.ts,JSAnimation.ts,NativeAnimation.ts}`. Strategy: WAAPI for transform/opacity/filter (`waapi/utils/accelerated-values.ts`), JS otherwise.
- Vanilla gestures: `hover()`, `press()` — `motion-dom/src/gestures/{hover.ts:35-,press/index.ts}`. Drag/pan in `motion-dom` are types-only; real impls live React-side in `framer-motion/src/gestures/{drag,pan}/` and are too coupled to `VisualElement`/`ProjectionNode` to lift.
- Scroll: `observeTimeline(update, ScrollTimeline)` — `motion-dom/src/scroll/observe.ts:1-21`, feature-detected via `utils/supports/scroll-timeline.ts`.
- Frameloop: `frame.{read,preUpdate,update,postUpdate,render}`, `microtask`, `time.now()` — `motion-dom/src/frameloop/`. RAF-batched, we use it directly.
- Reduced motion: `prefersReducedMotion` — `motion-dom/src/render/utils/reduced-motion.ts`.

What we **skip**: `VisualElement`, `projection/`, `render/`, `LayoutAnimationBuilder` — framer-motion's React-VDOM bridge. We replace with a Solid driver (§3). For FLIP we can still cherry-pick `projection/geometry/{delta-calc,delta-apply,measure}.ts`.

## 2. API surface for `desktop/src/motion/`

Organized so we ship the today-needs first. Files are sketches, not gospel.

```
motion/
  index.ts                — barrel
  value.ts                — useMotionValue, useTransform, useSpring (Solid bridges)
  animate.ts              — animate(target, kf, opts), animateValue(mv, kf, opts)
  Motion.tsx              — <Motion tag="div"> primitive (initial/animate/exit/transition/style)
  Presence.tsx            — <Presence mode="wait"|"sync"> + use_presence()
  transitions.ts          — re-export spring/tween/inertia + easing aliases
  reduced-motion.ts       — createReducedMotion() signal
  gestures/
    use-hover.ts          — wraps motion-dom hover()
    use-press.ts          — wraps motion-dom press()
    use-drag.ts           — Solid-native (motion-dom has no impl)
    use-tap.ts            — alias of use-press with click semantics
    use-in-view.ts        — IntersectionObserver → signal
  layout/
    measure.ts            — getBoundingClientRect + delta math (uses motion-dom geometry helpers)
    use-layout.ts         — FLIP per-element (layout / layoutId)
    LayoutGroup.tsx       — shared-layout context
  reorder/
    Reorder.tsx           — Reorder.Group + Reorder.Item (drag-to-sort)
  internals/
    raf.ts                — re-export motion-dom frame
    bridge.ts             — mv ↔ signal helpers
```

**Today (drive ALL current animations):** `value.ts`, `animate.ts`, `Motion.tsx`, `Presence.tsx`, `transitions.ts`, `reduced-motion.ts`, `gestures/use-drag.ts`.

**Longer tail:** `use-in-view`, `layout/`, `reorder/`, scroll-linked values.

Exports (concrete):

```ts
// value.ts
export function useMotionValue<T>(initial: T): MotionValue<T>;
export function useTransform<T, U>(
  source: MotionValue<T> | MotionValue<any>[],
  fn: (v: any) => U,
): MotionValue<U>;
export function useSpring(
  source: number | MotionValue<number>,
  opts?: SpringOptions,
): MotionValue<number>;

// animate.ts — thin wrapper over motion-dom animateSingleValue / startWaapiAnimation
export function animate(
  target: Element | Element[],
  kf: DOMKeyframes,
  opts?: AnimationOptions,
): Controls;
export function animateValue<T>(
  mv: MotionValue<T>,
  kf: T | T[],
  opts?: ValueAnimationTransition,
): Controls;

// Motion.tsx
export const Motion: MotionProxy; // <Motion.div initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }} transition={{ type: 'spring', stiffness: 380, damping: 36 }} />

// Presence.tsx
export const Presence: FlowComponent<{ initial?: boolean; mode?: 'sync' | 'wait' }>;
export function usePresence(): readonly [() => boolean, () => void]; // [isPresent, safeToRemove]

// gestures/use-drag.ts
export function useDrag(
  el: () => HTMLElement | undefined,
  opts: DragOptions,
): { x: MotionValue<number>; y: MotionValue<number>; isDragging: Accessor<boolean> };
```

## 3. Solid integration strategy

**MotionValue ↔ Signal.** MV already has `.on('change', cb)` (`motion-dom/src/value/index.ts:218`). Bridge:

```ts
export function mvSignal<T>(mv: MotionValue<T>): Accessor<T> {
  const [get, set] = createSignal(mv.get());
  onCleanup(mv.on('change', set));
  return get;
}
```

Signal → MV: `createEffect(() => mv.set(sig()))`. `useTransform` = `motionValue(fn(...))` plus a `createEffect` that subscribes to each source MV via `.on('change')` and `out.set(fn(...))`.

For per-frame style: read MVs in a `createRenderEffect` and write `el.style.transform` directly. Cheaper than going through Solid's JSX style merging, same pattern framer-motion uses to avoid re-rendering on tick.

**`<Motion>`.** `Dynamic` + `Proxy` — pattern proven in `solid-motionone/src/motion.tsx:54-62`.

```tsx
const MotionComponent = (props: MotionProps & { tag?: string }) => {
  let el!: HTMLElement;
  const driver = createMotionDriver(() => el, props, useContext(PresenceContext));
  onMount(driver.mount);
  onCleanup(driver.unmount);
  return <Dynamic component={props.tag ?? 'div'} ref={el} {...passthrough} />;
};
export const Motion = new Proxy(MotionComponent, {
  get: (_, tag: string) => (p: any) => <MotionComponent {...p} tag={tag} />,
});
```

`createMotionDriver` resolves `initial`/`animate`/`exit` into per-property MVs, picks WAAPI vs JS engine, and `createEffect`s on `props.animate` to re-fire `animate()`. No VDOM diffing — Solid hands us a stable element.

**`<Presence>`.** v1: wrap `@solid-primitives/transition-group`'s `createSwitchTransition` (`solid-motionone/src/presence.tsx:43-77`) — gives `mode: 'out-in' | 'parallel'` + `onExit(el, done)`. ~1KB, bulletproof. Hand-roll later only if we need `mode: 'popLayout'` (FLIP-aware exits, see `framer-motion/src/components/AnimatePresence/{index.tsx:60-110,PresenceChild.tsx,use-presence.ts}`).

**Reduced motion.** `createReducedMotion()` over `matchMedia(...)` as a signal; driver short-circuits to `.jump(target)`.

## 4. Gestures plan

- `useHover` / `usePress`: thin wrappers over `motion-dom`'s vanilla `hover()` / `press()` (`gestures/hover.ts:35-`, `gestures/press/index.ts`). `createEffect` on ref accessor → register → `onCleanup`. Expose `isHovered`/`isPressed` signals.
- `useDrag`: from scratch on `PointerEvent`. `motion-dom` has no vanilla drag; framer-motion's lives in `gestures/drag/` as a `Feature` coupled to `VisualElement`/`ProjectionNode`. Our impl:
  - `pointerdown` → `setPointerCapture`, record start, `isDragging.set(true)`.
  - `pointermove` → update `x`/`y` MVs (with `dragElastic` rubber-band via `mix(progress, [0, overflow], [0, overflow*0.5])`).
  - `pointerup` → if `dragMomentum`, hand off to `inertia` generator (`motion-dom/src/animation/generators/inertia.ts`) driving the same MV; snap via `dragConstraints`.
  - Return `{ x, y, isDragging, dragControls }`.
    Replaces `app.tsx:329-341` directly: settings sheet becomes `<Motion.div drag="y" dragConstraints={{ top: 0 }} onDragEnd={(_, i) => i.offset.y > 120 && close()} />`.
- `useInView`: `IntersectionObserver` → signal, `createEffect` on `() => ref()` to (re)observe.
- `useTap`: built on `press()` + movement-threshold filter (<5px).

## 5. Build order

1. **C1 — Core values + animate**: `internals/{raf,bridge}.ts`, `value.ts`, `animate.ts`, `transitions.ts`, `reduced-motion.ts`. Validate with a unit test (spring `MotionValue<number>` 0→100, observe `.on('change')`).
2. **C2 — `<Motion>` + `<Presence>`**: replace `reader.css` fade-in / slide-in-left / slide-up keyframes. Cut over library-pane fade and TOC slide. Delete `@keyframes` blocks (`reader.css:910-933`).
3. **C3 — `useDrag`**: replace settings-sheet drag in `app.tsx:329-341`. Highest-leverage gesture for the current app.
4. **C4 — `useHover` + `usePress`**: wraps `motion-dom`. Cheap; TOC stripe + library-card press states.
5. **C5 — `useInView` + scroll-linked MVs**: TOC active stripe driven by scroll, future reading-progress.
6. **C6 — `layout/` (FLIP)**: shared-layout for book-card → reader header. Last; current app has no layout animations to migrate.
7. **C7 — `reorder/`**: speculative; only when we add orderable bookmarks/notes.

Each commit compiles + passes gate. After C2 the app is fully motion-driven; C3 deletes bespoke drag math; C4-C7 is upside.

## Solid ecosystem verdict (why we're not just installing one)

- **`solid-motionone`** v1.0.4 (`solid-motionone/src/`): wraps the _old_ `@motionone/dom` v10, not the new `motion` package. Has `<Motion>`, `<Presence>` (`exitBeforeEnter` only — no `popLayout`), `initial`/`animate`/`exit`/`hover`/`press`/`inView`/`variants`/`transition`. No drag, layout, MotionValue/useTransform/useSpring, scroll. Strict subset of our needs. PR #20 adds the rest but is LLM-generated, unmerged, and 189KB.
- **`solid-transition-group`**: CSS-class enter/leave only. Useful as a `<Presence>` dep, not a replacement.
- **`solid-flip`** (`solid-flip/src/Flip.tsx:51-`): just FLIP. Active. Worth cribbing for `layout/`.
- **`solid-layout-motion`**: demo, not a library. **`motion-signals`**: thin `animate`/`timeline` wrapper, no components.

None cover MotionValue + drag + layout + presence simultaneously, and all target legacy `@motionone/dom`. Building on `motion-dom` directly + Solid bridges is smaller, more capable, and app-specific. Estimated cost: ~600 LOC for C1-C3 (today-set), ~1500 for C4-C7.
