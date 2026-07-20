import type { JSX } from '@solidjs/web';
import { merge, omit } from 'solid-js';

export type ButtonProps = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'class'> & {
  readonly class?: string;
  readonly tone?: 'quiet' | 'accent';
};

export const Button = (input: ButtonProps) => {
  const props = merge({ type: 'button' as const, tone: 'quiet' as const }, input);
  const attributes = omit(props, 'tone', 'class');
  const className = (): string => {
    if (props.class !== undefined) {
      return `bible-button bible-button--${props.tone} ${props.class}`;
    }
    return `bible-button bible-button--${props.tone}`;
  };
  return <button {...attributes} class={className()} />;
};
