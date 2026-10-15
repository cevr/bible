import { describe, expect, it } from 'bun:test';
import { createSignal, flush } from 'solid-js';

import type { BaseUIEvent, HTMLProps } from '../internals/types.ts';
import { mix, type Mixin, type RefFactory } from './mix.ts';

const read = (mixin: Mixin<HTMLElement>, key: string): unknown => (mixin as HTMLProps)[key];
const fire = (mixin: Mixin<HTMLElement>, key: string, event: Event) =>
  (read(mixin, key) as ((event: Event) => void) | undefined)?.(event);

describe('mix', () => {
  it('lets the rightmost attribute win and keeps every class and style', () => {
    const merged = mix(
      { title: 'left', class: 'left', style: { color: 'red', margin: '0' } },
      { title: 'middle', 'data-kept': 'yes' },
      { title: 'right', class: 'right', style: 'margin: 1px' },
    );
    expect(read(merged, 'title')).toBe('right');
    expect(read(merged, 'data-kept')).toBe('yes');
    expect(read(merged, 'class')).toEqual(['right', 'left']);
    expect(read(merged, 'style')).toEqual({ color: 'red', margin: '1px' });
  });

  it('runs every handler, rightmost first, each able to stop the ones to its left', () => {
    const order: Array<string> = [];
    const merged = mix(
      { onClick: () => order.push('left') },
      { onClick: () => order.push('middle') },
      { onClick: () => order.push('right') },
    );
    fire(merged, 'onClick', new Event('click'));
    expect(order).toEqual(['right', 'middle', 'left']);

    order.length = 0;
    const stopped = mix(
      { onClick: () => order.push('mixin') },
      {
        onClick: (event) => {
          order.push('caller');
          (event as unknown as BaseUIEvent<MouseEvent>).preventBaseUIHandler();
        },
      },
    );
    fire(stopped, 'onClick', new Event('click'));
    expect(order).toEqual(['caller']);
  });

  it("keeps a mixin's getters live through the merge", () => {
    const [on, setOn] = createSignal(false);
    const merged = mix(
      {
        get 'aria-checked'() {
          return on() ? 'true' : 'false';
        },
        get 'data-on'() {
          return on() ? '' : undefined;
        },
      },
      { id: 'switch' },
    );
    expect(read(merged, 'aria-checked')).toBe('false');
    expect(read(merged, 'data-on')).toBe(undefined);
    setOn(true);
    flush();
    expect(read(merged, 'aria-checked')).toBe('true');
    expect(read(merged, 'data-on')).toBe('');
  });

  it('leaves falsy entries out, so a mixin composes under a condition', () => {
    const shown = (on: boolean) => on && { title: 'dropped' };
    const merged = mix({ title: 'kept' }, false, null, undefined, shown(false));
    expect(read(merged, 'title')).toBe('kept');
    expect(Object.keys(merged)).toEqual(['title']);
  });

  it('calls every ref, an array of refs entry by entry', () => {
    const called: Array<string> = [];
    const ref =
      (name: string): RefFactory<HTMLElement> =>
      () =>
        called.push(name);
    const merged = mix({ ref: [ref('a'), undefined, ref('b')] }, { ref: ref('c') }, {});
    const el = {} as HTMLElement;
    (read(merged, 'ref') as RefFactory<HTMLElement>)(el);
    expect(called).toEqual(['a', 'b', 'c']);
  });

  it('types the props by the element (checked by `bun run typecheck`)', () => {
    const typed: Array<Mixin<HTMLElement> | Mixin<HTMLButtonElement>> = [
      // A `data-*` key in an object literal, a `style` string.
      { 'data-state': 'open', style: 'color: red' },
      // A button's own attributes on a button's mixin.
      mix<HTMLButtonElement>({ type: 'button' }, { ref: (el) => void el.form }),
      // @ts-expect-error a callback for an input cannot ref a div
      mix<HTMLDivElement>({ ref: (el: HTMLInputElement) => el.select() }),
      // @ts-expect-error `type` is not an attribute every element takes
      mix<HTMLDivElement>({ type: 'button' }),
    ];
    expect(typed).toHaveLength(4);
  });
});
