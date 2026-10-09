// Fixture for film/booleans-through-pressed in a file that names its own
// `Accessor` and `createMemo`: neither is solid's, so neither proves a
// boolean, and nothing here fires.

type Accessor<T> = () => T extends boolean ? string : never;
declare const createMemo: (fn: () => boolean) => () => string;

declare const on: Accessor<boolean>;
const shown = createMemo(() => 1 === 1);

export const Own = () => (
  <div>
    <i data-on={String(on())} />
    <i data-shown={String(shown())} />
  </div>
);
