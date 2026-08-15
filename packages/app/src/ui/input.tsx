import type { JSX } from '@solidjs/web';
import { Option } from 'effect';

export type InputProps = Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'class'> & {
  readonly class?: string;
};

export const Input = (props: InputProps) => {
  const className = (): string =>
    Option.match(Option.fromNullishOr(props.class), {
      onNone: () => 'bible-input',
      onSome: (extra) => `bible-input ${extra}`,
    });
  return <input {...props} class={className()} />;
};
