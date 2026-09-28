// What the lab has selected: a cue or a knob of a scene. It is kept in the
// URL as `sel` (`&sel=cue:one:rise`), so the reload a write causes comes back
// to it; the editor and the motion tools both read it from the shell.

import { Option, Schema } from 'effect';

export const Selection = Schema.Struct({
  kind: Schema.Literals(['cue', 'knob']),
  scene: Schema.String,
  name: Schema.String,
});
export type Selection = typeof Selection.Type;

const isKind = Schema.is(Selection.fields.kind);

/** The selection a page's search (`?film=…&sel=cue:one:rise`) names, if it names one. */
export const selectionFromSearch = (search: string): Option.Option<Selection> =>
  Option.flatMap(Option.fromNullishOr(new URLSearchParams(search).get('sel')), (raw) => {
    const [kind = '', scene = '', ...rest] = raw.split(':');
    const name = rest.join(':');
    if (!isKind(kind) || scene === '' || name === '') return Option.none();
    return Option.some({ kind, scene, name });
  });

/** `search` with `sel` set to `selection`, or without it for none. */
export const searchWithSelection = (
  search: string,
  selection: Option.Option<Selection>,
): string => {
  const params = new URLSearchParams(search);
  Option.match(selection, {
    onNone: () => params.delete('sel'),
    onSome: (s) => params.set('sel', `${s.kind}:${s.scene}:${s.name}`),
  });
  return `?${params.toString()}`;
};

/** Whether `selection` is the cue `name` of `scene`. */
export const selectsCue = (selection: Option.Option<Selection>, scene: string, name: string) =>
  Option.exists(selection, (s) => s.kind === 'cue' && s.scene === scene && s.name === name);

/** Whether `selection` is the knob `name` of `scene`. */
export const selectsKnob = (selection: Option.Option<Selection>, scene: string, name: string) =>
  Option.exists(selection, (s) => s.kind === 'knob' && s.scene === scene && s.name === name);
