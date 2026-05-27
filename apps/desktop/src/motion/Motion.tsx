/* <Motion.div initial={...} animate={...} exit={...} transition={...} /> —
   the proxy primitive. Use:

   ```tsx
   <Motion.div
     initial={{ opacity: 0, x: -300 }}
     animate={{ opacity: 1, x: 0 }}
     exit={{ opacity: 0, x: -300 }}
     transition={{ duration: 0.22, ease: defaultEase }}
   />
   ```

   Behaviour:
   - On mount: writes `initial` styles synchronously, then animates to
     `animate` on the next frame (so the browser doesn't skip frame 0).
   - When `animate` prop changes: animates from current to new.
   - On unmount inside <Presence>: animates to `exit` before allowing remove.
   - Without <Presence>: unmounts immediately.

   Cleanup cancels any in-flight WAAPI animations so a fast unmount doesn't
   leak running animations. */
import { Dynamic } from 'solid-js/web';
import { createEffect, onCleanup, onMount, splitProps, type Component, type JSX } from 'solid-js';
import type { ValueTransition } from 'motion-dom';
import {
  animateTarget,
  applyTarget,
  awaitAnimations,
  type MotionTarget,
} from './internals/driver.js';
import { registerExit, usePresence } from './Presence.jsx';

export type MotionProps = {
  initial?: MotionTarget | false;
  animate?: MotionTarget;
  exit?: MotionTarget;
  transition?: ValueTransition;
  ref?: (el: HTMLElement) => void;
  children?: JSX.Element;
  class?: string;
  classList?: Record<string, boolean | undefined>;
  style?: JSX.CSSProperties | string;
  onClick?: JSX.EventHandlerUnion<HTMLElement, MouseEvent>;
  [key: string]: unknown;
};

const OPTION_KEYS = ['initial', 'animate', 'exit', 'transition'] as const;

type MotionComponentProps = MotionProps & { tag: string };

const MotionComponent = (props: MotionComponentProps): JSX.Element => {
  const [opts, , pass] = splitProps(props, OPTION_KEYS, ['tag', 'ref'] as const);
  const presence = usePresence();

  let el: HTMLElement | undefined;
  const inflight: Set<Animation> = new Set();

  const fireAnimate = (target: MotionTarget): void => {
    if (el === undefined) return;
    cancelInflight();
    const animations = animateTarget(el, target, opts.transition);
    for (const a of animations) inflight.add(a);
  };

  const cancelInflight = (): void => {
    for (const a of inflight) a.cancel();
    inflight.clear();
  };

  onMount(() => {
    if (el === undefined) return;

    /* Apply initial synchronously so first paint matches. `initial: false`
       opts out (use current styles as the from-state). */
    if (opts.initial !== false && opts.initial !== undefined) {
      applyTarget(el, opts.initial);
    }

    /* Inside <Presence> with state.initial=false, skip the enter animation
       on first mount (matches solid-motionone semantics). */
    const skipEnter = presence?.initial === false;

    if (opts.animate !== undefined && !skipEnter) {
      /* Schedule on next frame so browser commits `initial` first. */
      requestAnimationFrame(() => {
        if (opts.animate !== undefined) fireAnimate(opts.animate);
      });
    } else if (opts.animate !== undefined && skipEnter) {
      applyTarget(el, opts.animate);
    }

    /* Register exit runner with <Presence> — called when this element is
       removed and we should animate before unmount. */
    if (presence !== undefined && opts.exit !== undefined) {
      registerExit(el, async () => {
        if (el === undefined) return;
        cancelInflight();
        const animations = animateTarget(el, opts.exit ?? {}, opts.transition);
        for (const a of animations) inflight.add(a);
        await awaitAnimations(animations);
      });
    }
  });

  /* Re-fire on animate-prop change. Skip the first run (handled by onMount
     to coordinate with initial). */
  let firstAnimateRun = true;
  createEffect(() => {
    const target = opts.animate;
    if (firstAnimateRun) {
      firstAnimateRun = false;
      return;
    }
    if (target !== undefined) fireAnimate(target);
  });

  onCleanup(cancelInflight);

  return (
    <Dynamic
      {...pass}
      component={props.tag}
      ref={(node: HTMLElement) => {
        el = node;
        props.ref?.(node);
      }}
    />
  );
};

/* Proxy: <Motion.div>, <Motion.button>, <Motion.section>, ... — any tag.
   Pattern lifted from solid-motionone (motion.tsx:85-89). We use a Proxy on
   an empty function so the typed wrapper has a callable identity for
   <Motion> (no tag), and any property access spawns a tagged variant.

   We enumerate the tags the app uses today as named properties so dot
   access type-checks under `noPropertyAccessFromIndexSignature`. Adding a
   new tag is one line — keep this list minimal, not exhaustive. */
type MotionTagComponent = Component<MotionProps>;

type MotionTags = {
  readonly div: MotionTagComponent;
  readonly aside: MotionTagComponent;
  readonly section: MotionTagComponent;
  readonly button: MotionTagComponent;
  readonly span: MotionTagComponent;
  readonly header: MotionTagComponent;
  readonly footer: MotionTagComponent;
  readonly nav: MotionTagComponent;
  readonly main: MotionTagComponent;
  readonly article: MotionTagComponent;
  readonly ul: MotionTagComponent;
  readonly li: MotionTagComponent;
};

type MotionProxy = ((props: MotionProps & { tag: string }) => JSX.Element) & MotionTags;

const proxyBase: (props: MotionProps & { tag: string }) => JSX.Element = (props) => (
  <MotionComponent {...props} />
);

// oxlint-disable-next-line typescript/no-unsafe-type-assertion
export const Motion = new Proxy(proxyBase, {
  get(_target, tag: string): MotionTagComponent {
    return (props: MotionProps): JSX.Element => <MotionComponent {...props} tag={tag} />;
  },
}) as MotionProxy;
