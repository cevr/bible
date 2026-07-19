import type { JSX } from '@solidjs/web';

export type InputProps = Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'class'> & {
  readonly class?: string;
};

export const Input = (props: InputProps) => (
  <input {...props} class={`bible-input${props.class ? ` ${props.class}` : ''}`} />
);
