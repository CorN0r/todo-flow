import { cn } from '../../lib/cn';

/**
 * 浮层(下拉菜单、对话框)的表面样式。
 *
 * 玻璃主题会把 `bg-white` / `dark:bg-[#1E1E32]` 改写成很淡的半透明,所以玻璃主题下要单独指定。
 * 两种浮层的情况不同:
 * - 菜单下面没有变暗的背景,底下的导航文字会透上来,所以用接近不透明的深色面板;
 * - 对话框下面有变暗的背景衬着,沿用搜索下拉的 `glass-panel-strong` 毛玻璃面板。
 */
export function menuSurface(isGlass: boolean) {
  return isGlass
    ? 'bg-[#1E1E32]/95 backdrop-blur-xl border border-white/[0.08]'
    : 'bg-white dark:bg-[#1E1E32] border border-[#E5E7EB] dark:border-white/[0.07]';
}

export function dialogSurface(isGlass: boolean, extra?: string) {
  return cn(
    isGlass
      ? 'glass-panel-strong'
      : 'bg-white dark:bg-[#1E1E32] border border-[#E5E7EB] dark:border-white/[0.07]',
    extra,
  );
}
