// What a context menu opens on: the thing under the pointer. A card, a row,
// a cue, a note or a version says which thing it is by one attribute
// (`data-target`, its `Selection` as JSON, `targetAttr`), so a page's one
// context menu reads the thing from where the right-click or the long press
// landed (`targetAt`) and lists the commands about it; a press on nothing
// marked is about the page itself (`Page`). A command says which targets
// show it (`about`, `command.ts`). Pure.

import { Option, Predicate, Schema } from 'effect';
import { Selection, type SelectionTag } from './selection.ts';

/** What a context menu can be about: a kind of selection, or the page itself. */
export type Target = SelectionTag | 'Page';

/** Every target: what a command offered everywhere (Copy link, the command menu) is about. */
export const EVERYWHERE: ReadonlyArray<Target> = [
  ...Object.keys(Selection.cases).filter((tag): tag is SelectionTag => tag in Selection.cases),
  'Page',
];

const SelectionJson = Schema.fromJsonString(Selection);

/** The attribute a thing on the page carries to say which thing it is. */
const TARGET_ATTR = 'data-target';

/** `selection` as its thing's `data-target`. */
export const targetAttr = (selection: Selection): string =>
  Schema.encodeSync(SelectionJson)(selection);

/** The element-like a press lands on: its nearest marked ancestor, and that one's attribute. */
interface Markable {
  closest(selector: string): unknown;
}

const markable = (target: EventTarget): target is EventTarget & Markable => 'closest' in target;

/** The marked element's attribute, read off whatever `closest` answered. */
const attributeOf = (el: { readonly getAttribute: unknown }): Option.Option<unknown> =>
  Option.flatMap(Option.liftPredicate(el.getAttribute, Predicate.isFunction), (read) =>
    Option.fromNullishOr(Reflect.apply(read, el, [TARGET_ATTR])),
  );

/** The thing a press on `target` is about: the nearest marked ancestor's selection, if any. */
export const targetAt = (target: Option.Option<EventTarget>): Option.Option<Selection> =>
  Option.filter(target, markable).pipe(
    Option.map((el) => el.closest(`[${TARGET_ATTR}]`)),
    Option.filter(Predicate.hasProperty('getAttribute')),
    Option.flatMap(attributeOf),
    Option.flatMap(Schema.decodeUnknownOption(SelectionJson)),
  );

/** What a menu over `selection` (the thing it opened on, or none: the page) is about. */
export const targetOf = (selection: Option.Option<Selection>): Target =>
  Option.match(selection, { onNone: (): Target => 'Page', onSome: (s): Target => s._tag });
