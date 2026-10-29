import { useCallback, useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Bell, Check, ExternalLink, X } from 'lucide-react';
import {
  getPendingAlerts,
  dismissAlert,
  snoozeAlert,
  updateTask,
  showMainFromWidget,
} from '../lib/db';
import type { PendingAlert } from '../types/task';

const SNOOZE_OPTIONS = [
  { minutes: 5, label: '5 分钟' },
  { minutes: 10, label: '10 分钟' },
  { minutes: 30, label: '30 分钟' },
  { minutes: 60, label: '1 小时' },
];

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// 单次钟声提示(Web Audio 合成)。播放失败静默:系统通知自带声音兜底。
function playChime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    // 两声下行钟声(带泛音),提示"时间到"但不像闹铃循环轰炸
    const strike = (freq: number, start: number, gain: number) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t0 = ctx.currentTime + start;
      env.gain.setValueAtTime(0, t0);
      env.gain.linearRampToValueAtTime(gain, t0 + 0.012);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.6);
      osc.connect(env).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 1.8);
    };
    strike(830.6, 0, 0.3); // G#5
    strike(415.3, 0.02, 0.12); // G#4 泛音
    strike(622.3, 0.45, 0.26); // D#5
    setTimeout(() => { ctx.close().catch(() => {}); }, 2500);
  } catch { /* 静默 */ }
}

export function ReminderAlertPage() {
  const [alerts, setAlerts] = useState<PendingAlert[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());
  // 已见提醒集合:只有队列中出现"新"提醒时才响铃,
  // 避免每 60s 轮询对未处理队列重发事件时反复响铃
  const seenRef = useRef<Set<string>>(new Set());
  const firstLoadRef = useRef(true);

  const refresh = useCallback(async (chimeOnNew: boolean) => {
    try {
      const list = await getPendingAlerts();
      if (chimeOnNew && !firstLoadRef.current) {
        const hasNew = list.some((a) => !seenRef.current.has(a.reminder_id));
        if (hasNew) playChime();
      }
      firstLoadRef.current = false;
      list.forEach((a) => seenRef.current.add(a.reminder_id));
      setAlerts(list);
      if (list.length === 0) {
        getCurrentWindow().hide().catch(() => {});
      }
    } catch {
      // 拉取失败保持现状,下一轮事件再试
    }
  }, []);

  useEffect(() => {
    refresh(false);
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      const u = await listen('alerts-updated', () => {
        refresh(true);
      });
      if (cancelled) { u(); return; }
      unlisten = u;
    })();
    return () => { cancelled = true; unlisten?.(); };
  }, [refresh]);

  // 实时时钟
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const current = alerts?.[0] ?? null;
  const total = alerts?.length ?? 0;

  const handleComplete = () => {
    if (!current) return;
    run(async () => {
      await updateTask({ id: current.task_id, is_completed: true });
      await dismissAlert(current.reminder_id);
    });
  };

  const clock = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
  const dateLabel = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 星期${WEEKDAYS[now.getDay()]}`;

  return (
    <div
      className="h-screen w-screen select-none flex flex-col text-white"
      style={{ background: 'linear-gradient(160deg, #23233a 0%, #1a1a2e 55%, #16161f 100%)' }}
    >
      {/* Header(标题栏可拖拽) */}
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-2" data-tauri-drag-region>
        <div className="w-7 h-7 rounded-full bg-[#7C72F6]/20 flex items-center justify-center animate-pulse">
          <Bell size={14} className="text-[#a99ef9]" />
        </div>
        <span className="text-[13px] font-semibold text-white/85" data-tauri-drag-region>任务提醒</span>
        {total > 1 && (
          <span className="text-[11px] text-white/40 tabular-nums">第 1 条 / 共 {total} 条</span>
        )}
        <div className="flex-1" data-tauri-drag-region />
        <button
          onClick={() => current && run(() => dismissAlert(current.reminder_id))}
          disabled={!current || busy}
          className="w-6 h-6 rounded-full flex items-center justify-center text-white/35 hover:text-white/85 hover:bg-white/[0.08] transition-colors disabled:opacity-30"
          title="关闭此提醒"
        >
          <X size={13} />
        </button>
      </div>

      {/* 时钟 */}
      <div className="flex flex-col items-center pt-2 pb-1" data-tauri-drag-region>
        <div className="text-[44px] leading-none font-bold tabular-nums tracking-tight" data-tauri-drag-region>
          {clock}
        </div>
        <div className="text-[12px] text-white/40 mt-1.5" data-tauri-drag-region>{dateLabel}</div>
      </div>

      {/* 任务信息 */}
      <div className="mx-4 mt-3 rounded-xl bg-white/[0.05] border border-white/[0.07] px-4 py-3">
        <div className="text-[15px] font-medium leading-snug break-words line-clamp-2">
          {current ? current.title : '—'}
        </div>
        {current && (
          <div className="text-[11px] text-white/40 mt-1.5 tabular-nums">
            提醒时间 {current.reminder_time}
          </div>
        )}
      </div>

      {/* 推迟档位 */}
      <div className="px-4 mt-3">
        <div className="text-[11px] text-white/40 mb-1.5">稍后提醒</div>
        <div className="flex gap-1.5">
          {SNOOZE_OPTIONS.map((opt) => (
            <button
              key={opt.minutes}
              onClick={() => current && run(() => snoozeAlert(current.reminder_id, opt.minutes))}
              disabled={!current || busy}
              className="flex-1 py-1.5 rounded-lg text-[12px] text-white/70 bg-white/[0.06] border border-white/[0.08] hover:bg-[#7C72F6]/25 hover:text-white hover:border-[#7C72F6]/40 transition-colors disabled:opacity-30"
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 主操作 */}
      <div className="flex gap-2 px-4 mt-3.5">
        <button
          onClick={handleComplete}
          disabled={!current || busy}
          className="flex-1 h-10 rounded-xl bg-[#7C72F6] hover:bg-[#6d63e8] text-white text-[13px] font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40"
        >
          <Check size={15} /> 完成任务
        </button>
        <button
          onClick={() => showMainFromWidget().catch(() => {})}
          className="h-10 px-4 rounded-xl bg-white/[0.06] border border-white/[0.08] text-white/70 hover:text-white hover:bg-white/[0.1] text-[13px] flex items-center justify-center gap-1.5 transition-colors"
          title="在主窗口查看"
        >
          <ExternalLink size={14} /> 查看任务
        </button>
      </div>

      {error && (
        <div className="px-4 mt-2 text-[11px] text-red-400/80 truncate" title={error}>
          操作失败: {error}
        </div>
      )}
      <div className="flex-1" data-tauri-drag-region />
      <div className="px-4 pb-2.5 text-center text-[10px] text-white/25">
        提醒会一直显示,直到你处理它
      </div>
    </div>
  );
}
