import type { TaskViewMode } from '../stores/uiStore';

// 一体式、看板、四象限要占满剩余高度、在内部滚动;列表和便签墙跟着页面滚动。调用方自己带 `flex-1`
export function taskViewBodyClass(mode: TaskViewMode) {
  return mode === 'list' || mode === 'wall'
    ? 'min-h-0 overflow-y-auto pb-6'
    : 'min-h-0 flex flex-col overflow-hidden';
}
