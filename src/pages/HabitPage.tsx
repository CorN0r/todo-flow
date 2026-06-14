import { useState } from 'react';
import { Check, Plus, Pencil, Trash2, Flame, Target, TrendingUp } from 'lucide-react';
import { useHabits, useCreateHabit, useUpdateHabit, useDeleteHabit, useToggleHabitLog } from '../hooks/useHabits';
import { LoadingSkeleton } from '../components/shared/LoadingSkeleton';
import { EmptyState } from '../components/shared/EmptyState';
import { cn } from '../lib/cn';
import { todayISO } from '../lib/date';

const FREQ_LABELS: Record<string, string> = {
  daily: '每天', weekly: '每周', monthly: '每月',
};

const COLORS = ['#7C72F6', '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#EC4899', '#8B5CF6', '#14B8A6'];

export function HabitPage() {
  const { data: habits, isLoading } = useHabits();
  const createHabit = useCreateHabit();
  const updateHabit = useUpdateHabit();
  const deleteHabit = useDeleteHabit();
  const toggleLog = useToggleHabitLog();
  const today = todayISO();

  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(COLORS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const handleCreate = () => {
    if (!newName.trim()) return;
    createHabit.mutate({ name: newName.trim(), color: newColor });
    setNewName(''); setIsCreating(false);
  };

  const handleToggle = (habitId: string) => {
    toggleLog.mutate({ habitId, date: today });
  };

  if (isLoading) return <LoadingSkeleton count={5} />;

  return (
    <div className="pb-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center">
            <Target size={18} className="text-rose-500" />
          </div>
          <div>
            <h1 className="text-[20px] font-bold text-[#111827] dark:text-white/90">习惯追踪</h1>
            <p className="text-[13px] text-[#9CA3AF] mt-0.5">坚持打卡，养成好习惯</p>
          </div>
        </div>
        <button
          onClick={() => { setIsCreating(true); setNewColor(COLORS[0]); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#7C72F6] text-white text-[13px] font-medium hover:bg-[#6B63E6] transition-colors"
        >
          <Plus size={15} />新建习惯
        </button>
      </div>

      {isCreating && (
        <div className="mb-4 p-4 rounded-xl bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.06] shadow-sm">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setIsCreating(false); }}
            placeholder="习惯名称，如：早起、阅读..."
            className="w-full text-[14px] px-3 py-2 rounded-lg border border-[#E5E7EB] dark:border-white/[0.07] bg-[#F9FAFB] dark:bg-white/[0.03] text-[#111827] dark:text-white/90 outline-none focus:ring-2 focus:ring-[#7C72F6] mb-3 placeholder:text-[#9CA3AF]"
          />
          <div className="flex items-center gap-2 mb-3">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                className={cn('w-6 h-6 rounded-full transition-transform', newColor === c && 'ring-2 ring-offset-2 ring-[#7C72F6] scale-110')}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleCreate} className="px-4 py-1.5 rounded-lg bg-[#7C72F6] text-white text-[13px] font-medium">创建</button>
            <button onClick={() => setIsCreating(false)} className="px-4 py-1.5 rounded-lg text-[13px] text-[#6B7280] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04]">取消</button>
          </div>
        </div>
      )}

      {!habits?.length && !isCreating ? (
        <EmptyState
          icon={<Target size={40} />}
          title="还没有习惯"
          description="点击「新建习惯」开始追踪你的日常习惯"
        />
      ) : (
        <div className="grid gap-3">
          {habits?.map((habit) => (
            <div
              key={habit.id}
              className="rounded-xl bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.06] p-4 shadow-sm hover:border-[#7C72F6]/20 transition-colors"
            >
              <div className="flex items-center gap-4">
                <button
                  onClick={() => handleToggle(habit.id)}
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all shrink-0',
                    habit.is_done_today
                      ? 'border-transparent text-white'
                      : 'border-[#D1D5DB] dark:border-white/20 hover:border-[#7C72F6]',
                  )}
                  style={habit.is_done_today ? { backgroundColor: habit.color } : undefined}
                >
                  {habit.is_done_today && <Check size={16} strokeWidth={3} />}
                </button>

                <div className="flex-1 min-w-0">
                  {editingId === habit.id ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { if (editName.trim()) updateHabit.mutate({ id: habit.id, name: editName.trim() }); setEditingId(null); }
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      onBlur={() => setEditingId(null)}
                      className="text-[14px] font-medium px-2 py-0.5 rounded border border-[#E5E7EB] dark:border-white/[0.07] bg-[#F9FAFB] dark:bg-white/[0.03] text-[#111827] dark:text-white/90 outline-none focus:ring-1 focus:ring-[#7C72F6] w-full"
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-medium text-[#111827] dark:text-white/90">{habit.name}</span>
                      <span className="text-[11px] text-[#9CA3AF]">{FREQ_LABELS[habit.frequency] || habit.frequency}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-4 mt-1.5">
                    <div className="flex items-center gap-1 text-[12px] text-[#F59E0B]">
                      <Flame size={13} />
                      <span className="font-semibold tabular-nums">{habit.current_streak}</span>
                      <span className="text-[#9CA3AF]">天连续</span>
                      {habit.best_streak > 0 && (
                        <span className="text-[#9CA3AF]">(最佳 {habit.best_streak})</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-[12px] text-[#6B7280]">
                      <TrendingUp size={13} />
                      <span className="tabular-nums">{Math.round(habit.completion_rate)}%</span>
                    </div>
                  </div>

                  {/* Mini streak bar */}
                  <div className="flex gap-1 mt-2">
                    {Array.from({ length: Math.min(habit.current_streak, 30) }).map((_, i) => (
                      <div
                        key={i}
                        className="h-1 flex-1 rounded-full"
                        style={{
                          backgroundColor: habit.color,
                          opacity: 1 - i * 0.02,
                        }}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { setEditingId(habit.id); setEditName(habit.name); }}
                    className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#6B7280] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => { if (confirm(`确定删除"${habit.name}"？`)) deleteHabit.mutate(habit.id); }}
                    className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#EF4444] hover:bg-[#FEF2F2] dark:hover:bg-red-950/20 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
