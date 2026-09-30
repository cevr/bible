// The stand-in refuses what a real canvas refuses, so a draw that would throw
// in a render throws in a test too: a negative radius, a colour stop off 0..1.

import { describe, expect, test } from 'bun:test';
import { recorder } from './stand-in.ts';

describe('the stand-in context', () => {
  test('refuses a negative arc, ellipse or arcTo radius, as a canvas does', () => {
    const { ctx } = recorder();
    expect(() => ctx.arc(0, 0, -1, 0, Math.PI)).toThrow('IndexSizeError');
    expect(() => ctx.ellipse(0, 0, 4, -2, 0, 0, Math.PI)).toThrow('IndexSizeError');
    expect(() => ctx.arcTo(0, 0, 1, 1, -3)).toThrow('IndexSizeError');
    expect(() => ctx.arc(0, 0, 0, 0, Math.PI)).not.toThrow();
  });

  test('refuses a negative gradient radius and a colour stop off 0..1', () => {
    const { ctx } = recorder();
    expect(() => ctx.createRadialGradient(0, 0, -1, 0, 0, 4)).toThrow('IndexSizeError');
    const g = ctx.createLinearGradient(0, 0, 0, 10);
    expect(() => g.addColorStop(1.2, '#000')).toThrow('IndexSizeError');
    expect(() => g.addColorStop(1, '#000')).not.toThrow();
  });

  test('refuses a stop colour made of NaN or undefined, as addColorStop does', () => {
    const { ctx } = recorder();
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    expect(() => g.addColorStop(1, 'rgba(NaN, NaN, 48, 0)')).toThrow('SyntaxError');
    expect(() => g.addColorStop(0, '#NaNNaN30')).toThrow('SyntaxError');
    expect(() => g.addColorStop(0, 'undefined')).toThrow('SyntaxError');
    expect(() => g.addColorStop(0, 'rgba(230, 179, 71, 0)')).not.toThrow();
  });

  test('refuses a non-finite gradient coordinate, as a canvas does', () => {
    const { ctx } = recorder();
    expect(() => ctx.createLinearGradient(0, Number.NaN, 0, 10)).toThrow('TypeError');
    expect(() => ctx.createRadialGradient(0, 0, 0, Infinity, 0, 1)).toThrow('TypeError');
    expect(() => ctx.createLinearGradient(0, 0, 0, 10)).not.toThrow();
  });
});
