import type { JSX } from '@solidjs/web';
import { Option } from 'effect';

export interface IconProps extends JSX.SvgSVGAttributes<SVGSVGElement> {
  readonly paths: readonly string[];
  readonly label?: string;
}

export const Icon = (props: IconProps) => {
  const hiddenWhenUnlabeled = (): Option.Option<'true'> => {
    if (Option.isSome(Option.fromNullishOr(props.label))) return Option.none();
    return Option.some('true');
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden={Option.getOrUndefined(hiddenWhenUnlabeled())}
      aria-label={props.label}
      class={props.class}
    >
      {props.paths.map((path) => (
        <path d={path} />
      ))}
    </svg>
  );
};

export const SearchIcon = (props: Omit<IconProps, 'paths'>) => (
  <Icon {...props} paths={['m21 21-4.34-4.34', 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Z']} />
);

export const MenuIcon = (props: Omit<IconProps, 'paths'>) => (
  <Icon {...props} paths={['M4 7h16', 'M4 12h16', 'M4 17h16']} />
);
