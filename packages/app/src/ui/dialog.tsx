import { Portal, Show, type JSX } from '@solidjs/web';
import { Effect, Option } from 'effect';
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
  readonly restoreFocus?: () => Option.Option<HTMLElement>;
}

export const Dialog = (props: DialogProps) => {
  const titleId = `dialog-title-${createUniqueId()}`;
  const descriptionId = `dialog-description-${createUniqueId()}`;
  const identity = Symbol('dialog');
  let popup = Option.none<HTMLDivElement>();
  const describedBy = () =>
    Option.getOrUndefined(Option.map(Option.fromNullishOr(props.description), () => descriptionId));

  createEffect(
    () => props.open,
    (open) => {
      if (!open) return;
      let previousFocus = Option.none<HTMLElement>();
      if (document.activeElement instanceof HTMLElement) {
        previousFocus = Option.some(document.activeElement);
      }
      const previousOverflow = document.body.style.overflow;
      dialogStack.push(identity);
      document.body.style.overflow = 'hidden';
      const focusFiber = Effect.runFork(
        Effect.andThen(
          Effect.yieldNow,
          Effect.sync(() => {
            if (Option.isNone(popup)) return;
            const panel = popup.value;
            const first = Option.fromNullishOr(panel.querySelector<HTMLElement>(focusableSelector));
            Option.getOrElse(first, () => panel).focus();
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
        const current = popup;
        if (event.key !== 'Tab' || Option.isNone(current)) return;
        const panel = current.value;
        const focusable = [...panel.querySelectorAll<HTMLElement>(focusableSelector)];
        const first = focusable[0] ?? panel;
        const last = focusable.at(-1) ?? panel;
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
              const returnTarget = Option.orElse(
                Option.flatMap(Option.fromNullishOr(props.restoreFocus), (restore) => restore()),
                () => previousFocus,
              );
              if (Option.isSome(returnTarget) && returnTarget.value.isConnected) {
                returnTarget.value.focus();
              }
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
              popup = Option.some(element);
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
