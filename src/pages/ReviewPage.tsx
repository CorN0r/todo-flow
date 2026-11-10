import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft, ChevronRight, ShieldCheck, AlertTriangle, ShieldAlert,
  BarChart3, ScrollText, NotebookPen, Sparkles, RefreshCw, RefreshCcwDot, X, Check,
  CornerDownRight, Loader2, Tag as TagIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '../lib/cn';
import { todayISO } from '../lib/date';
import { queryKeys } from '../lib/queryKeys';
import { useTags } from '../hooks/useTags';
import { useUIStore } from '../stores/uiStore';
import { useReviewStore, runReviewGenerate, genReviewRequestId } from '../stores/reviewStore';
import { useElapsedSeconds } from '../components/ai/useElapsedSeconds';
import { Portal } from '../components/shared/Portal';
import { aiGetReviewContextStatus, getReviewFacts, getSavedReview, reviewListMaterial } from '../lib/db';
import { aiFailureMessage } from '../lib/aiErrors';
import { TRANSITION_LABELS } from '../types/progress';
import type {
  PreparedReviewContext, ReviewSections, SavedReview, TaskFact,
} from '../types/progress';

type PeriodKind = 'day' | 'week';

function parseISODate(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

function toISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function weekStartOf(iso: string): string {
  const d = parseISODate(iso);
  const day = (d.getDay() + 6) % 7; // 周一=0
  d.setDate(d.getDate() - day);
  return toISO(d);
}

function shiftDate(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

const SECTION_TITLES: { key: keyof ReviewSections; label: string }[] = [
  { key: 'summary', label: '总结' },
  { key: 'observations', label: '复盘观察' },
  { key: 'suggestions', label: '下一步建议' },
  { key: 'questions', label: '待确认问题' },
];

export function ReviewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: tags } = useTags();

  const [kind, setKind] = useState<PeriodKind>('day');
  const [anchorDate, setAnchorDate] = useState<string>(todayISO());
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const [tagMenuPos, setTagMenuPos] = useState<{ top: number; left: number } | null>(null);
  const tagBtnRef = useRef<HTMLButtonElement>(null);

  const [section, setSection] = useState<'facts' | 'material' | 'draft'>('facts');
  const [materialKind, setMaterialKind] = useState<'records' | 'events'>('records');

  const scopeStart = kind === 'day' ? anchorDate : weekStartOf(anchorDate);
  const scopeEnd = kind === 'day' ? anchorDate : shiftDate(scopeStart, 6);
  const tagKey = useMemo(() => [...selectedTags].sort().join(','), [selectedTags]);
  const scopeKey = `${kind}:${scopeStart}${tagKey ? `|${tagKey}` : ''}`;

  // 材料分页与范围成对保存:范围/类型变化时派生回到第一页(不在 effect 里 setState)
  const materialKey = `${kind}|${anchorDate}|${tagKey}|${materialKind}`;
  const [materialPageState, setMaterialPageState] = useState<{ key: string; page: number }>({ key: '', page: 1 });
  const materialPage = materialPageState.key === materialKey ? materialPageState.page : 1;
  const setMaterialPage = (page: number) => setMaterialPageState({ key: materialKey, page });

  const facts = useQuery({
    queryKey: queryKeys.reviews.facts(kind, scopeStart, tagKey),
    queryFn: () => getReviewFacts(kind, scopeStart, selectedTags),
  });
  const saved = useQuery({
    queryKey: queryKeys.reviews.saved(kind, scopeStart, tagKey),
    queryFn: () => getSavedReview(kind, scopeStart, selectedTags),
  });
  const contextStatus = useQuery({
    queryKey: queryKeys.reviews.contextStatus(kind, scopeStart, tagKey),
    queryFn: () => aiGetReviewContextStatus(kind, scopeStart, selectedTags),
  });
  const material = useQuery({
    queryKey: queryKeys.reviews.material(kind, scopeStart, tagKey, materialKind, materialPage),
    queryFn: () => reviewListMaterial(kind, scopeStart, selectedTags, materialKind, materialPage, 20),
  });

  const step = kind === 'day' ? 1 : 7;

  const coverage = facts.data?.coverage_status;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* ── 标题与范围控制 ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-bold text-[#111827] dark:text-white/90">回顾</h1>
          <div className="inline-flex rounded-full bg-[#F3F4F6] dark:bg-white/[0.06] p-0.5">
            <button onClick={() => setKind('day')}
              className={cn('text-[12px] font-medium px-3 py-1 rounded-full transition-colors',
                kind === 'day' ? 'bg-white dark:bg-[#1e1e32] text-[#7C72F6] shadow-sm' : 'text-[#6B7280]')}>日回顾</button>
            <button onClick={() => setKind('week')}
              className={cn('text-[12px] font-medium px-3 py-1 rounded-full transition-colors',
                kind === 'week' ? 'bg-white dark:bg-[#1e1e32] text-[#7C72F6] shadow-sm' : 'text-[#6B7280]')}>周回顾</button>
          </div>
          <span className="flex-1" />
          <button ref={tagBtnRef} onClick={() => {
            const rect = tagBtnRef.current?.getBoundingClientRect();
            setTagMenuPos(rect ? { top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 240) } : null);
            setTagMenuOpen(!tagMenuOpen);
          }}
            className="inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-full text-[#6B7280] bg-[#F3F4F6] dark:bg-white/[0.06] hover:bg-[#E5E7EB] dark:hover:bg-white/[0.10]">
            <TagIcon size={12} />{selectedTags.length === 0 ? '全部标签' : `${selectedTags.length} 个标签`}
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-[13px]">
          <button onClick={() => setAnchorDate(shiftDate(anchorDate, -step))} aria-label="上一周期"
            className="p-1.5 rounded-lg hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] text-[#6B7280]">
            <ChevronLeft size={16} />
          </button>
          {kind === 'day' ? (
            <input type="date" value={anchorDate} max={todayISO()}
              onChange={(e) => e.target.value && setAnchorDate(e.target.value)}
              className="text-[13px] font-medium px-2 py-1 rounded-lg border border-[#E5E7EB] dark:border-white/[0.10] bg-transparent text-[#111827] dark:text-white/90 outline-none focus:border-[#7C72F6]" />
          ) : (
            <span className="font-medium text-[#111827] dark:text-white/90">
              {scopeStart} ~ {scopeEnd}
            </span>
          )}
          <button onClick={() => setAnchorDate(shiftDate(anchorDate, step))} disabled={anchorDate >= todayISO() && kind === 'day'}
            aria-label="下一周期"
            className="p-1.5 rounded-lg hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] text-[#6B7280] disabled:opacity-30">
            <ChevronRight size={16} />
          </button>
          <button onClick={() => setAnchorDate(todayISO())}
            className="text-[12px] px-2 py-1 rounded-full text-[#7C72F6] bg-[#7C72F6]/[0.08] hover:bg-[#7C72F6]/[0.14] font-medium">
            今天
          </button>
          <span className="flex-1" />
          {facts.data && (
            <span className="text-[11px] text-[#9CA3AF]">
              统计截止 {facts.data.event_cutoff_at.slice(5, 16)} · 资料准备 {facts.data.prepared_at.slice(5, 16)} · UTC{facts.data.timezone_offset}
            </span>
          )}
        </div>

        {/* 覆盖说明 */}
        {facts.data && (
          <div className={cn('flex items-start gap-2 rounded-xl px-3 py-2 text-[12px]',
            coverage === 'complete' ? 'bg-[#F0FDF4] dark:bg-green-950/20 text-[#15803D]' :
              coverage === 'partial' ? 'bg-[#FFFBEB] dark:bg-amber-950/20 text-[#B45309]' :
                'bg-[#FEF2F2] dark:bg-red-950/20 text-[#B91C1C]')}>
            {coverage === 'complete' ? <ShieldCheck size={14} className="mt-0.5 shrink-0" /> :
              coverage === 'partial' ? <AlertTriangle size={14} className="mt-0.5 shrink-0" /> : <ShieldAlert size={14} className="mt-0.5 shrink-0" />}
            <div>
              {coverage === 'complete' && '本机资料覆盖完整;结论仅基于本机可确认事实。'}
              {coverage === 'partial' && '资料部分可用:该周期包含留存关闭、清理或导入造成的缺口,以下为已记录事件的已知结果,不代表全量。'}
              {coverage === 'missing' && '历史资料缺失:该周期早于本机可靠历史起点,无法作为完整总结;空列表不代表当时没有活动。'}
              {facts.data.coverage.baseline_start && coverage !== 'complete' && (
                <span className="block text-[11px] opacity-80">本机事实自 {facts.data.coverage.baseline_start} 起可查。</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── 内容分区 ── */}
      <div role="tablist" aria-label="回顾内容" className="flex items-center gap-1 border-b border-[#F3F4F6] dark:border-white/[0.06]">
        {([['facts', '事实', BarChart3], ['material', '记录与事件', ScrollText], ['draft', '回顾文稿', NotebookPen]] as const).map(([key, label, Icon]) => (
          <button key={key} role="tab" aria-selected={section === key} onClick={() => setSection(key)}
            className={cn('inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-2 -mb-px border-b-2 transition-colors',
              section === key ? 'text-[#7C72F6] border-[#7C72F6]' : 'text-[#6B7280] border-transparent hover:text-[#111827] dark:hover:text-white/80')}>
            <Icon size={13} />{label}
          </button>
        ))}
      </div>

      {section === 'facts' && <FactsSection factsQuery={facts} onOpenTask={(taskId) => {
        useUIStore.getState().setSelectedTaskId(taskId);
        navigate('/');
      }} />}

      {section === 'material' && (
        <MaterialSection
          data={material.data}
          isLoading={material.isLoading}
          materialKind={materialKind}
          onKindChange={setMaterialKind}
          page={materialPage}
          onPageChange={setMaterialPage}
          onOpenTask={(taskId) => { useUIStore.getState().setSelectedTaskId(taskId); navigate('/'); }}
        />
      )}

      {section === 'draft' && (
        <DraftSection
          kind={kind}
          scopeStart={scopeStart}
          scopeEnd={scopeEnd}
          scopeKey={scopeKey}
          tagKey={tagKey}
          selectedTags={selectedTags}
          saved={saved.data ?? null}
          contextStatus={contextStatus.data ?? null}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: queryKeys.reviews.saved(kind, scopeStart, tagKey) });
          }}
        />
      )}

      {/* 标签选择弹出 */}
      {tagMenuOpen && (
        <Portal>
          <div className="fixed inset-0 z-40" onClick={() => setTagMenuOpen(false)} />
          <div className="fixed z-50 bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.07] rounded-xl shadow-xl py-1 min-w-[200px] max-h-[300px] overflow-y-auto"
            style={tagMenuPos ?? { top: 0, left: 0 }}>
            <button onClick={() => { setSelectedTags([]); setTagMenuOpen(false); }}
              className="w-full text-left px-3 py-2 text-[13px] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] text-[#111827] dark:text-white/90 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#9CA3AF]" />全部标签
              {selectedTags.length === 0 && <Check size={13} className="ml-auto text-[#7C72F6]" />}
            </button>
            {(tags ?? []).map((t) => {
              const active = selectedTags.includes(t.id);
              return (
                <button key={t.id} onClick={() => setSelectedTags((prev) => active ? prev.filter((id) => id !== t.id) : [...prev, t.id])}
                  className="w-full text-left px-3 py-2 text-[13px] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] flex items-center gap-2 text-[#111827] dark:text-white/90">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }} />{t.name}
                  {active && <Check size={13} className="ml-auto text-[#7C72F6]" />}
                </button>
              );
            })}
            <div className="px-3 py-1.5 text-[11px] text-[#9CA3AF] border-t border-[#F3F4F6] dark:border-white/[0.06]">选择多个标签时按任一匹配;范围默认按保存时的标签快照归类。</div>
          </div>
        </Portal>
      )}
    </div>
  );
}

// ─────────────────────────── 事实 ───────────────────────────

function FactsSection({ factsQuery, onOpenTask }: {
  factsQuery: ReturnType<typeof useQuery<import('../types/progress').ReviewFacts>>;
  onOpenTask: (taskId: string) => void;
}) {
  if (factsQuery.isLoading) return <p className="text-[13px] text-[#9CA3AF] text-center py-6">加载中…</p>;
  const facts = factsQuery.data;
  if (!facts) return <p className="text-[13px] text-[#9CA3AF] text-center py-6">暂无数据</p>;

  const stats = [
    { label: '根任务完成', value: facts.completed_root.length, hint: '期内有真实完成事件且当前仍为完成' },
    { label: '子任务完成', value: facts.completed_subtask.length, hint: '与根任务分列,不相加' },
    { label: '完成后重开', value: facts.completed_then_reopened.length, hint: '期内完成过,截至统计截止又处于未完成' },
    { label: '挂起', value: facts.suspended_count, hint: '挂起事件次数' },
    { label: '恢复进行', value: facts.resumed_count, hint: '从挂起恢复次数' },
    { label: '放弃', value: facts.abandoned_count, hint: '放弃不计为完成' },
    { label: '进展记录', value: facts.record_count, hint: '范围内手写记录条数(按记录日期归属)' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {stats.map((s) => (
          <div key={s.label} title={s.hint}
            className="rounded-xl border border-[#F3F4F6] dark:border-white/[0.06] bg-white dark:bg-[#1e1e32] px-3 py-2.5">
            <p className="text-[20px] font-bold text-[#111827] dark:text-white/90 leading-none">{s.value}</p>
            <p className="text-[11px] text-[#6B7280] mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <FactList title="本期完成 · 根任务" items={facts.completed_root} onOpenTask={onOpenTask} empty="本期内没有可确认完成的根任务" />
      <FactList title="本期完成 · 子任务" items={facts.completed_subtask} onOpenTask={onOpenTask} empty="本期内没有可确认完成的子任务" submark />
      <FactList title="完成后重新打开" items={facts.completed_then_reopened} onOpenTask={onOpenTask} empty="没有完成后又重开的事项" />
    </div>
  );
}

function FactList({ title, items, onOpenTask, empty, submark }: {
  title: string; items: TaskFact[]; onOpenTask: (taskId: string) => void; empty: string; submark?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-[#6B7280] tracking-wide mb-1.5">{title}</p>
      {items.length === 0 ? (
        <p className="text-[12px] text-[#9CA3AF] px-1 py-1.5">{empty}</p>
      ) : (
        <div className="space-y-1">
          {items.map((fact) => (
            <button key={fact.task_id} disabled={fact.task_deleted}
              onClick={() => onOpenTask(fact.task_id)}
              className={cn('w-full flex items-center gap-2 rounded-xl border border-[#F3F4F6] dark:border-white/[0.06] px-3 py-2 text-left transition-colors',
                fact.task_deleted ? 'opacity-60 cursor-not-allowed bg-[#FAFAFA] dark:bg-white/[0.02]' : 'bg-white dark:bg-[#1e1e32] hover:border-[#7C72F6]/40')}>
              {submark && <CornerDownRight size={12} className="text-[#7C72F6] shrink-0" />}
              <span className={cn('text-[13px] flex-1 truncate', fact.task_deleted ? 'text-[#9CA3AF]' : 'text-[#111827] dark:text-white/90')}>
                {fact.task_deleted ? `${fact.title}(任务已删除)` : fact.title}
              </span>
              <span className="text-[11px] text-[#9CA3AF] shrink-0">{fact.occurred_at.slice(5, 16)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── 材料浏览 ───────────────────────────

function MaterialSection({ data, isLoading, materialKind, onKindChange, page, onPageChange, onOpenTask }: {
  data: import('../types/progress').ProgressPage | import('../types/progress').StateEventPage | undefined;
  isLoading: boolean;
  materialKind: 'records' | 'events';
  onKindChange: (kind: 'records' | 'events') => void;
  page: number;
  onPageChange: (page: number) => void;
  onOpenTask: (taskId: string) => void;
}) {
  const items = (data?.items ?? []) as unknown[];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / (data?.page_size ?? 20)));

  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-full bg-[#F3F4F6] dark:bg-white/[0.06] p-0.5">
        <button onClick={() => onKindChange('records')}
          className={cn('text-[12px] font-medium px-2.5 py-1 rounded-full transition-colors',
            materialKind === 'records' ? 'bg-white dark:bg-[#1e1e32] text-[#7C72F6] shadow-sm' : 'text-[#6B7280]')}>手写记录</button>
        <button onClick={() => onKindChange('events')}
          className={cn('text-[12px] font-medium px-2.5 py-1 rounded-full transition-colors',
            materialKind === 'events' ? 'bg-white dark:bg-[#1e1e32] text-[#7C72F6] shadow-sm' : 'text-[#6B7280]')}>状态事件</button>
      </div>

      {isLoading && <p className="text-[12px] text-[#9CA3AF] text-center py-4">加载中…</p>}
      {!isLoading && items.length === 0 && (
        <div className="rounded-xl border border-dashed border-[#E5E7EB] dark:border-white/[0.08] py-6 text-center">
          <p className="text-[12px] text-[#9CA3AF]">
            {materialKind === 'records' ? '该范围内没有手写进展;没有记录不代表没有推进。' : '该范围内没有状态事件。'}
          </p>
        </div>
      )}

      {materialKind === 'records'
        ? (items as import('../types/progress').ProgressRecord[]).map((r) => (
            <div key={r.id} className="rounded-xl border border-[#F3F4F6] dark:border-white/[0.06] bg-white dark:bg-[#1e1e32] px-3 py-2.5">
              <div className="flex items-center gap-2 text-[11px] text-[#9CA3AF] mb-1 flex-wrap">
                <span className="font-medium text-[#6B7280]">{r.record_date}</span>
                {r.record_date < r.created_at.slice(0, 10) && (
                  <span className="px-1.5 py-0.5 rounded-full bg-[#FFFBEB] dark:bg-amber-950/30 text-[#F59E0B] font-medium">补记</span>
                )}
                <button disabled={r.task_deleted} onClick={() => onOpenTask(r.task_id)}
                  className={cn('inline-flex items-center gap-0.5', r.task_deleted ? 'text-[#9CA3AF] cursor-not-allowed' : 'text-[#7C72F6] hover:underline')}>
                  {r.is_subtask && <CornerDownRight size={11} />}
                  {r.task_deleted ? '任务已删除' : (r.task_title ?? '任务')}
                </button>
                <span className="flex-1" />
                <span>记录于 {r.created_at.slice(0, 16)}</span>
              </div>
              <p className="text-[13px] text-[#111827] dark:text-white/90 whitespace-pre-wrap break-words">{r.content}</p>
            </div>
          ))
        : (items as import('../types/progress').TaskStateEvent[]).map((e) => (
            <div key={e.id} className="flex items-center gap-2.5 rounded-xl border border-[#F3F4F6] dark:border-white/[0.06] bg-white dark:bg-[#1e1e32] px-3 py-2">
              <span className={cn('w-1.5 h-1.5 rounded-full shrink-0',
                e.transition === 'complete' ? 'bg-[#10B981]' : e.transition === 'reopen' ? 'bg-[#F59E0B]' : 'bg-[#9CA3AF]')} />
              <div className="flex-1 min-w-0">
                <p className={cn('text-[13px] truncate', e.task_deleted ? 'text-[#9CA3AF]' : 'text-[#111827] dark:text-white/90')}>
                  {e.task_deleted ? `${e.title_snapshot}(任务已删除)` : e.title_snapshot}
                </p>
                <p className="text-[11px] text-[#9CA3AF]">{e.occurred_at.slice(0, 16)}</p>
              </div>
              <span className="text-[12px] font-medium text-[#6B7280] shrink-0">{TRANSITION_LABELS[e.transition] ?? e.transition}</span>
            </div>
          ))}

      {total > (data?.page_size ?? 20) && (
        <div className="flex items-center justify-center gap-3 text-[12px] text-[#6B7280]">
          <button onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1}
            className="p-1 rounded hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] disabled:opacity-30" aria-label="上一页">
            <ChevronLeft size={14} />
          </button>
          <span>第 {page} / {totalPages} 页 · 共 {total} 条</span>
          <button onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
            className="p-1 rounded hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] disabled:opacity-30" aria-label="下一页">
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── 回顾文稿 ───────────────────────────

function DraftSection({ kind, scopeStart, scopeEnd, scopeKey, tagKey, selectedTags, saved, contextStatus, onSaved }: {
  kind: PeriodKind;
  scopeStart: string;
  scopeEnd: string;
  scopeKey: string;
  tagKey: string;
  selectedTags: string[];
  saved: SavedReview | null;
  contextStatus: import('../types/progress').ReviewContextStatus | null;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  // 手写稿与保存稿版本成对保存:保存稿变化时派生回服务器值(不在 effect 里 setState)
  const savedRev = saved?.revision ?? -1;
  const [manualState, setManualState] = useState<{ id: string | undefined; rev: number; text: string }>({ id: undefined, rev: -1, text: '' });
  const manualText = manualState.id === saved?.id && manualState.rev === savedRev
    ? manualState.text
    : (saved?.manual_text ?? '');
  const setManualText = (text: string) => setManualState({ id: saved?.id, rev: savedRev, text });
  const [saveOpId, setSaveOpId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [preparing, setPreparing] = useState(false);
  // 预览与回顾重点按范围成对保存:换范围时派生重置(会话本身在 store 内按范围隔离)
  const [preparedState, setPreparedState] = useState<{ scope: string; ctx: PreparedReviewContext | null }>({ scope: '', ctx: null });
  const prepared = preparedState.scope === scopeKey ? preparedState.ctx : null;
  const setPrepared = (ctx: PreparedReviewContext | null) => setPreparedState({ scope: scopeKey, ctx });
  const [noteState, setNoteState] = useState<{ scope: string; text: string }>({ scope: '', text: '' });
  const note = noteState.scope === scopeKey ? noteState.text : '';
  const setNote = (text: string) => setNoteState({ scope: scopeKey, text });

  const session = useReviewStore((s) => s.sessions[scopeKey]);
  const generating = session?.status === 'generating';
  const elapsed = useElapsedSeconds(generating, session?.startedAt);
  // 进度尾巴按 request_id 归属:换请求/取消后派生清空
  const [tailState, setTailState] = useState<{ requestId: string; text: string }>({ requestId: '', text: '' });
  const progressTail = generating && tailState.requestId === session?.requestId ? tailState.text : '';

  // 生成中接续进度流(按 request_id 过滤)
  useEffect(() => {
    if (!generating || !session?.requestId) return;
    let unlisten: (() => void) | null = null;
    let disposed = false;
    void import('@tauri-apps/api/event').then(({ listen }) => {
      listen<{ request_id: string; delta?: string; status?: string }>('ai-request-progress', (event) => {
        if (event.payload.request_id !== session.requestId) return;
        if (event.payload.delta) {
          setTailState((prev) => ({
            requestId: session.requestId,
            text: (prev.requestId === session.requestId ? prev.text : '') + event.payload.delta!,
          }));
        }
      }).then((fn) => { if (disposed) fn(); else unlisten = fn; });
    });
    return () => { disposed = true; unlisten?.(); };
  }, [generating, session?.requestId]);

  const handlePrepare = async () => {
    setPreparing(true);
    try {
      const db = await import('../lib/db');
      const ctx = await db.aiPrepareReviewContext(kind, scopeStart, selectedTags, note);
      setPrepared(ctx);
      toast.success('资料已按当前范围准备为快照');
    } catch (error) {
      toast.error(aiFailureMessage(error), { duration: 6000 });
    } finally {
      setPreparing(false);
    }
  };

  const handleGenerate = () => {
    runReviewGenerate(scopeKey, genReviewRequestId(), {
      period_kind: kind,
      start_date: scopeStart,
      tag_ids: selectedTags,
    });
  };

  const handleSaveManual = async () => {
    setSaving(true);
    const opId = saveOpId ?? `save-${crypto.randomUUID()}`;
    try {
      const db = await import('../lib/db');
      await db.saveReview({
        period_kind: kind,
        start_date: scopeStart,
        tag_ids: selectedTags,
        manual_text: manualText,
        ai: null,
        expected_revision: saved?.revision ?? 0,
        operation_id: opId,
      });
      setSaveOpId(null);
      onSaved();
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      toast.success('回顾文稿已保存');
    } catch (error) {
      setSaveOpId(opId);
      toast.error(errorMessage(error), { duration: 6000 });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAi = async () => {
    if (!session || session.status !== 'done') return;
    setSaving(true);
    const opId = saveOpId ?? `save-ai-${crypto.randomUUID()}`;
    try {
      const db = await import('../lib/db');
      await db.saveReview({
        period_kind: kind,
        start_date: scopeStart,
        tag_ids: selectedTags,
        manual_text: manualText,
        ai: {
          sections: session.sections,
          model_snapshot: session.modelSnapshot ?? '',
          event_cutoff_at: session.event_cutoff_at,
          prepared_at: session.prepared_at,
          prepared_at_local_date: session.prepared_at_local_date,
          timezone_offset: session.timezone_offset,
          coverage_note: session.coverage_note,
          source_refs: session.source_refs,
        },
        expected_revision: saved?.revision ?? 0,
        operation_id: opId,
      });
      setSaveOpId(null);
      onSaved();
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      toast.success('已按生成时快照保存回顾文稿');
    } catch (error) {
      setSaveOpId(opId);
      toast.error(errorMessage(error), { duration: 6000 });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      const db = await import('../lib/db');
      await db.deleteReview(kind, scopeStart, selectedTags);
      onSaved();
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      toast.success('已删除该范围的回顾文稿');
    } catch (error) {
      toast.error(errorMessage(error), { duration: 6000 });
    }
  };

  const hasAiSaved = !!saved?.ai_sections;

  return (
    <div className="space-y-5">
      {/* 手写回顾 */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <NotebookPen size={13} className="text-[#6B7280]" />
          <label className="text-[11px] font-semibold text-[#6B7280] tracking-wide">手写回顾</label>
          <span className="flex-1" />
          {saved && <span className="text-[11px] text-[#9CA3AF]">已保存 · 版本 {saved.revision} · {saved.updated_at.slice(0, 16)}</span>}
        </div>
        <textarea
          value={manualText}
          onChange={(e) => setManualText(e.target.value)}
          rows={4}
          placeholder="直接写下这一天的总结或复盘;没有材料也可以写,保存只属于本范围的一份当前稿。"
          className="w-full text-[13px] px-3 py-2 rounded-xl bg-[#F9FAFB] dark:bg-white/[0.03] border border-transparent focus:border-[#7C72F6] outline-none resize-y text-[#111827] dark:text-white/90 placeholder:text-[#9CA3AF]"
        />
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[#9CA3AF]">
            {kind === 'day' ? '日回顾' : '周回顾'} {scopeStart}~{scopeEnd}
            {tagKey ? ` · ${selectedTags.length} 个标签` : ' · 全部标签'}
          </span>
          <span className="flex-1" />
          {saved && (
            <button onClick={handleDelete} className="text-[12px] px-2 py-1 rounded-lg text-[#9CA3AF] hover:text-[#EF4444] hover:bg-[#FEF2F2] dark:hover:bg-red-950/30">
              删除文稿
            </button>
          )}
          <button onClick={handleSaveManual} disabled={saving}
            className={cn('text-[12px] font-medium px-3 py-1.5 rounded-full transition-colors inline-flex items-center gap-1',
              saving ? 'bg-[#E5E7EB] dark:bg-white/[0.08] text-[#9CA3AF]' : 'bg-[#7C72F6] text-white hover:bg-[#6C63E6]')}>
            {saving && <Loader2 size={12} className="animate-spin" />}保存文稿
          </button>
        </div>
      </div>

      {/* 已保存的 AI 稿 */}
      {hasAiSaved && saved && (
        <SavedAiReview saved={saved} />
      )}

      {/* AI 生成 */}
      <div className="rounded-xl border border-[#F3F4F6] dark:border-white/[0.06] bg-white dark:bg-[#1e1e32] p-3.5 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Sparkles size={13} className="text-[#7C72F6]" />
          <label className="text-[11px] font-semibold text-[#6B7280] tracking-wide">AI 总结与复盘(可选)</label>
          <span className="flex-1" />
          {contextStatus?.prepared && contextStatus.sources_changed && (
            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-[#FFFBEB] dark:bg-amber-950/30 text-[#B45309] font-medium">
              <RefreshCcwDot size={11} />资料已有更新
            </span>
          )}
        </div>
        <p className="text-[11px] text-[#9CA3AF]">
          流程:准备资料(固定快照并预览实际来源) → 确认范围 → 生成 → 检查来源与编辑 → 保存。生成前不会发起任何模型请求;不配置模型也能手写与保存回顾。
        </p>

        {/* 步骤 1:准备 */}
        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 300))}
            placeholder="回顾重点(可选,至多 300 字)"
            className="flex-1 min-w-[200px] text-[12px] px-2.5 py-1.5 rounded-lg bg-[#F9FAFB] dark:bg-white/[0.03] border border-transparent focus:border-[#7C72F6] outline-none text-[#111827] dark:text-white/90 placeholder:text-[#9CA3AF]"
          />
          <button onClick={handlePrepare} disabled={preparing || generating}
            className="text-[12px] font-medium px-3 py-1.5 rounded-full border border-[#7C72F6]/40 text-[#7C72F6] hover:bg-[#7C72F6]/[0.06] disabled:opacity-50 inline-flex items-center gap-1">
            {preparing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {prepared ? '重新准备' : '准备资料'}
          </button>
        </div>

        {/* 步骤 2:来源预览 */}
        {prepared && (
          <PreparedPreview ctx={prepared} />
        )}

        {/* 步骤 3:生成 */}
        {prepared && !generating && session?.status !== 'done' && (
          <div className="flex items-center gap-2">
            <button onClick={handleGenerate}
              className="text-[12px] font-medium px-3 py-1.5 rounded-full bg-[#7C72F6] text-white hover:bg-[#6C63E6] inline-flex items-center gap-1">
              <Sparkles size={12} />生成回顾
            </button>
            <span className="text-[11px] text-[#9CA3AF]">同一范围同时只会有一个生成请求;离开页面再回来可接续。</span>
          </div>
        )}
        {generating && (
          <div className="flex items-center gap-2 text-[12px] text-[#6B7280]">
            <Loader2 size={13} className="animate-spin text-[#7C72F6]" />
            <span>已等待 {elapsed} 秒</span>
            {progressTail && <span className="text-[#9CA3AF] truncate max-w-[280px]">已生成 {progressTail.length} 字</span>}
            <span className="flex-1" />
            <button onClick={async () => {
              useReviewStore.getState().fail(scopeKey, '已取消');
              try {
                const db = await import('../lib/db');
                if (session?.requestId) await db.aiCancelRequest(session.requestId);
              } catch { /* 取消失败不影响本地状态 */ }
            }} className="text-[12px] px-2 py-1 rounded-lg text-[#9CA3AF] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06]">
              取消
            </button>
          </div>
        )}
        {session?.status === 'error' && (
          <p className="text-[12px] text-[#EF4444]">生成失败:{session.error};已保存稿与手写内容不受影响,可重试或继续手写。</p>
        )}

        {/* 步骤 4:结果编辑 */}
        {session?.status === 'done' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap text-[11px] text-[#9CA3AF]">
              <span>AI 内容 · 模型 {session.modelSnapshot}</span>
              <span>· 快照 {session.prepared_at.slice(0, 16)}</span>
              <span className="flex-1" />
              {contextStatus?.prepared && contextStatus.sources_changed && (
                <span className="text-[#B45309]">资料已有更新:可重新准备,或直接按此快照保存</span>
              )}
            </div>
            {SECTION_TITLES.map(({ key, label }) => (
              <div key={key}>
                <p className="text-[11px] font-semibold text-[#6B7280] mb-1.5">{label}</p>
                <div className="space-y-1.5">
                  {session.sections[key].length === 0 && <p className="text-[12px] text-[#9CA3AF]">(无)</p>}
                  {session.sections[key].map((item, index) => (
                    <div key={index} className="rounded-lg border border-[#F3F4F6] dark:border-white/[0.06] px-2.5 py-2 space-y-1.5">
                      <textarea
                        value={item.text}
                        onChange={(e) => useReviewStore.getState().setItemText(scopeKey, key, index, e.target.value)}
                        rows={2}
                        className="w-full text-[13px] bg-transparent outline-none resize-y text-[#111827] dark:text-white/90"
                      />
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {item.refs.map((ref) => {
                          const source = prepared?.sources.find((s) => s.ref_id === ref)
                            ?? saved?.source_status.find((s) => s.ref_id === ref);
                          return (
                            <span key={ref} title={source?.title ?? ref}
                              className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#7C72F6]/[0.08] text-[#7C72F6] font-medium">
                              {ref}
                            </span>
                          );
                        })}
                        <span className="flex-1" />
                        <button onClick={() => useReviewStore.getState().removeItem(scopeKey, key, index)}
                          className="text-[11px] text-[#9CA3AF] hover:text-[#EF4444] inline-flex items-center gap-0.5">
                          <X size={11} />移除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <button onClick={handleSaveAi} disabled={saving}
                className="text-[12px] font-medium px-3 py-1.5 rounded-full bg-[#7C72F6] text-white hover:bg-[#6C63E6] disabled:opacity-50 inline-flex items-center gap-1">
                {saving && <Loader2 size={12} className="animate-spin" />}保存 AI 回顾文稿
              </button>
              <button onClick={handleGenerate} className="text-[12px] px-2.5 py-1.5 rounded-full border border-[#E5E7EB] dark:border-white/[0.10] text-[#6B7280] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06]">
                重新生成
              </button>
              <span className="text-[11px] text-[#9CA3AF]">保存不会改动任何任务或今日安排;重新生成不会自动替换已保存稿。</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PreparedPreview({ ctx }: { ctx: PreparedReviewContext }) {
  const { totals } = ctx;
  return (
    <div className="rounded-lg bg-[#F9FAFB] dark:bg-white/[0.03] px-3 py-2.5 space-y-2">
      <div className="flex items-center gap-2 flex-wrap text-[11px]">
        <span className="font-medium text-[#6B7280]">将带入:</span>
        <span>任务分组 {totals.included_root_groups}/{totals.total_root_groups}</span>
        <span>子任务事实 {totals.included_subtask_facts}/{totals.total_subtask_facts}</span>
        <span>记录 {totals.included_records}/{totals.total_records}</span>
        {totals.truncated_records > 0 && (
          <span className="text-[#B45309]">单条截断 {totals.truncated_records} 条(全文仍在本机)</span>
        )}
        {(totals.total_root_groups > totals.included_root_groups || totals.total_records > totals.included_records) && (
          <span className="text-[#B45309]">存在遗漏:可缩小日期或标签范围后重新准备</span>
        )}
      </div>
      <div className="max-h-48 overflow-y-auto space-y-1.5">
        {ctx.groups.map((g) => (
          <div key={g.ref_id} className="text-[11px] text-[#6B7280]">
            <span className="font-medium text-[#7C72F6]">[{g.ref_id}]</span> {g.title}
            {[...g.root_facts, ...g.subtask_facts].map((f, i) => (
              <span key={f.ref_id + i} className="ml-2 text-[#9CA3AF]">
                {f.title}·{TRANSITION_LABELS[f.transition] ?? f.transition}({f.date})
              </span>
            ))}
          </div>
        ))}
        {ctx.records.map((r) => (
          <div key={r.ref_id} className="text-[11px] text-[#6B7280] truncate">
            <span className="font-medium text-[#7C72F6]">[{r.ref_id}]</span> {r.task_title}({r.record_date})
            {r.truncated && <span className="text-[#B45309]">(截断)</span>}: {r.excerpt.slice(0, 80)}
          </div>
        ))}
        {ctx.groups.length === 0 && ctx.records.length === 0 && (
          <p className="text-[11px] text-[#9CA3AF]">该范围内没有任何任务事实或进展记录;生成不会发送空请求,可直接手写回顾。</p>
        )}
      </div>
    </div>
  );
}

function SavedAiReview({ saved }: { saved: SavedReview }) {
  const sections = saved.ai_sections;
  if (!sections) return null;
  const unavailable = saved.source_status.filter((s) => !s.available);
  return (
    <div className="rounded-xl border border-[#F3F4F6] dark:border-white/[0.06] bg-white dark:bg-[#1e1e32] p-3.5 space-y-2.5">
      <div className="flex items-center gap-2 flex-wrap text-[11px] text-[#9CA3AF]">
        <Sparkles size={12} className="text-[#7C72F6]" />
        <span className="font-medium text-[#6B7280]">已保存的 AI 回顾</span>
        {saved.ai_model_snapshot && <span>· {saved.ai_model_snapshot}</span>}
        {saved.event_cutoff_at && <span>· 统计截止 {saved.event_cutoff_at.slice(0, 16)}</span>}
        {saved.prepared_at && <span>· 资料准备 {saved.prepared_at.slice(0, 16)}</span>}
        {saved.timezone_offset && <span>· UTC{saved.timezone_offset}</span>}
      </div>
      {saved.coverage_note && <p className="text-[11px] text-[#9CA3AF]">{saved.coverage_note}</p>}
      {unavailable.length > 0 && (
        <p className="text-[11px] text-[#B45309]">
          {unavailable.length} 个来源已不可用(记录或任务被删除):文稿保留,可自行编辑或删除。
        </p>
      )}
      {SECTION_TITLES.map(({ key, label }) => (
        <div key={key}>
          <p className="text-[11px] font-semibold text-[#6B7280] mb-1">{label}</p>
          <div className="space-y-1">
            {sections[key].length === 0 && <p className="text-[12px] text-[#9CA3AF]">(无)</p>}
            {sections[key].map((item, i) => (
              <div key={i} className="text-[13px] text-[#111827] dark:text-white/90">
                <span className="text-[#111827] dark:text-white/90">{item.text}</span>
                <span className="ml-1.5 text-[10px] text-[#7C72F6]">{item.refs.join(' ')}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return '操作失败,请稍后重试';
}
