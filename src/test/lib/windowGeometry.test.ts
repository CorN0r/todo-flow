import { describe, it, expect } from 'vitest';
import { clampPosition, snapPosition, type Bounds, type Position } from '../../lib/windowGeometry';

const SCREEN: Bounds = { left: 0, top: 0, right: 1920, bottom: 1080, scale: 1 };

function scaledScreen(scale: number): Bounds {
  return {
    left: 0,
    top: 0,
    right: 1920 / scale,
    bottom: 1080 / scale,
    scale,
  };
}

describe('window geometry', () => {
  describe('clampPosition', () => {
    it('keeps a window fully inside the screen', () => {
      const pos: Position = { x: 100, y: 100 };
      expect(clampPosition(pos, 300, 420, SCREEN)).toEqual(pos);
    });

    it('clamps a window exceeding the right edge', () => {
      const pos: Position = { x: 1800, y: 100 };
      expect(clampPosition(pos, 300, 420, SCREEN)).toEqual({ x: 1920 - 300 - 8, y: 100 });
    });

    it('clamps a window exceeding the bottom edge', () => {
      const pos: Position = { x: 100, y: 900 };
      expect(clampPosition(pos, 300, 420, SCREEN)).toEqual({ x: 100, y: 1080 - 420 - 8 });
    });

    it('clamps a window exceeding the top-left corner', () => {
      const pos: Position = { x: -50, y: -30 };
      expect(clampPosition(pos, 300, 420, SCREEN)).toEqual({ x: 8, y: 8 });
    });

    it('handles scaled monitors by using logical bounds', () => {
      const bounds = scaledScreen(1.5);
      const pos: Position = { x: bounds.right - 10, y: bounds.bottom - 10 };
      expect(clampPosition(pos, 60, 60, bounds)).toEqual({
        x: bounds.right - 60 - 8,
        y: bounds.bottom - 60 - 8,
      });
    });
  });

  describe('snapPosition', () => {
    it('snaps to the left edge within threshold', () => {
      const pos: Position = { x: 25, y: 100 };
      expect(snapPosition(pos, 60, 60, SCREEN)).toEqual({ x: 8, y: 100 });
    });

    it('snaps to the right edge within threshold', () => {
      const pos: Position = { x: SCREEN.right - 60 - 25, y: 100 };
      expect(snapPosition(pos, 60, 60, SCREEN)).toEqual({ x: SCREEN.right - 60 - 8, y: 100 });
    });

    it('snaps to the top edge within threshold', () => {
      const pos: Position = { x: 100, y: 25 };
      expect(snapPosition(pos, 60, 60, SCREEN)).toEqual({ x: 100, y: 8 });
    });

    it('snaps to the bottom edge within threshold', () => {
      const pos: Position = { x: 100, y: SCREEN.bottom - 60 - 25 };
      expect(snapPosition(pos, 60, 60, SCREEN)).toEqual({ x: 100, y: SCREEN.bottom - 60 - 8 });
    });

    it('does not snap when distance exceeds threshold', () => {
      const pos: Position = { x: 100, y: 100 };
      expect(snapPosition(pos, 60, 60, SCREEN)).toEqual(pos);
    });

    it('falls back to clamping when snapped position would leave the screen', () => {
      const pos: Position = { x: SCREEN.right - 10, y: SCREEN.bottom - 10 };
      const result = snapPosition(pos, 60, 60, SCREEN);
      expect(result.x).toBeLessThanOrEqual(SCREEN.right - 60 - 8);
      expect(result.y).toBeLessThanOrEqual(SCREEN.bottom - 60 - 8);
    });

    it('applies the same threshold and margin values used in production', () => {
      // WidgetPage / PomodoroWidgetPage 使用 threshold=30, margin=8
      const pos: Position = { x: SCREEN.right - 60 - 29, y: 200 };
      expect(snapPosition(pos, 60, 60, SCREEN, 30, 8)).toEqual({
        x: SCREEN.right - 60 - 8,
        y: 200,
      });
    });
  });
});
