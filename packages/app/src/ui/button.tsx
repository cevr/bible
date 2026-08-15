import type { JSX } from '@solidjs/web';
import { Option } from 'effect';
import { merge, omit } from 'solid-js';

export type ButtonProps = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'class'> & {
  readonly class?: string;
  readonly tone?: 'quiet' | 'accent';
};

interface ButtonDefaults {
  readonly type: 'button';
  readonly tone: 'quiet';
}

const buttonDefaults: ButtonDefaults = {
  type: 'button',
  tone: 'quiet',
};

export const Button = (input: ButtonProps) => {
  const props = merge(buttonDefaults, input);
  const attributes = omit(props, 'tone', 'class');
  const className = (): string =>
    Option.match(Option.fromNullishOr(props.class), {
      onNone: () => `bible-button bible-button--${props.tone}`,
      onSome: (extra) => `bible-button bible-button--${props.tone} ${extra}`,
    });
  return <button {...attributes} class={className()} />;
};
