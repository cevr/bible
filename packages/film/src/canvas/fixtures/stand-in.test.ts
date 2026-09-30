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

describe('the stand-in holds the state a canvas holds', () => {
  test("starts with a canvas's defaults", () => {
    const { ctx } = recorder();
    expect(ctx.shadowBlur).toBe(0);
    expect(ctx.shadowOffsetX).toBe(0);
    expect(ctx.shadowOffsetY).toBe(0);
    expect(ctx.shadowColor).toBe('rgba(0, 0, 0, 0)');
    expect(ctx.font).toBe('10px sans-serif');
    expect(ctx.lineWidth).toBe(1);
  });

  test('restore puts back every property set since the save, the shadow and font among them', () => {
    const { ctx } = recorder();
    ctx.lineWidth = 3;
    ctx.save();
    ctx.shadowBlur = 5;
    ctx.shadowColor = 'rgba(40, 28, 16, 0.2)';
    ctx.font = '40px serif';
    ctx.lineWidth = 7;
    ctx.restore();
    expect(ctx.shadowBlur).toBe(0);
    expect(ctx.shadowColor).toBe('rgba(0, 0, 0, 0)');
    expect(ctx.font).toBe('10px sans-serif');
    expect(ctx.lineWidth).toBe(3);
  });

  test('keeps the alpha a canvas keeps: one past 0..1 or not a number is ignored', () => {
    const { ctx } = recorder();
    ctx.globalAlpha = 0.5;
    ctx.globalAlpha = 1.2;
    ctx.globalAlpha = -1;
    ctx.globalAlpha = Number.NaN;
    expect(ctx.globalAlpha).toBe(0.5);
  });

  test('takes a matrix, or nothing for the identity, as setTransform does', () => {
    const r = recorder();
    r.ctx.translate(10, 20);
    r.ctx.scale(2, 2);
    const m = r.ctx.getTransform();
    r.ctx.resetTransform();
    r.ctx.setTransform(m);
    expect(r.now()).toEqual([2, 0, 0, 2, 10, 20]);
    r.ctx.setTransform({ e: 4 });
    expect(r.now()).toEqual([1, 0, 0, 1, 4, 0]);
    r.ctx.setTransform();
    expect(r.now()).toEqual([1, 0, 0, 1, 0, 0]);
  });

  test('reads back the colour of the last fill over the pixel, as getImageData does', () => {
    const { ctx } = recorder(8, 8);
    expect([...ctx.getImageData(0, 0, 1, 1).data]).toEqual([0, 0, 0, 0]);
    ctx.fillStyle = '#c86';
    ctx.fillRect(0, 0, 8, 8);
    expect([...ctx.getImageData(0, 0, 1, 1).data]).toEqual([0xcc, 0x88, 0x66, 255]);
    ctx.fillStyle = '#10203080';
    ctx.fillRect(0, 0, 8, 8);
    expect(ctx.getImageData(0, 0, 1, 1).data[3]).toBe(0x80);
    ctx.fillStyle = '#102030';
    ctx.globalAlpha = 0.5;
    ctx.fillRect(0, 0, 8, 8);
    expect(ctx.getImageData(0, 0, 1, 1).data[3]).toBe(128);
    expect([...ctx.getImageData(20, 20, 1, 1).data]).toEqual([0, 0, 0, 0]);
  });
});
