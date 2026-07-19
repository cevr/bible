import type { JSX } from '@solidjs/web';
import { omit } from 'solid-js';

export type ScrollViewportProps = Omit<JSX.HTMLAttributes<HTMLElement>, 'class'> & {
  readonly class?: string;
  readonly label: string;
};

export const ScrollViewport = (props: ScrollViewportProps) => {
  const attributes = omit(props, 'label', 'class');
  return (
    <section
      {...attributes}
      aria-label={props.label}
      class={`bible-scroll-viewport${props.class ? ` ${props.class}` : ''}`}
      tabindex="0"
    />
  );
};
