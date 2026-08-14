import { useState, useEffect } from 'react';
import { Upload, Download, Database, PanelBottom, ChevronRight, ChevronDown, Rocket, Keyboard } from 'lucide-react';
import { toast } from 'sonner';
import { emit, listen } from '@tauri-apps/api/event';
import { useQueryClient } from '@tanstack/react-query';
import { enable as enableAutoStart, disable as disableAutoStart, isEnabled as isAutoStartEnabled } from '@tauri-apps/plugin-autostart';
import { getTasks, backupDatabase, exportCsv, importDatabase, getSetting, setSetting, openTaskNote } from '../lib/db';
import { getRepositories } from '../domain/repositories/current';
import { usePomodoroStore } from '../stores/pomodoroStore';
import { useShortcutStore } from '../stores/shortcutStore';
import { useTaskNotes, useToggleTaskNote } from '../hooks/useTaskNotes';
import { useTasks } from '../hooks/useTasks';
import { ShortcutEditor } from '../components/shared/ShortcutEditor';
import type { NoteStyle } from '../types/note';

type BubbleColors = { from: string; via: string; to: string };

const NOTE_STYLE_LABELS: Record<NoteStyle, string> = { glass: '玻璃', paper: '便签纸', minimal: '极简' };

const MAX_TASK_NOTES = 8;

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
  } catch {
    // 解析失败时回退默认值
  }
  return DEFAULT_BUBBLE_COLORS;
}

export function SettingsPage() {
  const [exporting, setExporting] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [widgetEnabled, setWidgetEnabled] = useState(true);
  const [bubbleColors, setBubbleColors] = useState<BubbleColors>(DEFAULT_BUBBLE_COLORS);
  const [noteDefaultStyle, setNoteDefaultStyle] = useState<NoteStyle>('paper');
  const [showCustom, setShowCustom] = useState(false);
  const [autoStart, setAutoStart] = useState(false);
  const pomodoroConfig = usePomodoroStore((s) => s.config);
  const updatePomodoroConfig = usePomodoroStore((s) => s.updateConfig);
  const shortcutsEnabled = useShortcutStore((s) => s.shortcutsEnabled);
  const setShortcutsEnabled = useShortcutStore((s) => s.setShortcutsEnabled);
  const queryClient = useQueryClient();
  const { data: taskNotes = [] } = useTaskNotes();
  const { data: allTasks = [] } = useTasks();
  const toggleTaskNote = useToggleTaskNote();
  const taskTitleById = new Map(allTasks.map((t) => [t.id, t.title]));

  // open_task_note 后端幂等:窗口已存在则 show+focus,即"定位"
  const handleLocateNote = async (taskId: string) => {
    try {
      await openTaskNote(taskId);
      queryClient.invalidateQueries({ queryKey: ['task-notes'] });
    } catch (e) {
      toast.error(String(e));
    }
  };

  useEffect(() => {
    getSetting('widget_enabled').then((v) => {
      setWidgetEnabled(v !== '0');
    }).catch(() => {});
    getSetting('widget_bubble_color').then((raw) => {
      setBubbleColors(parseBubbleColors(raw));
    }).catch(() => {});
    getSetting('note_default_style').then((v) => {
      if (v === 'glass' || v === 'paper' || v === 'minimal') setNoteDefaultStyle(v);
    }).catch(() => {});
    isAutoStartEnabled().then(setAutoStart).catch(() => {});
  }, []);

  // 监听悬浮窗启用状态变化（来自悬浮窗右键菜单等），刷新开关状态
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      const fn = await listen<boolean>('widget-enabled-changed', () => {
        getSetting('widget_enabled').then((v) => {
          if (!cancelled) setWidgetEnabled(v !== '0');
        }).catch(() => {});
      });
      if (cancelled) fn();
      else unlisten = fn;
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const toggleWidget = (enabled: boolean) => {
    setWidgetEnabled(enabled);
    setSetting('widget_enabled', enabled ? '1' : '0');
    emit('widget-enabled-changed', enabled).catch(() => {});
  };

  const toggleAutoStart = (enabled: boolean) => {
    setAutoStart(enabled);
    if (enabled) {
      enableAutoStart().catch(() => setAutoStart(false));
    } else {
      disableAutoStart().catch(() => setAutoStart(true));
    }
  };

  const saveBubbleColors = (colors: BubbleColors) => {
    setBubbleColors(colors);
    setSetting('widget_bubble_color', JSON.stringify(colors));
    emit('bubble-color-changed', colors).catch(() => {});
  };

  const handleBackup = async () => {
    const path = await getRepositories().platform.chooseSavePath({
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
    const path = await getRepositories().platform.chooseSavePath({
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
    const [selected] = await getRepositories().platform.chooseFiles({
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

      {/* Startup */}
      <div className="mb-6">
        <h4 className="section-label mb-3">启动</h4>
        <div className="space-y-2">
          <div className="flex items-center justify-between px-4 py-3 rounded-[10px] border border-[#F3F4F6] dark:border-white/[0.07] bg-white dark:bg-[#1e1e32]">
            <div className="flex items-center gap-3">
              <Rocket size={16} className="text-[#6B7280]" />
              <span className="text-[13px] text-[#111827] dark:text-white/90 font-medium">开机启动</span>
            </div>
            <button onClick={() => toggleAutoStart(!autoStart)}
              className={`relative w-9 h-5 rounded-full transition-colors ${autoStart ? 'bg-[#7C72F6]' : 'bg-[#D1D5DB] dark:bg-white/[0.15]'}`}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${autoStart ? 'left-[18px]' : 'left-0.5'}`} />
            </button>
          </div>
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

      {/* Desktop sticky notes */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h4 className="section-label">桌面便签</h4>
          <span className="text-[11px] text-[#9CA3AF] tabular-nums">{taskNotes.length}/{MAX_TASK_NOTES}</span>
        </div>
        {taskNotes.length >= MAX_TASK_NOTES && (
          <div className="mb-2 px-3 py-2 rounded-[8px] bg-amber-50 dark:bg-amber-500/10 text-[12px] text-amber-600 dark:text-amber-400">
            便签数量已达上限
          </div>
        )}
        <div className="mb-2 flex items-center justify-between px-4 py-3 rounded-[10px] border border-[#F3F4F6] dark:border-white/[0.07] bg-white dark:bg-[#1e1e32]">
          <span className="text-[13px] text-[#111827] dark:text-white/90 font-medium">默认皮肤</span>
          <div className="flex items-center gap-1 p-0.5 rounded-[8px] bg-[#F3F4F6] dark:bg-white/[0.06]">
            {(Object.keys(NOTE_STYLE_LABELS) as NoteStyle[]).map((s) => (
              <button key={s}
                onClick={() => { setNoteDefaultStyle(s); setSetting('note_default_style', s); }}
                className={`px-2.5 py-1 rounded-[6px] text-[12px] transition-colors ${
                  noteDefaultStyle === s
                    ? 'bg-white dark:bg-[#2a2a44] text-[#7C72F6] shadow-sm font-medium'
                    : 'text-[#6B7280] dark:text-white/60 hover:text-[#111827] dark:hover:text-white/90'
                }`}>
                {NOTE_STYLE_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          {taskNotes.length === 0 ? (
            <p className="px-1 text-[12px] text-[#9CA3AF]">还没有固定的便签。在任务右键菜单里选择『固定到桌面』即可创建。</p>
          ) : (
            taskNotes.map((note) => {
              const status = [
                note.always_on_top ? '置顶中' : '',
                note.collapsed ? '已折叠' : '',
              ].filter(Boolean).join(' · ');
              return (
                <div key={note.task_id}
                  className="flex items-center gap-3 px-4 py-3 rounded-[10px] border border-[#F3F4F6] dark:border-white/[0.07] bg-white dark:bg-[#1e1e32]">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-[#111827] dark:text-white/90 font-medium truncate">
                      {taskTitleById.get(note.task_id) ?? '（任务已删除）'}
                    </div>
                    <div className="text-[11px] text-[#9CA3AF] mt-0.5">
                      {NOTE_STYLE_LABELS[note.style]}{status && ` · ${status}`}
                    </div>
                  </div>
                  <button onClick={() => handleLocateNote(note.task_id)}
                    className="flex-shrink-0 text-[12px] px-2.5 py-1 rounded-[6px] text-[#7C72F6] hover:bg-[#7C72F6]/10 transition-colors">
                    定位
                  </button>
                  <button onClick={() => toggleTaskNote(note.task_id, true)}
                    className="flex-shrink-0 text-[12px] px-2.5 py-1 rounded-[6px] text-[#EF4444] hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                    取消固定
                  </button>
                </div>
              );
            })
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
        <div className="mb-3 flex items-center justify-between px-4 py-3 rounded-[10px] border border-[#F3F4F6] dark:border-white/[0.07] bg-white dark:bg-[#1e1e32]">
          <div className="flex items-center gap-3">
            <Keyboard size={16} className="text-[#6B7280]" />
            <span className="text-[13px] text-[#111827] dark:text-white/90 font-medium">启用快捷键</span>
          </div>
          <button onClick={() => setShortcutsEnabled(!shortcutsEnabled)}
            className={`relative w-9 h-5 rounded-full transition-colors ${shortcutsEnabled ? 'bg-[#7C72F6]' : 'bg-[#D1D5DB] dark:bg-white/[0.15]'}`}>
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${shortcutsEnabled ? 'left-[18px]' : 'left-0.5'}`} />
          </button>
        </div>
        <ShortcutEditor />
      </div>
    </div>
  );
}
