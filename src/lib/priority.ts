export const priorityColors: Record<number, string> = {
  0: 'text-[#9CA3AF]',
  1: 'text-[#3B82F6]',
  2: 'text-[#F59E0B]',
  3: 'text-[#F97316]',
  4: 'text-[#EF4444]',
};

export const PRIORITY_HEX: Record<number, string> = {
  0: '#9CA3AF',
  1: '#3B82F6',
  2: '#F59E0B',
  3: '#F97316',
  4: '#EF4444',
};

export const priorityLabels: Record<number, string> = {
  0: '无优先级', 1: '低', 2: '中', 3: '高', 4: '紧急',
};

export function hexToRgba(hex: string, alpha: number): string {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return `rgba(0, 0, 0, ${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
