import type { JSX } from '@solidjs/web';
import { createSignal } from 'solid-js';

export interface SplitPaneProps {
  readonly label: string;
  readonly primary: JSX.Element;
  readonly secondary: JSX.Element;
  readonly defaultSize?: number;
  readonly minimum?: number;
  readonly maximum?: number;
}

export const SplitPane = (props: SplitPaneProps) => {
  const minimum = () => props.minimum ?? 50;
  const maximum = () => props.maximum ?? 75;
  const [size, setSize] = createSignal(props.defaultSize ?? 62);
  let root: HTMLDivElement | undefined;
  const update = (next: number): void => {
    setSize(Math.min(maximum(), Math.max(minimum(), Math.round(next))));
  };

  return (
    <div
      ref={(element) => {
        root = element;
      }}
      class="bible-split-pane"
      style={{ '--bible-primary-pane': `${String(size())}%` }}
    >
      <div class="bible-split-pane__primary">{props.primary}</div>
      <div
        class="bible-split-pane__handle"
        role="separator"
        aria-label={props.label}
        aria-orientation="vertical"
        aria-valuemin={minimum()}
        aria-valuemax={maximum()}
        aria-valuenow={size()}
        tabindex="0"
        onKeyDown={(event) => {
          const step = event.shiftKey ? 10 : 2;
          if (event.key === 'ArrowLeft') update(size() - step);
          else if (event.key === 'ArrowRight') update(size() + step);
          else if (event.key === 'Home') update(minimum());
          else if (event.key === 'End') update(maximum());
          else return;
          event.preventDefault();
        }}
        onPointerDown={(event) => {
          const handle = event.currentTarget;
          handle.setPointerCapture(event.pointerId);
          const move = (moveEvent: PointerEvent): void => {
            const bounds = root?.getBoundingClientRect();
            if (bounds === undefined || bounds.width === 0) return;
            update(((moveEvent.clientX - bounds.left) / bounds.width) * 100);
          };
          const stop = (): void => {
            handle.removeEventListener('pointermove', move);
            handle.removeEventListener('pointerup', stop);
            handle.removeEventListener('pointercancel', stop);
          };
          handle.addEventListener('pointermove', move);
          handle.addEventListener('pointerup', stop);
          handle.addEventListener('pointercancel', stop);
        }}
      />
      <div class="bible-split-pane__secondary">{props.secondary}</div>
    </div>
  );
};
