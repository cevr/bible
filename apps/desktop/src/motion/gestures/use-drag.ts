/* useDrag — Solid-native pointer drag.

   motion-dom has no vanilla drag (its DragOptions type lives there but the
   real implementation is a framer-motion Feature wired into VisualElement +
   ProjectionNode, too coupled to lift). This is a from-scratch impl on
   PointerEvent that handles the cases the app actually needs today:

   - axis lock ('x' | 'y' | true)
   - rectangular constraints with clamping
   - onDragStart / onDragEnd with cumulative offset
   - cleanup on element unmount or hot-reload

   Future: rubber-band elastic at the constraint edge (one mix() call), and
   inertia handoff via motion-dom's `inertia` generator on release. */
import { createSignal, onCleanup, type Accessor } from 'solid-js';

export type DragAxis = 'x' | 'y' | true;

export type DragConstraints = {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
};

export type DragInfo = {
  /** Cumulative displacement from drag start, in CSS pixels. */
  offset: { x: number; y: number };
  /** Pointer position at this event. */
  point: { x: number; y: number };
};

export type UseDragOptions = {
  /** Which axes are draggable. `true` enables both. Defaults to `true`. */
  axis?: DragAxis;
  /** Clamp the visual position. Values are in element-local coordinates
      (offset from drag-start). */
  constraints?: DragConstraints;
  onDragStart?: (info: DragInfo) => void;
  onDrag?: (info: DragInfo) => void;
  onDragEnd?: (info: DragInfo) => void;
  /** Skip drag entirely for non-primary mouse buttons (default true). */
  primaryPointerOnly?: boolean;
};

export type UseDragHandle = {
  /** Bind to an element's onPointerDown to start dragging. */
  onPointerDown: (e: PointerEvent) => void;
  /** Current cumulative offset since drag start (zero when not dragging). */
  offset: Accessor<{ x: number; y: number }>;
  /** True between pointerdown and pointerup/cancel. */
  isDragging: Accessor<boolean>;
};

const clamp = (v: number, min?: number, max?: number): number => {
  let out = v;
  if (min !== undefined && out < min) out = min;
  if (max !== undefined && out > max) out = max;
  return out;
};

export const useDrag = (opts: UseDragOptions = {}): UseDragHandle => {
  const [offset, setOffset] = createSignal({ x: 0, y: 0 });
  const [isDragging, setDragging] = createSignal(false);

  let startX = 0;
  let startY = 0;
  let pointerId: number | null = null;
  let captureTarget: Element | null = null;

  const axis = opts.axis ?? true;
  const primaryOnly = opts.primaryPointerOnly ?? true;

  const applyAxis = (dx: number, dy: number): { x: number; y: number } => {
    if (axis === 'x') return { x: dx, y: 0 };
    if (axis === 'y') return { x: 0, y: dy };
    return { x: dx, y: dy };
  };

  const applyConstraints = (raw: {
    x: number;
    y: number;
  }): {
    x: number;
    y: number;
  } => {
    const c = opts.constraints;
    if (c === undefined) return raw;
    return {
      x: clamp(raw.x, c.left, c.right),
      y: clamp(raw.y, c.top, c.bottom),
    };
  };

  const onMove = (e: PointerEvent): void => {
    if (e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const next = applyConstraints(applyAxis(dx, dy));
    setOffset(next);
    opts.onDrag?.({ offset: next, point: { x: e.clientX, y: e.clientY } });
  };

  const finish = (e: PointerEvent): void => {
    if (e.pointerId !== pointerId) return;
    const final = offset();
    if (captureTarget !== null) {
      captureTarget.releasePointerCapture(e.pointerId);
    }
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', finish);
    pointerId = null;
    captureTarget = null;
    setDragging(false);
    opts.onDragEnd?.({
      offset: final,
      point: { x: e.clientX, y: e.clientY },
    });
  };

  const onPointerDown = (e: PointerEvent): void => {
    if (primaryOnly && e.pointerType === 'mouse' && e.button !== 0) return;
    if (pointerId !== null) return; /* already dragging */
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    setOffset({ x: 0, y: 0 });
    setDragging(true);
    if (e.currentTarget instanceof Element) {
      captureTarget = e.currentTarget;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    opts.onDragStart?.({
      offset: { x: 0, y: 0 },
      point: { x: e.clientX, y: e.clientY },
    });
  };

  onCleanup(() => {
    if (pointerId !== null) {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    }
  });

  return { onPointerDown, offset, isDragging };
};
