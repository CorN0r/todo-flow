export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  scale: number;
}

export interface Position {
  x: number;
  y: number;
}

/**
 * 将窗口位置限制在屏幕工作区内，保持 margin 边距。
 * WidgetPage 与 PomodoroWidgetPage 共用。
 */
export function clampPosition(
  pos: Position,
  winW: number,
  winH: number,
  bounds: Bounds,
  margin = 8,
): Position {
  const { left, top, right, bottom } = bounds;
  let x = pos.x;
  let y = pos.y;
  if (x + winW > right) x = right - winW - margin;
  if (y + winH > bottom) y = bottom - winH - margin;
  if (x < left) x = left + margin;
  if (y < top) y = top + margin;
  return { x, y };
}

/**
 * 当窗口距某条屏幕边小于 threshold 时吸附到该边，随后用 clampPosition 保证不越界。
 */
export function snapPosition(
  pos: Position,
  winW: number,
  winH: number,
  bounds: Bounds,
  threshold = 30,
  margin = 8,
): Position {
  const { left, top, right, bottom } = bounds;
  let x = pos.x;
  let y = pos.y;
  const distL = Math.abs(x - left);
  const distR = Math.abs(right - (x + winW));
  const distT = Math.abs(y - top);
  const distB = Math.abs(bottom - (y + winH));
  const minD = Math.min(distL, distR, distT, distB);
  if (minD < threshold) {
    if (minD === distL) x = left + margin;
    else if (minD === distR) x = right - winW - margin;
    else if (minD === distT) y = top + margin;
    else if (minD === distB) y = bottom - winH - margin;
  }
  return clampPosition({ x, y }, winW, winH, bounds, margin);
}
