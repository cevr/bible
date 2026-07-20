import type { JSX } from '@solidjs/web';
import { omit } from 'solid-js';

export type ScrollViewportProps = Omit<JSX.HTMLAttributes<HTMLElement>, 'class'> & {
  readonly class?: string;
  readonly label: string;
};

export const ScrollViewport = (props: ScrollViewportProps) => {
  const attributes = omit(props, 'label', 'class');
  const className = (): string => {
    if (props.class !== undefined) return `bible-scroll-viewport ${props.class}`;
    return 'bible-scroll-viewport';
  };
  return <section {...attributes} aria-label={props.label} class={className()} tabindex="0" />;
};
