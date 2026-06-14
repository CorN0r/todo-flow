import { RotateCcw, Globe, Navigation, CheckSquare, Layout } from 'lucide-react';
import { toast } from 'sonner';
import { useShortcutStore } from '../../stores/shortcutStore';
import { getShortcutDefsSorted } from '../../types/shortcuts';
import { KeyCapture } from './KeyCapture';

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  global: <Globe size={14} />,
  navigation: <Navigation size={14} />,
  task: <CheckSquare size={14} />,
  view: <Layout size={14} />,
};

const CATEGORY_LABELS: Record<string, string> = {
  global: '全局快捷键',
  navigation: '页面导航',
  task: '任务操作',
  view: '视图',
};

export function ShortcutEditor() {
  const shortcutMap = useShortcutStore((s) => s.shortcutMap);
  const conflicts = useShortcutStore((s) => s.conflicts);
  const isLoaded = useShortcutStore((s) => s.isLoaded);
  const updateShortcut = useShortcutStore((s) => s.updateShortcut);
  const resetToDefaults = useShortcutStore((s) => s.resetToDefaults);

  const defs = getShortcutDefsSorted();

  // 按分类分组
  const groups = new Map<string, typeof defs>();
  for (const def of defs) {
    if (!groups.has(def.category)) groups.set(def.category, []);
    groups.get(def.category)!.push(def);
  }

  // 检查某个快捷键 ID 是否在冲突列表中
  const conflictIds = new Set<string>();
  const conflictMessages: Record<string, string> = {};
  for (const c of conflicts) {
    for (const id of c.ids) {
      conflictIds.add(id);
    }
    const labels = c.ids
      .map((id) => defs.find((d) => d.id === id)?.label || id)
      .join('、');
    for (const id of c.ids) {
      conflictMessages[id] = `与「${labels}」冲突`;
    }
  }

  const handleUpdate = async (id: string, keys: string) => {
    const result = await updateShortcut(id, keys);
    if (!result.success && result.error !== '快捷键冲突') {
      toast.error(result.error || '保存失败');
    }
  };

  const handleReset = async () => {
    await resetToDefaults();
    toast.success('快捷键已恢复为默认设置');
  };

  if (!isLoaded) {
    return (
      <div className="text-sm text-[#9CA3AF] py-4">加载中...</div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 冲突警告 */}
      {conflicts.length > 0 && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 p-3">
          <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-2">快捷键冲突</p>
          <ul className="text-xs text-red-500 dark:text-red-400 space-y-0.5">
            {conflicts.map((c, i) => (
              <li key={i}>
                {c.keys}: {c.ids.map((id) => defs.find((d) => d.id === id)?.label || id).join(' 与 ')}
              </li>
            ))}
          </ul>
        </div>
      )}

      {Array.from(groups.entries()).map(([category, items]) => (
        <div key={category}>
          <h4 className="flex items-center gap-1.5 text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-2">
            {CATEGORY_ICONS[category]}
            {CATEGORY_LABELS[category] || category}
          </h4>
          <div className="rounded-lg border border-[#F3F4F6] dark:border-white/[0.07] overflow-hidden">
            {items.map((def, idx) => {
              const config = shortcutMap[def.id];
              const keys = config?.keys || '';
              const isConflict = conflictIds.has(def.id);

              return (
                <div
                  key={def.id}
                  className={`flex items-center justify-between px-4 py-2.5 ${
                    idx < items.length - 1
                      ? 'border-b border-[#F3F4F6] dark:border-white/[0.04]'
                      : ''
                  } ${isConflict ? 'bg-red-50/50 dark:bg-red-900/5' : ''}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm text-[#111827] dark:text-white/85">{def.label}</span>
                    {isConflict && (
                      <span className="text-[10px] text-red-500 truncate">
                        {conflictMessages[def.id]}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <KeyCapture
                      currentKeys={keys}
                      onSave={(newKeys) => handleUpdate(def.id, newKeys)}
                      conflict={isConflict ? conflictMessages[def.id] : undefined}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* 重置按钮 */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#6B7280] hover:text-[#111827] dark:hover:text-white/80 rounded-md hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors"
        >
          <RotateCcw size={12} />
          恢复默认快捷键
        </button>
      </div>
    </div>
  );
}
