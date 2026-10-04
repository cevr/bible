// Not in upstream: the arithmetic a number field reads when it allows expressions.
import { describe, expect, it } from 'bun:test';

import { evaluateExpression, isExpression } from './utils/expression.ts';

describe('isExpression', () => {
  it('tells arithmetic from one number', () => {
    expect(isExpression('0.42')).toBe(false);
    expect(isExpression('-0.42')).toBe(false);
    expect(isExpression('1,234.5')).toBe(false);
    expect(isExpression('0.42*2')).toBe(true);
    expect(isExpression('1-2')).toBe(true);
    expect(isExpression('(3)')).toBe(true);
    expect(isExpression('+0.1')).toBe(true);
    expect(isExpression('*2')).toBe(true);
    expect(isExpression('3×2')).toBe(true);
  });
});

describe('evaluateExpression', () => {
  it('reads + - * / and parentheses with the usual precedence', () => {
    expect(evaluateExpression('1+2*3', null)).toBe(7);
    expect(evaluateExpression('(1+2)*3', null)).toBe(9);
    expect(evaluateExpression('10/4', null)).toBe(2.5);
    expect(evaluateExpression('1.5 - 0.25', null)).toBe(1.25);
    expect(evaluateExpression('-2*-3', null)).toBe(6);
    expect(evaluateExpression('3×2÷4', null)).toBe(1.5);
  });

  it('applies a leading + * / to the value before editing', () => {
    expect(evaluateExpression('+0.1', 0.42)).toBe(0.52);
    expect(evaluateExpression('*2', 0.42)).toBe(0.84);
    expect(evaluateExpression('/2', 0.42)).toBe(0.21);
    expect(evaluateExpression('*2+1', 3)).toBe(7);
    expect(evaluateExpression('+-0.1', 0.42)).toBe(0.32);
  });

  it('keeps a leading minus a negative number, not a subtraction', () => {
    expect(evaluateExpression('-0.1', 0.42)).toBe(-0.1);
  });

  it('reads relative text without a base only where it still means a number', () => {
    expect(evaluateExpression('+5', null)).toBe(5);
    expect(evaluateExpression('*2', null)).toBeNull();
  });

  it('removes the float noise the arithmetic adds', () => {
    expect(evaluateExpression('0.1+0.2', null)).toBe(0.3);
  });

  it('reads each number in the locale and format', () => {
    expect(evaluateExpression('1,5+1', null, 'de-DE')).toBe(2.5);
    expect(evaluateExpression('50%+10%', null, 'en-US', { style: 'percent' })).toBe(0.6);
  });

  it('returns null for text that does not read', () => {
    expect(evaluateExpression('1+', null)).toBeNull();
    expect(evaluateExpression('(1+2', null)).toBeNull();
    expect(evaluateExpression('1)', null)).toBeNull();
    expect(evaluateExpression('1/0', null)).toBeNull();
    expect(evaluateExpression('', null)).toBeNull();
  });
});
