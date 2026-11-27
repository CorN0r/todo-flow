import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, PanelBottom, RotateCcw } from 'lucide-react';
import { emit, listen } from '@tauri-apps/api/event';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getRepositories } from '../../domain/repositories/current';
import { invalidateTaskNotes } from '../../lib/queryKeys';
import {
  BUBBLE_COLOR_PRESETS,
  BUBBLE_SIZE_PRESETS,
  BUBBLE_SIZE_STEP,
  DEFAULT_BUBBLE_COLORS,
  DEFAULT_BUBBLE_SIZE,
  MAX_BUBBLE_SIZE,
  MIN_BUBBLE_SIZE,
  clampBubbleSize,
  getBubbleFontSize,
  parseBubbleColors,
  parseBubbleSize,
  type BubbleColors,
} from '../../lib/bubble';
import { cn } from '../../lib/cn';
import { useTaskNotes, useToggleTaskNote } from '../../hooks/useTaskNotes';
import { useTasks } from '../../hooks/useTasks';
import type { NoteStyle } from '../../types/note';
import { SettingsCard, SettingsRow, SettingsSectionHeader, SettingsToggle } from './SettingsPrimitives';

const NOTE_STYLE_LABELS: Record<NoteStyle, string> = { glass: '玻璃', paper: '便签纸', minimal: '极简' };
const MAX_TASK_NOTES = 8;

export function DesktopWidgetSettingsPanel() {
  const [widgetEnabled, setWidgetEnabled] = useState(true);
  const [bubbleColors, setBubbleColors] = useState<BubbleColors>(DEFAULT_BUBBLE_COLORS);
  const [bubbleSize, setBubbleSize] = useState<number>(DEFAULT_BUBBLE_SIZE);
  const [showCustom, setShowCustom] = useState(false);
  const [noteDefaultStyle, setNoteDefaultStyle] = useState<NoteStyle>('paper');

  const queryClient = useQueryClient();
  const { data: taskNotes = [] } = useTaskNotes();
  const { data: allTasks = [] } = useTasks();
  const toggleTaskNote = useToggleTaskNote();
  const taskTitleById = new Map(allTasks.map((t) => [t.id, t.title]));

  useEffect(() => {
    getRepositories().settings.get('widget_enabled').then((v) => {
      setWidgetEnabled(v !== '0');
    }).catch(() => {});
    getRepositories().settings.get('widget_bubble_color').then((raw) => {
      setBubbleColors(parseBubbleColors(raw));
    }).catch(() => {});
    getRepositories().settings.get('widget_bubble_size').then((raw) => {
      setBubbleSize(parseBubbleSize(raw));
    }).catch(() => {});
    getRepositories().settings.get('note_default_style').then((v) => {
      if (v === 'glass' || v === 'paper' || v === 'minimal') setNoteDefaultStyle(v);
    }).catch(() => {});
  }, []);

  // 监听悬浮窗启用状态变化（来自悬浮窗右键菜单等），刷新开关状态
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      const fn = await listen<boolean>('widget-enabled-changed', () => {
        getRepositories().settings.get('widget_enabled').then((v) => {
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
    getRepositories().settings.set('widget_enabled', enabled ? '1' : '0');
    emit('widget-enabled-changed', enabled).catch(() => {});
  };

  const saveBubbleColors = (colors: BubbleColors) => {
    setBubbleColors(colors);
    getRepositories().settings.set('widget_bubble_color', JSON.stringify(colors));
    emit('bubble-color-changed', colors).catch(() => {});
  };

  const saveBubbleSize = (next: number) => {
    const clamped = clampBubbleSize(next);
    setBubbleSize(clamped);
    getRepositories().settings.set('widget_bubble_size', String(clamped));
    emit('bubble-size-changed', clamped).catch(() => {});
  };

  // open_task_note 后端幂等:窗口已存在则 show+focus,即"定位"
  const handleLocateNote = async (taskId: string) => {
    try {
      await getRepositories().taskNotes.open(taskId);
      invalidateTaskNotes(queryClient);
    } catch (e) {
      toast.error(String(e));
    }
  };

  return (
    <div className="space-y-6">
      {/* 悬浮窗 & 悬浮球 */}
      <section>
        <SettingsSectionHeader
          title="桌面悬浮窗"
          description="主窗口隐藏到托盘时显示为桌面悬浮球，可调节大小与外观"
        />
        <SettingsCard divided>
          <SettingsRow
            icon={<PanelBottom size={16} />}
            title="显示悬浮窗"
            description="关闭主窗口时最小化为桌面悬浮球，点击即可快速查看和勾选待办"
            control={
              <SettingsToggle
                checked={widgetEnabled}
                onChange={toggleWidget}
                ariaLabel="显示悬浮窗"
              />
            }
          />

          {widgetEnabled && (
            <>
              {/* 悬浮球大小 */}
              <div className="px-4 py-3.5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[13px] font-medium text-[#111827] dark:text-white/90">悬浮球大小</div>
                    <p className="text-[11.5px] text-[#6B7280] dark:text-[#9CA3AF] mt-0.5">
                      低分辨率或小尺寸屏幕可调小至 28–40px，调节后即时生效
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className="text-[12px] font-semibold tabular-nums px-2 py-0.5 rounded-md bg-[#F3F4F6] dark:bg-white/[0.06] text-[#111827] dark:text-white/90"
                      data-testid="bubble-size-value"
                    >
                      {bubbleSize} px
                    </span>
                    {bubbleSize !== DEFAULT_BUBBLE_SIZE && (
                      <button
                        type="button"
                        onClick={() => saveBubbleSize(DEFAULT_BUBBLE_SIZE)}
                        className="inline-flex items-center gap-1 text-[11px] text-[#6B7280] hover:text-[#7C72F6] transition-colors"
                        title="恢复默认大小"
                      >
                        <RotateCcw size={11} />
                        恢复默认
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {/* Live preview */}
                  <div
                    className="w-[76px] h-[76px] rounded-xl border border-dashed border-[#E5E7EB] dark:border-white/[0.10] bg-[#F9FAFB] dark:bg-white/[0.02] flex items-center justify-center shrink-0"
                    aria-label="悬浮球实时预览"
                  >
                    <div
                      data-testid="bubble-size-preview"
                      className="rounded-full flex items-center justify-center shadow-sm transition-all duration-150 select-none"
                      style={{
                        width: bubbleSize,
                        height: bubbleSize,
                        background: `linear-gradient(135deg, ${bubbleColors.from}, ${bubbleColors.via}, ${bubbleColors.to})`,
                      }}
                    >
                      <span
                        className="font-bold text-white/95 leading-none tabular-nums"
                        style={{
                          fontSize: getBubbleFontSize(bubbleSize, 1),
                          textShadow: '0 1px 2px rgba(0,0,0,0.15)',
                        }}
                      >
                        5
                      </span>
                    </div>
                  </div>

                  {/* Presets & slider */}
                  <div className="flex-1 min-w-0 space-y-3">
                    <div className="grid grid-cols-4 gap-1.5">
                      {BUBBLE_SIZE_PRESETS.map((preset) => {
                        const active = bubbleSize === preset.size;
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => saveBubbleSize(preset.size)}
                            title={preset.hint}
                            aria-pressed={active}
                            className={cn(
                              'px-2 py-1.5 rounded-lg text-center border transition-colors',
                              active
                                ? 'border-[#7C72F6] bg-[#7C72F6]/[0.10] text-[#7C72F6] font-medium'
                                : 'border-[#F3F4F6] dark:border-white/[0.07] bg-[#F9FAFB] dark:bg-white/[0.03] text-[#6B7280] hover:text-[#111827] dark:hover:text-white/90',
                            )}
                          >
                            <div className="text-[12px] leading-tight">{preset.label}</div>
                            <div className="text-[10px] opacity-75 tabular-nums mt-0.5">{preset.size}px</div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-2.5">
                      <span className="text-[11px] text-[#9CA3AF] tabular-nums shrink-0">{MIN_BUBBLE_SIZE}px</span>
                      <input
                        type="range"
                        aria-label="悬浮球大小"
                        min={MIN_BUBBLE_SIZE}
                        max={MAX_BUBBLE_SIZE}
                        step={BUBBLE_SIZE_STEP}
                        value={bubbleSize}
                        onChange={(e) => saveBubbleSize(Number(e.target.value))}
                        className="flex-1 accent-[#7C72F6] cursor-pointer h-1.5"
                      />
                      <span className="text-[11px] text-[#9CA3AF] tabular-nums shrink-0">{MAX_BUBBLE_SIZE}px</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 气泡颜色 */}
              <div className="px-4 py-3.5">
                <span className="text-[13px] text-[#111827] dark:text-white/90 font-medium mb-3 block">气泡颜色</span>

                <div className="flex items-start justify-between gap-2 mb-2">
                  {BUBBLE_COLOR_PRESETS.map((p) => {
                    const isSelected = bubbleColors.from === p.colors.from && bubbleColors.to === p.colors.to;
                    return (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => saveBubbleColors(p.colors)}
                        className="flex flex-col items-center gap-1 cursor-pointer group"
                      >
                        <div
                          className={cn(
                            'w-8 h-8 rounded-full transition-all',
                            isSelected && 'ring-2 ring-[#7C72F6] ring-offset-2 ring-offset-white dark:ring-offset-[#1e1e32]',
                          )}
                          style={{
                            background: `linear-gradient(135deg, ${p.colors.from}, ${p.colors.via}, ${p.colors.to})`,
                          }}
                        />
                        <span className="text-[11px] text-[#6B7280] group-hover:text-[#111827] dark:group-hover:text-white/80 transition-colors">
                          {p.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setShowCustom(!showCustom)}
                  className="flex items-center gap-1 text-[11.5px] text-[#6B7280] hover:text-[#111827] dark:hover:text-white/80 transition-colors mt-1.5"
                >
                  {showCustom ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  自定义渐变色
                </button>

                {showCustom && (
                  <div className="mt-2.5 pt-2.5 border-t border-[#F3F4F6] dark:border-white/[0.06]">
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
            </>
          )}
        </SettingsCard>
      </section>

      {/* 桌面便签 */}
      <section>
        <SettingsSectionHeader
          title="桌面便签"
          description="将重点任务固定到桌面，可随时查看进度与倒计时"
          trailing={
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#F3F4F6] dark:bg-white/[0.06] text-[#6B7280] dark:text-[#9CA3AF] tabular-nums">
              {taskNotes.length}/{MAX_TASK_NOTES}
            </span>
          }
        />

        {taskNotes.length >= MAX_TASK_NOTES && (
          <div className="mb-2.5 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-[12px] text-amber-600 dark:text-amber-400">
            便签数量已达上限
          </div>
        )}

        <SettingsCard divided>
          <SettingsRow
            title="新建便签默认皮肤"
            description="仅对后续新建的桌面便签生效，已有便签可在右键菜单单独切换"
            control={
              <div className="flex items-center gap-1 p-0.5 rounded-[8px] bg-[#F3F4F6] dark:bg-white/[0.06]">
                {(Object.keys(NOTE_STYLE_LABELS) as NoteStyle[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setNoteDefaultStyle(s);
                      getRepositories().settings.set('note_default_style', s);
                    }}
                    className={cn(
                      'px-2.5 py-1 rounded-[6px] text-[12px] transition-colors',
                      noteDefaultStyle === s
                        ? 'bg-white dark:bg-[#2a2a44] text-[#7C72F6] shadow-sm font-medium'
                        : 'text-[#6B7280] dark:text-white/60 hover:text-[#111827] dark:hover:text-white/90',
                    )}
                  >
                    {NOTE_STYLE_LABELS[s]}
                  </button>
                ))}
              </div>
            }
          />

          {taskNotes.length === 0 ? (
            <div className="px-4 py-4">
              <p className="text-[12px] text-[#9CA3AF]">
                还没有固定的便签。在任务右键菜单里选择『固定到桌面』即可创建。
              </p>
            </div>
          ) : (
            taskNotes.map((note) => {
              const status = [
                note.always_on_top ? '置顶中' : '',
                note.collapsed ? '已折叠' : '',
              ].filter(Boolean).join(' · ');
              return (
                <div key={note.task_id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-[#111827] dark:text-white/90 font-medium truncate">
                      {taskTitleById.get(note.task_id) ?? '（任务已删除）'}
                    </div>
                    <div className="text-[11px] text-[#9CA3AF] mt-0.5">
                      {NOTE_STYLE_LABELS[note.style]}{status && ` · ${status}`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleLocateNote(note.task_id)}
                    className="flex-shrink-0 text-[12px] px-2.5 py-1 rounded-[6px] text-[#7C72F6] hover:bg-[#7C72F6]/10 transition-colors"
                  >
                    定位
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleTaskNote(note.task_id, true)}
                    className="flex-shrink-0 text-[12px] px-2.5 py-1 rounded-[6px] text-[#EF4444] hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                  >
                    取消固定
                  </button>
                </div>
              );
            })
          )}
        </SettingsCard>
      </section>
    </div>
  );
}
