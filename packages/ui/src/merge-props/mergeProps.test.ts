// Upstream: packages/react/src/merge-props/mergeProps.test.ts
//
// Ported without the React-only cases (synthetic events, `className`): the
// events here are DOM events and the class prop is Solid's `class`.
import { describe, expect, it, mock } from 'bun:test';
import { createSignal, flush } from 'solid-js';

import type { BaseUIEvent, HTMLProps } from '../internals/types.ts';
import { mergeProps, mergePropsN } from './mergeProps.ts';

type Handler = (...args: Array<unknown>) => unknown;
const call = (props: HTMLProps, key: string, ...args: Array<unknown>) =>
  (props[key] as Handler | undefined)?.(...args);
const click = () => new Event('click');

describe('mergeProps', () => {
  it('merges event handlers, rightmost first', () => {
    const order: Array<string> = [];
    const theirs = {
      onClick: mock(() => order.push('theirs')),
      onKeyDown: mock(() => undefined),
    };
    const ours = { onClick: mock(() => order.push('ours')), onPaste: mock(() => undefined) };
    const merged = mergeProps(ours, theirs);

    call(merged, 'onClick', click());
    call(merged, 'onKeyDown', new Event('keydown'));
    call(merged, 'onPaste', new Event('paste'));

    expect(order).toEqual(['theirs', 'ours']);
    expect(theirs.onKeyDown).toHaveBeenCalledTimes(1);
    expect(ours.onPaste).toHaveBeenCalledTimes(1);
  });

  it('merges multiple event handlers', () => {
    const log: Array<string> = [];
    const merged = mergeProps(
      { onClick: () => log.push('3') },
      { onClick: () => log.push('2') },
      { onClick: () => log.push('1') },
    );
    call(merged, 'onClick', click());
    expect(log).toEqual(['1', '2', '3']);
  });

  it('merges undefined event handlers', () => {
    const log: Array<string> = [];
    const merged = mergeProps(
      { onClick: () => log.push('3') },
      { onClick: undefined },
      { onClick: () => log.push('1') },
    );
    call(merged, 'onClick', click());
    expect(log).toEqual(['1', '3']);
  });

  it('makes a lone event handler preventable', () => {
    let prevented = false;
    const merged = mergeProps(
      {},
      {
        onMouseDown(event: BaseUIEvent<MouseEvent>) {
          event.preventBaseUIHandler();
          prevented = event.baseUIHandlerPrevented === true;
        },
      },
    );
    call(merged, 'onMouseDown', new Event('mousedown'));
    expect(prevented).toBe(true);
  });

  it('makes a first-position handler preventable in mergePropsN', () => {
    let prevented = false;
    const merged = mergePropsN([
      {
        onMouseDown(event: BaseUIEvent<MouseEvent>) {
          event.preventBaseUIHandler();
          prevented = event.baseUIHandlerPrevented === true;
        },
      },
      { id: 'test-button' },
    ]);
    call(merged, 'onMouseDown', new Event('mousedown'));
    expect(prevented).toBe(true);
  });

  it('merges styles, the rightmost winning', () => {
    const merged = mergeProps(
      { style: { color: 'blue', 'background-color': 'blue' } },
      { style: { color: 'red' } },
    );
    expect(merged['style']).toEqual({ color: 'red', 'background-color': 'blue' });
  });

  it('merges a style string into an object', () => {
    const merged = mergeProps({ style: 'color: blue; margin: 0' }, { style: { color: 'red' } });
    expect(merged['style']).toEqual({ color: 'red', margin: '0' });
  });

  it('keeps one style when the other is missing, none when both are', () => {
    expect(mergeProps({}, { style: { color: 'red' } })['style']).toEqual({ color: 'red' });
    expect(mergeProps({}, {})['style']).toBe(undefined);
  });

  it('merges classes with the rightmost first', () => {
    expect(mergeProps({ class: 'internal' }, { class: 'external' })['class']).toEqual([
      'external',
      'internal',
    ]);
    expect(mergeProps({ class: 'c1' }, { class: 'c2' }, { class: 'c3' })['class']).toEqual([
      'c3',
      ['c2', 'c1'],
    ]);
    expect(mergeProps({}, { class: 'external' })['class']).toBe('external');
    expect(mergeProps({}, {})['class']).toBe(undefined);
  });

  it('stops the handlers to the left once one calls preventBaseUIHandler()', () => {
    const log: Array<string> = [];
    const merged = mergeProps(
      { onClick: () => log.push('2') },
      {
        onClick(event: BaseUIEvent<MouseEvent>) {
          event.preventBaseUIHandler();
          log.push('1');
        },
      },
      { onClick: () => log.push('0') },
    );
    call(merged, 'onClick', click());
    expect(log).toEqual(['0', '1']);
  });

  it('runs merged non-event handlers in order and forwards every argument, of any type', () => {
    const log: Array<[string, ...unknown[]]> = [];
    const details = { reason: 'test' };
    const fn = () => 'value';
    const merged = mergeProps(
      { onOpenChange: (...args: unknown[]) => log.push(['ours', ...args]) },
      { onOpenChange: (...args: unknown[]) => log.push(['theirs', ...args]) },
    );
    call(merged, 'onOpenChange', true, details, 13, 'newValue', ['value'], fn);
    const args = [true, details, 13, 'newValue', ['value'], fn];
    expect(log).toEqual([
      ['theirs', ...args],
      ['ours', ...args],
    ]);
  });

  it('a source without the key does not shadow the one before it', () => {
    expect(mergeProps({ title: 'internal 2' }, { title: 'internal 1' }, {})['title']).toBe(
      'internal 1',
    );
  });

  it('lets an explicit undefined override', () => {
    expect(mergeProps({ title: 'x' }, { title: undefined })['title']).toBe(undefined);
  });

  it('calls every merged ref', () => {
    const seen: Array<string> = [];
    const merged = mergeProps(
      { ref: () => seen.push('a') },
      { ref: [() => seen.push('b'), () => seen.push('c')] },
    );
    call(merged, 'ref', null);
    expect(seen).toEqual(['a', 'b', 'c']);
  });

  it('enumerates the union of the sources keys', () => {
    expect(Object.keys(mergeProps({ id: 'a', role: 'menu' }, { role: 'menuitem' }))).toEqual([
      'id',
      'role',
    ]);
  });

  it('keeps a handler the same function across reads', () => {
    const merged = mergeProps({ onClick() {} }, { onClick() {} });
    expect(merged['onClick']).toBe(merged['onClick']);
  });

  it('stays live over a reactive source', () => {
    const [title, setTitle] = createSignal('first');
    const merged = mergeProps({
      get title() {
        return title();
      },
    });
    expect(merged['title']).toBe('first');
    setTitle('second');
    flush();
    expect(merged['title']).toBe('second');
  });

  describe('props getters', () => {
    it('calls the getter once with the props merged before it', () => {
      let observed: unknown;
      const getter = mock((props: HTMLProps) => {
        observed = { ...props };
        return props;
      });
      mergeProps({ id: '2', class: 'test-class' }, getter, { id: '1', role: 'button' });
      expect(getter).toHaveBeenCalledTimes(1);
      expect(observed).toEqual({ id: '2', class: 'test-class' });
    });

    it('calls the getter with merged props defined before it', () => {
      let observed: unknown;
      mergeProps({ role: 'button', class: 'test-class' }, { role: 'tab' }, (props) => {
        observed = { ...props };
        return props;
      });
      expect(observed).toEqual({ role: 'tab', class: 'test-class' });
    });

    it('calls the getter with nothing when it comes first', () => {
      let observed: unknown;
      mergeProps(
        (props) => {
          observed = { ...props };
          return props;
        },
        { id: '1' },
      );
      expect(observed).toEqual({});
    });

    it('does not mutate an object the getter returns', () => {
      const shared = { class: 'base' };
      const result = mergeProps(() => shared, { class: 'next' });
      expect({ ...result }).toEqual({ class: ['next', 'base'] });
      expect(shared).toEqual({ class: 'base' });
    });

    it('replaces the props before it with what it returns', () => {
      const result = mergeProps({ id: 'two', role: 'tab' }, { id: 'one' }, () => ({
        class: 'test-class',
      }));
      expect({ ...result }).toEqual({ class: 'test-class' });
    });

    it('does not stop handlers a getter handler calls by hand', () => {
      const log: Array<string> = [];
      const merged = mergeProps(
        { onClick: () => log.push('first') },
        (props) => ({
          onClick(event: BaseUIEvent<MouseEvent>) {
            event.preventBaseUIHandler();
            log.push('getter');
            call(props, 'onClick', click());
          },
        }),
        { onClick: () => log.push('last') },
      );
      call(merged, 'onClick', click());
      expect(log).toEqual(['last', 'getter', 'first']);
    });

    it('lets a getter handler check baseUIHandlerPrevented', () => {
      const log: Array<string> = [];
      const merged = mergeProps(
        { onClick: () => log.push('first') },
        (props) => ({
          onClick(event: BaseUIEvent<MouseEvent>) {
            event.preventBaseUIHandler();
            log.push('getter');
            if (!event.baseUIHandlerPrevented) {
              call(props, 'onClick', click());
            }
          },
        }),
        { onClick: () => log.push('last') },
      );
      call(merged, 'onClick', click());
      expect(log).toEqual(['last', 'getter']);
    });
  });
});
