import { cn } from '../../lib/cn';

/**
 * 浮层(下拉菜单、对话框)的表面样式。
 *
 * 玻璃主题会把 `bg-white` / `dark:bg-[#1E1E32]` 改写成很淡的半透明,所以浮层不能直接用这两个类。
 * 两种浮层的情况不同:
 * - 菜单下面没有变暗的背景,必须不透明:统一用样式表里的 `.popover-surface`
 *   (每套主题下的取值见 index.css,元素上另外写 `border`);
 * - 对话框下面有变暗的背景衬着,沿用搜索下拉的 `glass-panel-strong` 毛玻璃面板。
 */
export function menuSurface() {
  return 'popover-surface border';
}

export function dialogSurface(isGlass: boolean, extra?: string) {
  return cn(
    isGlass
      ? 'glass-panel-strong'
      : 'bg-white dark:bg-[#1E1E32] border border-[#E5E7EB] dark:border-white/[0.07]',
    extra,
  );
}
