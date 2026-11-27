import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BUBBLE_COLORS,
  DEFAULT_BUBBLE_SIZE,
  MAX_BUBBLE_SIZE,
  MIN_BUBBLE_SIZE,
  clampBubbleSize,
  getBubbleFontSize,
  getBubbleWindowSize,
  parseBubbleColors,
  parseBubbleSize,
} from '../../lib/bubble';

describe('bubble helpers', () => {
  it('clamps bubble size within valid bounds and falls back on invalid values', () => {
    expect(clampBubbleSize(10)).toBe(MIN_BUBBLE_SIZE);
    expect(clampBubbleSize(99)).toBe(MAX_BUBBLE_SIZE);
    expect(clampBubbleSize(39.6)).toBe(40);
    expect(clampBubbleSize(Number.NaN)).toBe(DEFAULT_BUBBLE_SIZE);
  });

  it('parses stored bubble size strings safely', () => {
    expect(parseBubbleSize(null)).toBe(DEFAULT_BUBBLE_SIZE);
    expect(parseBubbleSize('')).toBe(DEFAULT_BUBBLE_SIZE);
    expect(parseBubbleSize('bad')).toBe(DEFAULT_BUBBLE_SIZE);
    expect(parseBubbleSize('32')).toBe(32);
    expect(parseBubbleSize('16')).toBe(MIN_BUBBLE_SIZE);
    expect(parseBubbleSize('120')).toBe(MAX_BUBBLE_SIZE);
  });

  it('computes transparent window size with hover headroom', () => {
    expect(getBubbleWindowSize(48)).toBe(60);
    expect(getBubbleWindowSize(32)).toBe(40);
    expect(getBubbleWindowSize(28)).toBe(36);
    expect(getBubbleWindowSize(64)).toBe(80);
    // Always leaves enough room for 1.15x hover scale
    for (let s = MIN_BUBBLE_SIZE; s <= MAX_BUBBLE_SIZE; s += 2) {
      expect(getBubbleWindowSize(s)).toBeGreaterThanOrEqual(Math.ceil(s * 1.15));
    }
  });

  it('scales font size with bubble diameter and digit count', () => {
    expect(getBubbleFontSize(48, 1)).toBe(16);
    expect(getBubbleFontSize(32, 1)).toBe(11);
    expect(getBubbleFontSize(28, 1)).toBe(10);
    expect(getBubbleFontSize(32, 3)).toBeLessThan(getBubbleFontSize(32, 1));
  });

  it('parses bubble color JSON with fallback', () => {
    expect(parseBubbleColors(null)).toEqual(DEFAULT_BUBBLE_COLORS);
    expect(parseBubbleColors('invalid-json')).toEqual(DEFAULT_BUBBLE_COLORS);
    expect(parseBubbleColors('{"from":"#111","via":"#222","to":"#333"}')).toEqual({
      from: '#111',
      via: '#222',
      to: '#333',
    });
  });
});
