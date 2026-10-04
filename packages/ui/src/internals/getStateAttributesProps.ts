// Upstream: packages/react/src/internals/getStateAttributesProps.ts
//
// A part's state as `data-*` attributes: `true` becomes a bare attribute,
// another truthy value its string, a falsy one nothing; a mapping replaces
// the default for a key.

export type StateAttributesMapping<State> = {
  [Property in keyof State]?: (state: State[Property]) => Record<string, string> | null;
};

export function getStateAttributesProps<State extends object>(
  state: State,
  customMapping?: StateAttributesMapping<State>,
): Record<string, string> {
  const props: Record<string, string> = {};

  for (const key in state) {
    const value = state[key];

    if (customMapping && Object.hasOwn(customMapping, key)) {
      const custom = customMapping[key]?.(value);
      if (custom != null) {
        Object.assign(props, custom);
      }
      continue;
    }

    if (value === true) {
      props[`data-${key.toLowerCase()}`] = '';
    } else if (value) {
      props[`data-${key.toLowerCase()}`] = String(value);
    }
  }

  return props;
}
