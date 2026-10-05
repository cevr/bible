// The input every command's `when` reads: a typed record of where the page
// is and what it holds, built from the page's URL (its `Places` place and
// the selection the URL names, `selection.ts`) and from the page's shell
// (what is selected that the URL does not hold, the lab's mode, where the
// keyboard's focus is, whether the film plays). VS Code's context keys,
// reshaped: one record the typecheck sees, read by plain predicates, not a
// string language. Pure.

import { Match, Option } from 'effect';
import type { PageName } from '../core/api.ts';
import type { Selection, SelectionTag } from './selection.ts';

/** The lab's modes, one at a time (the mode tray). */
type LabMode = 'edit' | 'note' | 'motion' | 'compare' | 'record';

/**
 * Where the keyboard's focus is: on the page; in a control that takes its
 * own keys (a field, a media element's controls, an open menu or dialog);
 * in the studio, which takes its own keys and passes the rest on; on a
 * slider (a wipe's grip), which takes its arrows, Home and End and passes
 * the rest on; or on a control (a button, a link), which hears the page's
 * keys but keeps Tab moving focus.
 */
export type Focus = 'page' | 'field' | 'studio' | 'slider' | 'control';

/** What a command's `when` reads. */
export interface Context {
  /** The page: its review, its lab, its player. */
  readonly page: PageName;
  /** The page's URL: its place, decoded through `Places` by what needs more. */
  readonly href: string;
  /** What is selected, first the one the URL cites; a multi-select is the whole list. */
  readonly selection: ReadonlyArray<Selection>;
  readonly mode: Option.Option<LabMode>;
  readonly focus: Focus;
  readonly playing: boolean;
}

/** A context with nothing selected, at `href` of `page`. */
export const contextAt = (page: PageName, href: string): Context => ({
  page,
  href,
  selection: [],
  mode: Option.none(),
  focus: 'page',
  playing: false,
});

/** The first thing selected, if it is a `tag`: what a command about one thing acts on. */
export const selected = <T extends SelectionTag>(
  ctx: Context,
  tag: T,
): Option.Option<Extract<Selection, { readonly _tag: T }>> =>
  Option.filter(
    Option.fromUndefinedOr(ctx.selection[0]),
    (s): s is Extract<Selection, { readonly _tag: T }> => s._tag === tag,
  );

/** Every selected thing that is a `tag`: what a batch acts on. */
export const selectedAll = <T extends SelectionTag>(
  ctx: Context,
  tag: T,
): ReadonlyArray<Extract<Selection, { readonly _tag: T }>> =>
  ctx.selection.filter((s): s is Extract<Selection, { readonly _tag: T }> => s._tag === tag);

/** `ctx` with `selection` selected instead: what a context menu opened on a thing reads. */
export const withSelection = (ctx: Context, selection: ReadonlyArray<Selection>): Context => ({
  ...ctx,
  selection,
});

/**
 * `ctx` with the thing the keyboard's focus is in (`focused`: a version's
 * card, a variant's row) selected first, unless the selection already holds
 * a thing of its kind: the URL's cue wins over a focused cue, but a focused
 * version joins the set the URL names. What a key press reads.
 */
export const withFocused = (ctx: Context, focused: Option.Option<Selection>): Context =>
  Option.match(
    Option.filter(focused, (f) => !ctx.selection.some((s) => s._tag === f._tag)),
    { onNone: () => ctx, onSome: (f) => withSelection(ctx, [f, ...ctx.selection]) },
  );

/** The element-like a press's target is: its tag, its editability, its nearest ancestor. */
interface Focusable {
  readonly tagName: string;
  readonly isContentEditable?: boolean;
  closest(selector: string): unknown;
}

const focusable = (target: EventTarget): target is EventTarget & Focusable =>
  'tagName' in target && 'closest' in target;

/** The elements that take their own keys: what is typed into, and media's own controls. */
const FIELDS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'AUDIO', 'VIDEO']);

/**
 * Open menus and dialogs: their own keys move through them and close them.
 * One closing (@bible/ui marks its exit `data-ending-style`, then
 * `data-closed`) holds no keys: the focus it still has goes back to the page
 * as it leaves, so a key pressed then is the page's.
 */
const OVERLAYS =
  ':is([role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]):not([data-ending-style], [data-closed])';

/** The studio's section: it takes its own keys while focus is in it (`lab/studio/section.tsx`). */
const STUDIO = '.lab-studio';

/** A slider that is no field (a wipe's grip): it takes its own arrows, Home and End while focused. */
const SLIDER = '[role="slider"]';

/** The controls focus stops on that take no typing: the page's keys reach them, but not Tab. */
const CONTROLS = new Set(['BUTTON', 'A', 'SUMMARY']);

const within = (el: Focusable, selector: string): boolean =>
  Option.isSome(Option.fromNullishOr(el.closest(selector)));

/** Where a press aimed at `target` puts the keyboard: in a field, in the studio, on a slider, on a control, or on the page. */
export const focusOf = (target: Option.Option<EventTarget>): Focus =>
  Option.match(Option.filter(target, focusable), {
    onNone: (): Focus => 'page',
    onSome: (el): Focus =>
      Match.value(el).pipe(
        Match.when(
          (e) => FIELDS.has(e.tagName) || e.isContentEditable === true || within(e, OVERLAYS),
          (): Focus => 'field',
        ),
        Match.when(
          (e) => within(e, STUDIO),
          (): Focus => 'studio',
        ),
        Match.when(
          (e) => within(e, SLIDER),
          (): Focus => 'slider',
        ),
        Match.when(
          (e) => CONTROLS.has(e.tagName),
          (): Focus => 'control',
        ),
        Match.orElse((): Focus => 'page'),
      ),
  });
