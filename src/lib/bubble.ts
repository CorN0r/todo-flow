export type BubbleColors = {
  from: string;
  via: string;
  to: string;
};

export const DEFAULT_BUBBLE_COLORS: BubbleColors = {
  from: '#818CF8',
  via: '#A855F7',
  to: '#EC4899',
};

export const BUBBLE_COLOR_PRESETS: { label: string; colors: BubbleColors }[] = [
  { label: '默认紫', colors: { from: '#818CF8', via: '#A855F7', to: '#EC4899' } },
  { label: '海洋蓝', colors: { from: '#38BDF8', via: '#3B82F6', to: '#6366F1' } },
  { label: '翡翠绿', colors: { from: '#34D399', via: '#10B981', to: '#059669' } },
  { label: '日落橙', colors: { from: '#FB923C', via: '#F97316', to: '#EF4444' } },
  { label: '樱花粉', colors: { from: '#F9A8D4', via: '#F472B6', to: '#EC4899' } },
];

export const MIN_BUBBLE_SIZE = 28;
export const MAX_BUBBLE_SIZE = 64;
export const DEFAULT_BUBBLE_SIZE = 48;
export const BUBBLE_SIZE_STEP = 2;

export const BUBBLE_SIZE_PRESETS: { label: string; size: number; hint: string }[] = [
  { label: '迷你', size: 32, hint: '适合低分辨率屏幕' },
  { label: '小', size: 40, hint: '紧凑不遮挡' },
  { label: '标准', size: 48, hint: '默认尺寸' },
  { label: '大', size: 56, hint: '更易点击' },
];

export function parseBubbleColors(raw: string | null): BubbleColors {
  if (!raw) return DEFAULT_BUBBLE_COLORS;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.from && parsed.via && parsed.to) {
      return parsed as BubbleColors;
    }
  } catch {
    // 解析失败时回退默认值
  }
  return DEFAULT_BUBBLE_COLORS;
}

export function clampBubbleSize(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_BUBBLE_SIZE;
  return Math.min(MAX_BUBBLE_SIZE, Math.max(MIN_BUBBLE_SIZE, Math.round(size)));
}

export function parseBubbleSize(raw: string | null): number {
  if (raw === null || raw.trim() === '') return DEFAULT_BUBBLE_SIZE;
  const parsed = Number(raw);
  return clampBubbleSize(parsed);
}

/**
 * 悬浮球所在透明窗口的逻辑边长：为 hover 放大动效 (scale 1.15) 预留边距，避免边缘被裁切。
 * 默认 48px 对应 60px 窗口，与原行为保持一致。
 */
export function getBubbleWindowSize(bubbleSize: number): number {
  const clamped = clampBubbleSize(bubbleSize);
  return Math.ceil((clamped * 1.25) / 2) * 2;
}

/**
 * 悬浮球内部计数文字字号，随球体尺寸与位数自适应缩放。
 */
export function getBubbleFontSize(bubbleSize: number, textLength = 1): number {
  const clamped = clampBubbleSize(bubbleSize);
  const base = Math.max(10, Math.round(clamped * 0.34));
  if (textLength >= 3) {
    return Math.max(9, Math.round(base * 0.8));
  }
  return base;
}
