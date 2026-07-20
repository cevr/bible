import { Portal, Show, type JSX } from '@solidjs/web';
import { Effect } from 'effect';
import { createEffect, createUniqueId } from 'solid-js';

const focusableSelector =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const dialogStack: Array<symbol> = [];

export interface DialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description?: string;
  readonly children: JSX.Element;
  readonly restoreFocus?: () => HTMLElement | undefined;
}

export const Dialog = (props: DialogProps) => {
  const titleId = `dialog-title-${createUniqueId()}`;
  const descriptionId = `dialog-description-${createUniqueId()}`;
  const identity = Symbol('dialog');
  let popup: HTMLDivElement | undefined;
  const describedBy = (): string | undefined => {
    if (props.description !== undefined) return descriptionId;
    return undefined;
  };

  createEffect(
    () => props.open,
    (open) => {
      if (!open || typeof document === 'undefined') return;
      let previousFocus: HTMLElement | undefined;
      if (document.activeElement instanceof HTMLElement) previousFocus = document.activeElement;
      const previousOverflow = document.body.style.overflow;
      dialogStack.push(identity);
      document.body.style.overflow = 'hidden';
      const focusFiber = Effect.runFork(
        Effect.andThen(
          Effect.yieldNow,
          Effect.sync(() => {
            const first = popup?.querySelector<HTMLElement>(focusableSelector);
            (first ?? popup)?.focus();
          }),
        ),
      );

      const onKeyDown = (event: KeyboardEvent): void => {
        if (dialogStack.at(-1) !== identity) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          props.onOpenChange(false);
          return;
        }
        if (event.key !== 'Tab' || popup === undefined) return;
        const focusable = [...popup.querySelectorAll<HTMLElement>(focusableSelector)];
        const first = focusable[0] ?? popup;
        const last = focusable.at(-1) ?? popup;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      };
      document.addEventListener('keydown', onKeyDown, true);
      return () => {
        document.removeEventListener('keydown', onKeyDown, true);
        const index = dialogStack.lastIndexOf(identity);
        if (index >= 0) dialogStack.splice(index, 1);
        document.body.style.overflow = previousOverflow;
        focusFiber.interruptUnsafe();
        Effect.runFork(
          Effect.andThen(
            Effect.yieldNow,
            Effect.sync(() => {
              const returnTarget = props.restoreFocus?.() ?? previousFocus;
              if (returnTarget?.isConnected) returnTarget.focus();
            }),
          ),
        );
      };
    },
  );

  return (
    <Show when={props.open}>
      <Portal>
        <div
          class="bible-dialog-backdrop"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) props.onOpenChange(false);
          }}
        >
          <div
            ref={(element) => {
              popup = element;
            }}
            class="bible-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={describedBy()}
            tabindex="-1"
          >
            <h2 id={titleId} class="bible-visually-hidden">
              {props.title}
            </h2>
            <Show when={props.description}>
              {(description) => (
                <p id={descriptionId} class="bible-visually-hidden">
                  {description()}
                </p>
              )}
            </Show>
            {props.children}
          </div>
        </div>
      </Portal>
    </Show>
  );
};
