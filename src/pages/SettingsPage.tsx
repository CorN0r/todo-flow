import { useState, useEffect } from 'react';
import { Upload, Download, Database, PanelBottom, ChevronRight, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { emit } from '@tauri-apps/api/event';
import { getTasks, backupDatabase, exportCsv, importDatabase, getSetting, setSetting } from '../lib/db';
import { usePomodoroStore } from '../stores/pomodoroStore';
import { save, open } from '@tauri-apps/plugin-dialog';
import { ShortcutEditor } from '../components/shared/ShortcutEditor';

type BubbleColors = { from: string; via: string; to: string };

const DEFAULT_BUBBLE_COLORS: BubbleColors = { from: '#818CF8', via: '#A855F7', to: '#EC4899' };

const PRESETS: { label: string; colors: BubbleColors }[] = [
  { label: '默认紫', colors: { from: '#818CF8', via: '#A855F7', to: '#EC4899' } },
  { label: '海洋蓝', colors: { from: '#38BDF8', via: '#3B82F6', to: '#6366F1' } },
  { label: '翡翠绿', colors: { from: '#34D399', via: '#10B981', to: '#059669' } },
  { label: '日落橙', colors: { from: '#FB923C', via: '#F97316', to: '#EF4444' } },
  { label: '樱花粉', colors: { from: '#F9A8D4', via: '#F472B6', to: '#EC4899' } },
];

function parseBubbleColors(raw: string | null): BubbleColors {
  if (!raw) return DEFAULT_BUBBLE_COLORS;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.from && parsed.via && parsed.to) return parsed as BubbleColors;
  } catch {}
  return DEFAULT_BUBBLE_COLORS;
}

export function SettingsPage() {
  const [exporting, setExporting] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [widgetEnabled, setWidgetEnabled] = useState(true);
  const [bubbleColors, setBubbleColors] = useState<BubbleColors>(DEFAULT_BUBBLE_COLORS);
  const [showCustom, setShowCustom] = useState(false);
  const pomodoroConfig = usePomodoroStore((s) => s.config);
  const updatePomodoroConfig = usePomodoroStore((s) => s.updateConfig);

  useEffect(() => {
    getSetting('widget_enabled').then((v) => {
      setWidgetEnabled(v !== '0');
    }).catch(() => {});
    getSetting('widget_bubble_color').then((raw) => {
      setBubbleColors(parseBubbleColors(raw));
    }).catch(() => {});
  }, []);

  const toggleWidget = (enabled: boolean) => {
    setWidgetEnabled(enabled);
    setSetting('widget_enabled', enabled ? '1' : '0');
  };

  const saveBubbleColors = (colors: BubbleColors) => {
    setBubbleColors(colors);
    setSetting('widget_bubble_color', JSON.stringify(colors));
    emit('bubble-color-changed', colors).catch(() => {});
  };

  const handleBackup = async () => {
    const path = await save({
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      defaultPath: `todoflow-backup-${new Date().toISOString().split('T')[0]}.db`,
    });
    if (!path) return;
    setBackingUp(true);
    try {
      await backupDatabase(path);
      toast.success('数据库备份成功');
    } catch (err) {
      toast.error('备份失败: ' + (err as string));
    }
    setBackingUp(false);
  };

  const handleExportCSV = async () => {
    const path = await save({
      filters: [{ name: 'CSV', extensions: ['csv'] }],
      defaultPath: `todoflow-export-${new Date().toISOString().split('T')[0]}.csv`,
    });
    if (!path) return;
    setExporting(true);
    try {
      const tasks = await getTasks({ include_children: true });
      const headers = ['id', 'title', 'description', 'is_completed', 'is_archived', 'is_suspended', 'is_abandoned', 'priority', 'due_date', 'reminder', 'recurrence', 'tag_id', 'parent_task_id', 'sort_order', 'my_day_date', 'created_at', 'updated_at'];
      const rows = tasks.map((t) =>
        headers.map((h) => {
          const val = (t as unknown as Record<string, unknown>)[h];
          if (val === null || val === undefined) return '';
          return String(val).includes(',') ? `"${val}"` : String(val);
        }).join(',')
      );
      const csv = '﻿' + [headers.join(','), ...rows].join('\n');
      await exportCsv(path, csv);
      toast.success('数据已导出为 CSV');
    } catch {
      toast.error('导出失败');
    }
    setExporting(false);
  };

  const [importing, setImporting] = useState(false);

  const handleImport = async () => {
    const selected = await open({
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      multiple: false,
    });
    if (!selected) return;
    setImporting(true);
    try {
      const result = await importDatabase(selected as string);
      toast.success(result);
    } catch (err) {
      toast.error('导入失败: ' + (err as string));
    }
    setImporting(false);
  };

  return (
    <div className="max-w-lg">
      <h3 className="text-[20px] font-bold text-[#111827] dark:text-white mb-6">设置</h3>

      {/* Data */}
      <div className="mb-6">
        <h4 className="section-label mb-3">数据</h4>
        <div className="space-y-2">
          <button
            onClick={handleExportCSV}
            disabled={exporting}
            className="flex items-center gap-2 text-[13px] px-4 py-2.5 rounded-[10px] border border-[#F3F4F6] dark:border-white/[0.07] bg-white dark:bg-[#1e1e32] hover:bg-[#F9FAFB] dark:hover:bg-white/[0.04] transition-colors w-full text-[#111827] dark:text-white/90 font-medium"
          >
            <Download size={16} />
            {exporting ? '导出中...' : '导出任务为 CSV'}
          </button>
          <button
            onClick={handleBackup}
            disabled={backingUp}
            className="flex items-center gap-2 text-[13px] px-4 py-2.5 rounded-[10px] border border-[#F3F4F6] dark:border-white/[0.07] bg-white dark:bg-[#1e1e32] hover:bg-[#F9FAFB] dark:hover:bg-white/[0.04] transition-colors w-full text-[#111827] dark:text-white/90 font-medium"
          >
            <Database size={16} />
            {backingUp ? '备份中...' : '备份数据库'}
          </button>
          <button
            onClick={handleImport}
            disabled={importing}
            className="flex items-center gap-2 text-[13px] px-4 py-2.5 rounded-[10px] border border-[#F3F4F6] dark:border-white/[0.07] bg-white dark:bg-[#1e1e32] hover:bg-[#F9FAFB] dark:hover:bg-white/[0.04] transition-colors w-full text-[#111827] dark:text-white/90 font-medium"
          >
            <Upload size={16} />
            {importing ? '导入中...' : '导入数据库'}
          </button>
        </div>
      </div>

      <div className="mb-6">
        <h4 className="section-label mb-3">悬浮窗</h4>
        <div className="space-y-2">
          <div className="flex items-center justify-between px-4 py-3 rounded-[10px] border border-[#F3F4F6] dark:border-white/[0.07] bg-white dark:bg-[#1e1e32]">
            <div className="flex items-center gap-3">
              <PanelBottom size={16} className="text-[#6B7280]" />
              <span className="text-[13px] text-[#111827] dark:text-white/90 font-medium">显示悬浮窗</span>
            </div>
            <button onClick={() => toggleWidget(!widgetEnabled)}
              className={`relative w-9 h-5 rounded-full transition-colors ${widgetEnabled ? 'bg-[#7C72F6]' : 'bg-[#D1D5DB] dark:bg-white/[0.15]'}`}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${widgetEnabled ? 'left-[18px]' : 'left-0.5'}`} />
            </button>
          </div>

          {/* Bubble gradient colors — only when widget is enabled */}
          {widgetEnabled && (
          <div className="px-4 py-3 rounded-[10px] border border-[#F3F4F6] dark:border-white/[0.07] bg-white dark:bg-[#1e1e32]">
            <span className="text-[13px] text-[#111827] dark:text-white/90 font-medium mb-3 block">气泡颜色</span>

            {/* Preset chips */}
            <div className="flex items-start justify-between gap-1 mb-2">
              {PRESETS.map((p) => {
                const isSelected = bubbleColors.from === p.colors.from && bubbleColors.to === p.colors.to;
                return (
                  <div
                    key={p.label}
                    onClick={() => saveBubbleColors(p.colors)}
                    className="flex flex-col items-center gap-1 cursor-pointer group"
                  >
                    <div
                      className={`w-8 h-8 rounded-full transition-all ${isSelected ? 'ring-2 ring-[#7C72F6] ring-offset-1 ring-offset-white dark:ring-offset-[#1e1e32]' : ''}`}
                      style={{
                        background: `linear-gradient(135deg, ${p.colors.from}, ${p.colors.via}, ${p.colors.to})`,
                      }}
                    />
                    <span className="text-[10px] text-[#6B7280] group-hover:text-[#111827] dark:group-hover:text-white/80 transition-colors">
                      {p.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Custom expand toggle */}
            <button
              onClick={() => setShowCustom(!showCustom)}
              className="flex items-center gap-1 text-[11px] text-[#6B7280] hover:text-[#111827] dark:hover:text-white/80 transition-colors mt-1"
            >
              {showCustom ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              自定义
            </button>

            {/* Custom color inputs */}
            {showCustom && (
              <div className="mt-2 pt-2 border-t border-[#F3F4F6] dark:border-white/[0.06]">
                {/* Live preview bar */}
                <div
                  className="w-full h-5 rounded-full mb-2.5"
                  style={{
                    background: `linear-gradient(135deg, ${bubbleColors.from}, ${bubbleColors.via}, ${bubbleColors.to})`,
                  }}
                />
                <div className="flex items-center gap-4">
                  {(['from', 'via', 'to'] as const).map((key) => (
                    <div key={key} className="flex items-center gap-1.5">
                      <span className="text-[11px] text-[#6B7280]">
                        {key === 'from' ? '起' : key === 'via' ? '中' : '终'}
                      </span>
                      <label
                        className="w-6 h-6 rounded-full cursor-pointer block relative border border-black/10 dark:border-white/15"
                        style={{ backgroundColor: bubbleColors[key] }}
                      >
                        <input
                          type="color"
                          value={bubbleColors[key]}
                          onChange={(e) => saveBubbleColors({ ...bubbleColors, [key]: e.target.value })}
                          className="absolute opacity-0 w-0 h-0 pointer-events-none"
                        />
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          )}
        </div>
      </div>

      {/* Pomodoro settings */}
      <div className="mb-6">
        <h4 className="section-label mb-3">番茄钟</h4>
        <div className="rounded-[10px] border border-[#F3F4F6] dark:border-white/[0.07] bg-white dark:bg-[#1e1e32] divide-y divide-[#F3F4F6] dark:divide-white/[0.06]">
          {/* Focus duration */}
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-[13px] text-[#111827] dark:text-white/90 font-medium">专注时长</span>
            <div className="flex items-center gap-1.5">
              <button onClick={() => updatePomodoroConfig({ focusMinutes: Math.max(5, pomodoroConfig.focusMinutes - 5) })}
                className="w-6 h-6 rounded-full flex items-center justify-center text-[#6B7280] hover:text-[#111827] dark:hover:text-white/80 hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] transition-colors text-sm">−</button>
              <span className="w-8 text-center text-[13px] font-semibold tabular-nums text-[#111827] dark:text-white/90">{pomodoroConfig.focusMinutes}</span>
              <button onClick={() => updatePomodoroConfig({ focusMinutes: Math.min(120, pomodoroConfig.focusMinutes + 5) })}
                className="w-6 h-6 rounded-full flex items-center justify-center text-[#6B7280] hover:text-[#111827] dark:hover:text-white/80 hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] transition-colors text-sm">+</button>
              <span className="text-[11px] text-[#9CA3AF] ml-1">分钟</span>
            </div>
          </div>
          {/* Short break */}
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-[13px] text-[#111827] dark:text-white/90 font-medium">短休息</span>
            <div className="flex items-center gap-1.5">
              <button onClick={() => updatePomodoroConfig({ shortBreakMinutes: Math.max(1, pomodoroConfig.shortBreakMinutes - 1) })}
                className="w-6 h-6 rounded-full flex items-center justify-center text-[#6B7280] hover:text-[#111827] dark:hover:text-white/80 hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] transition-colors text-sm">−</button>
              <span className="w-8 text-center text-[13px] font-semibold tabular-nums text-[#111827] dark:text-white/90">{pomodoroConfig.shortBreakMinutes}</span>
              <button onClick={() => updatePomodoroConfig({ shortBreakMinutes: Math.min(30, pomodoroConfig.shortBreakMinutes + 1) })}
                className="w-6 h-6 rounded-full flex items-center justify-center text-[#6B7280] hover:text-[#111827] dark:hover:text-white/80 hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] transition-colors text-sm">+</button>
              <span className="text-[11px] text-[#9CA3AF] ml-1">分钟</span>
            </div>
          </div>
          {/* Long break */}
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-[13px] text-[#111827] dark:text-white/90 font-medium">长休息</span>
            <div className="flex items-center gap-1.5">
              <button onClick={() => updatePomodoroConfig({ longBreakMinutes: Math.max(5, pomodoroConfig.longBreakMinutes - 5) })}
                className="w-6 h-6 rounded-full flex items-center justify-center text-[#6B7280] hover:text-[#111827] dark:hover:text-white/80 hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] transition-colors text-sm">−</button>
              <span className="w-8 text-center text-[13px] font-semibold tabular-nums text-[#111827] dark:text-white/90">{pomodoroConfig.longBreakMinutes}</span>
              <button onClick={() => updatePomodoroConfig({ longBreakMinutes: Math.min(60, pomodoroConfig.longBreakMinutes + 5) })}
                className="w-6 h-6 rounded-full flex items-center justify-center text-[#6B7280] hover:text-[#111827] dark:hover:text-white/80 hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] transition-colors text-sm">+</button>
              <span className="text-[11px] text-[#9CA3AF] ml-1">分钟</span>
            </div>
          </div>
          {/* Sessions until long break */}
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-[13px] text-[#111827] dark:text-white/90 font-medium">长休间隔</span>
            <div className="flex items-center gap-1.5">
              <button onClick={() => updatePomodoroConfig({ sessionsUntilLongBreak: Math.max(1, pomodoroConfig.sessionsUntilLongBreak - 1) })}
                className="w-6 h-6 rounded-full flex items-center justify-center text-[#6B7280] hover:text-[#111827] dark:hover:text-white/80 hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] transition-colors text-sm">−</button>
              <span className="w-8 text-center text-[13px] font-semibold tabular-nums text-[#111827] dark:text-white/90">{pomodoroConfig.sessionsUntilLongBreak}</span>
              <button onClick={() => updatePomodoroConfig({ sessionsUntilLongBreak: Math.min(10, pomodoroConfig.sessionsUntilLongBreak + 1) })}
                className="w-6 h-6 rounded-full flex items-center justify-center text-[#6B7280] hover:text-[#111827] dark:hover:text-white/80 hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] transition-colors text-sm">+</button>
              <span className="text-[11px] text-[#9CA3AF] ml-1">轮</span>
            </div>
          </div>
          {/* Auto-start toggles */}
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-[13px] text-[#111827] dark:text-white/90 font-medium">自动开始休息</span>
            <button onClick={() => updatePomodoroConfig({ autoStartBreak: !pomodoroConfig.autoStartBreak })}
              className={`relative w-9 h-5 rounded-full transition-colors ${pomodoroConfig.autoStartBreak ? 'bg-[#7C72F6]' : 'bg-[#D1D5DB] dark:bg-white/[0.15]'}`}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${pomodoroConfig.autoStartBreak ? 'left-[18px]' : 'left-0.5'}`} />
            </button>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-[13px] text-[#111827] dark:text-white/90 font-medium">自动开始专注</span>
            <button onClick={() => updatePomodoroConfig({ autoStartFocus: !pomodoroConfig.autoStartFocus })}
              className={`relative w-9 h-5 rounded-full transition-colors ${pomodoroConfig.autoStartFocus ? 'bg-[#7C72F6]' : 'bg-[#D1D5DB] dark:bg-white/[0.15]'}`}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${pomodoroConfig.autoStartFocus ? 'left-[18px]' : 'left-0.5'}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Keyboard shortcuts */}
      <div>
        <h4 className="section-label mb-3">快捷键</h4>
        <ShortcutEditor />
      </div>
    </div>
  );
}
