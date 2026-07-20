import type { JSX } from '@solidjs/web';

export type InputProps = Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'class'> & {
  readonly class?: string;
};

export const Input = (props: InputProps) => {
  const className = (): string => {
    if (props.class !== undefined) return `bible-input ${props.class}`;
    return 'bible-input';
  };
  return <input {...props} class={className()} />;
};
