import type { JSX } from '@solidjs/web';
import { Option } from 'effect';
import { omit } from 'solid-js';

export type ScrollViewportProps = Omit<JSX.HTMLAttributes<HTMLElement>, 'class'> & {
  readonly class?: string;
  readonly label: string;
};

export const ScrollViewport = (props: ScrollViewportProps) => {
  const attributes = omit(props, 'label', 'class');
  const className = (): string =>
    Option.match(Option.fromNullishOr(props.class), {
      onNone: () => 'bible-scroll-viewport',
      onSome: (extra) => `bible-scroll-viewport ${extra}`,
    });
  return <section {...attributes} aria-label={props.label} class={className()} tabindex="0" />;
};
