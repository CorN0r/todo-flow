import { useEffect, useMemo, useState } from 'react';
import { Pencil, Trash2, X, Check, MessageSquareText, History, ChevronLeft, ChevronRight, CornerDownRight } from 'lucide-react';

import { cn } from '../../../lib/cn';
import { todayISO, formatLocalTime } from '../../../lib/date';
import { useProgressDraftStore } from '../../../stores/progressDraftStore';
import {
  useCreateProgressRecord,
  useDeleteProgressRecord,
  useProgressEvents,
  useProgressRecords,
  useUpdateProgressRecord,
} from '../../../hooks/useProgress';
import { TRANSITION_LABELS, SOURCE_LABELS } from '../../../types/progress';
import type { ProgressRecord } from '../../../types/progress';

const MAX_CONTENT_CHARS = 2000;

/**
 * 任务详情「进展记录」页签:主动输入 + 分页时间线。
 * 完全自愿:不自动展开、不自动聚焦、不影响任务操作;草稿按任务保留在会话内。
 */
export function ProgressTab({ taskId }: { taskId: string }) {
  const today = todayISO();
  const draft = useProgressDraftStore((s) => s.drafts[taskId]);
  const setDraft = useProgressDraftStore((s) => s.setDraft);
  const clearDraft = useProgressDraftStore((s) => s.clearDraft);
  const renewOperationId = useProgressDraftStore((s) => s.renewOperationId);

  // 草稿不存在时初始化(默认今天);ensureDraft 有副作用,不能放在 selector 里
  useEffect(() => {
    useProgressDraftStore.getState().ensureDraft(taskId, todayISO());
  }, [taskId]);

  const createRecord = useCreateProgressRecord();
  const updateRecord = useUpdateProgressRecord();
  const deleteRecord = useDeleteProgressRecord();

  const [includeChildren, setIncludeChildren] = useState(false);
  const [view, setView] = useState<'records' | 'events'>('records');
  // 分页与筛选成对保存:筛选变化时派生回到第一页(不在 effect 里 setState)
  const filterKey = `${includeChildren ? 1 : 0}|${view}`;
  const [pageState, setPageState] = useState<{ key: string; page: number }>({ key: '', page: 1 });
  const page = pageState.key === filterKey ? pageState.page : 1;
  const setPage = (next: number | ((prev: number) => number)) =>
    setPageState((prev) => ({
      key: filterKey,
      page: typeof next === 'function' ? next(prev.key === filterKey ? prev.page : 1) : next,
    }));

  const recordsQuery = useProgressRecords(taskId, includeChildren, view === 'records' ? page : 1);
  const eventsQuery = useProgressEvents(taskId, includeChildren, view === 'events' ? page : 1);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const charCount = (draft?.content ?? '').trim().length;
  const canSave = charCount > 0 && charCount <= MAX_CONTENT_CHARS && !createRecord.isPending;

  const handleSave = () => {
    if (!canSave || !draft) return;
    createRecord.mutate(
      {
        taskId,
        content: draft.content,
        recordDate: draft.recordDate,
        operationId: draft.operationId,
      },
      {
        onSuccess: () => clearDraft(taskId),
        onError: () => renewOperationId(taskId),
      },
    );
  };

  const records = recordsQuery.data;
  const events = eventsQuery.data;
  const activePage = view === 'records' ? records : events;
  const totalPages = activePage ? Math.max(1, Math.ceil(activePage.total / activePage.page_size)) : 1;

  return (
    <div className="space-y-4">
      {/* ── 输入区 ── */}
      <div className="rounded-xl border border-[#F3F4F6] dark:border-white/[0.06] bg-white dark:bg-[#1e1e32] p-3 space-y-2">
        <textarea
          value={draft?.content ?? ''}
          onChange={(e) => setDraft(taskId, { content: e.target.value.slice(0, MAX_CONTENT_CHARS * 2) })}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleSave(); }
          }}
          rows={3}
          placeholder="随手记一句进展,例如:初稿完成,成本数据还在等同事回复"
          className="w-full text-[13px] px-3 py-2 rounded-lg bg-[#F9FAFB] dark:bg-white/[0.03] border border-transparent focus:border-[#7C72F6] outline-none resize-y text-[#111827] dark:text-white/90 placeholder:text-[#9CA3AF]"
        />
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-1.5 text-[12px] text-[#6B7280]">
            记录日期
            <input
              type="date"
              value={draft?.recordDate ?? today}
              max={today}
              onChange={(e) => setDraft(taskId, { recordDate: e.target.value || today })}
              className="text-[12px] px-2 py-1 rounded-md border border-[#E5E7EB] dark:border-white/[0.10] bg-transparent text-[#111827] dark:text-white/90 outline-none focus:border-[#7C72F6]"
            />
          </label>
          <span className={cn('text-[11px]', charCount > MAX_CONTENT_CHARS ? 'text-[#EF4444] font-medium' : 'text-[#9CA3AF]')}>
            {charCount > 0 ? `${draft.content.trim().length}/${MAX_CONTENT_CHARS}` : `至多 ${MAX_CONTENT_CHARS} 字`}
          </span>
          <span className="flex-1" />
          <span className="text-[11px] text-[#9CA3AF]">保存后进入历史</span>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className={cn('inline-flex items-center gap-1 text-[12px] font-medium px-3 py-1.5 rounded-full transition-colors',
              canSave ? 'bg-[#7C72F6] text-white hover:bg-[#6C63E6]' : 'bg-[#F3F4F6] dark:bg-white/[0.06] text-[#9CA3AF] cursor-not-allowed')}
          >
            <Check size={13} />保存进展
          </button>
        </div>
        <p className="text-[11px] text-[#9CA3AF]">Enter 换行,Ctrl+Enter 保存;日期可选过去补记。记录完全自愿,不填写不影响任何功能。</p>
      </div>

      {/* ── 筛选 ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex rounded-full bg-[#F3F4F6] dark:bg-white/[0.06] p-0.5">
          <button onClick={() => setView('records')}
            className={cn('inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-1 rounded-full transition-colors',
              view === 'records' ? 'bg-white dark:bg-[#1e1e32] text-[#7C72F6] shadow-sm' : 'text-[#6B7280] hover:text-[#111827] dark:hover:text-white/80')}>
            <MessageSquareText size={12} />手写记录
          </button>
          <button onClick={() => setView('events')}
            className={cn('inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-1 rounded-full transition-colors',
              view === 'events' ? 'bg-white dark:bg-[#1e1e32] text-[#7C72F6] shadow-sm' : 'text-[#6B7280] hover:text-[#111827] dark:hover:text-white/80')}>
            <History size={12} />状态事件
          </button>
        </div>
        <label className="inline-flex items-center gap-1.5 text-[12px] text-[#6B7280] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeChildren}
            onChange={(e) => setIncludeChildren(e.target.checked)}
            className="accent-[#7C72F6] w-3.5 h-3.5"
          />
          含子任务
        </label>
      </div>

      {/* ── 时间线 ── */}
      {view === 'records' ? (
        <RecordsTimeline
          query={recordsQuery}
          editingId={editingId}
          editContent={editContent}
          onEditStart={(record) => { setEditingId(record.id); setEditContent(record.content); }}
          onEditContent={setEditContent}
          onEditCancel={() => setEditingId(null)}
          onEditSave={(record) => {
            updateRecord.mutate(
              { recordId: record.id, content: editContent, recordDate: record.record_date, expectedVersion: record.version, operationId: `edit-${record.id}-${Date.now()}` },
              { onSuccess: () => setEditingId(null) },
            );
          }}
          confirmDeleteId={confirmDeleteId}
          onAskDelete={(id) => setConfirmDeleteId(id)}
          onCancelDelete={() => setConfirmDeleteId(null)}
          onConfirmDelete={(record) => {
            deleteRecord.mutate(
              { recordId: record.id, expectedVersion: record.version, taskId: record.task_id },
              { onSuccess: () => setConfirmDeleteId(null) },
            );
          }}
          updating={updateRecord.isPending}
          deleting={deleteRecord.isPending}
        />
      ) : (
        <EventsTimeline query={eventsQuery} />
      )}

      {/* ── 分页 ── */}
      {activePage && activePage.total > activePage.page_size && (
        <div className="flex items-center justify-center gap-3 text-[12px] text-[#6B7280]">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
            className="p-1 rounded hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed" aria-label="上一页">
            <ChevronLeft size={14} />
          </button>
          <span>第 {page} / {totalPages} 页 · 共 {activePage.total} 条</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            className="p-1 rounded hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed" aria-label="下一页">
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function backfillBadge(record: ProgressRecord): boolean {
  // 补记:记录日期早于创建日期(创建时间格式 YYYY-MM-DD HH:MM:SS)
  return record.record_date < record.created_at.slice(0, 10);
}

function RecordsTimeline({
  query, editingId, editContent, onEditStart, onEditContent, onEditCancel, onEditSave,
  confirmDeleteId, onAskDelete, onCancelDelete, onConfirmDelete, updating, deleting,
}: {
  query: ReturnType<typeof useProgressRecords>;
  editingId: string | null;
  editContent: string;
  onEditStart: (record: ProgressRecord) => void;
  onEditContent: (content: string) => void;
  onEditCancel: () => void;
  onEditSave: (record: ProgressRecord) => void;
  confirmDeleteId: string | null;
  onAskDelete: (id: string) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (record: ProgressRecord) => void;
  updating: boolean;
  deleting: boolean;
}) {
  const items = useMemo(() => query.data?.items ?? [], [query.data]);

  if (query.isLoading) {
    return <p className="text-[12px] text-[#9CA3AF] text-center py-4">加载中…</p>;
  }
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[#E5E7EB] dark:border-white/[0.08] py-6 text-center">
        <p className="text-[12px] text-[#9CA3AF]">还没有手写进展;不记录也完全不影响任务使用。</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((record) => (
        <div key={record.id}
          className="rounded-xl border border-[#F3F4F6] dark:border-white/[0.06] bg-white dark:bg-[#1e1e32] px-3 py-2.5">
          <div className="flex items-center gap-2 text-[11px] text-[#9CA3AF] mb-1.5 flex-wrap">
            <span className="font-medium text-[#6B7280]">{record.record_date}</span>
            {backfillBadge(record) && (
              <span className="px-1.5 py-0.5 rounded-full bg-[#FFFBEB] dark:bg-amber-950/30 text-[#F59E0B] font-medium">补记</span>
            )}
            {record.is_subtask && (
              <span className="inline-flex items-center gap-0.5 text-[#7C72F6]">
                <CornerDownRight size={11} />
                {record.task_deleted ? '子任务(已删除)' : `子任务 · ${record.task_title ?? ''}`}
              </span>
            )}
            {!record.is_subtask && record.task_deleted && <span>任务已删除</span>}
            <span className="flex-1" />
            <span>记录于 {formatLocalTime(record.created_at)}</span>
            {editingId !== record.id && (
              <>
                <button onClick={() => onEditStart(record)} title="编辑"
                  className="p-1 rounded text-[#9CA3AF] hover:text-[#7C72F6] hover:bg-[#7C72F6]/[0.06]">
                  <Pencil size={12} />
                </button>
                {confirmDeleteId === record.id ? (
                  <span className="inline-flex items-center gap-1">
                    <button onClick={() => onConfirmDelete(record)} disabled={deleting}
                      className="text-[11px] px-1.5 py-0.5 rounded bg-[#EF4444] text-white hover:bg-red-600 disabled:opacity-50">
                      {deleting ? '删除中' : '确认删除'}
                    </button>
                    <button onClick={onCancelDelete} className="text-[11px] px-1.5 py-0.5 rounded text-[#6B7280] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06]">
                      取消
                    </button>
                  </span>
                ) : (
                  <button onClick={() => onAskDelete(record.id)} title="删除"
                    className="p-1 rounded text-[#9CA3AF] hover:text-[#EF4444] hover:bg-[#EF4444]/[0.06]">
                    <Trash2 size={12} />
                  </button>
                )}
              </>
            )}
          </div>
          {editingId === record.id ? (
            <div className="space-y-1.5">
              <textarea
                value={editContent}
                onChange={(e) => onEditContent(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); onEditSave(record); }
                }}
                rows={3}
                autoFocus
                className="w-full text-[13px] px-2.5 py-1.5 rounded-lg bg-[#F9FAFB] dark:bg-white/[0.03] border border-[#7C72F6]/40 outline-none resize-y text-[#111827] dark:text-white/90"
              />
              <div className="flex items-center gap-2">
                <span className={cn('text-[11px]', editContent.trim().length > MAX_CONTENT_CHARS ? 'text-[#EF4444]' : 'text-[#9CA3AF]')}>
                  {editContent.trim().length}/{MAX_CONTENT_CHARS}
                </span>
                <span className="flex-1" />
                <button onClick={onEditCancel} className="text-[12px] px-2 py-1 rounded-lg text-[#6B7280] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] inline-flex items-center gap-1">
                  <X size={12} />取消
                </button>
                <button onClick={() => onEditSave(record)} disabled={updating || !editContent.trim() || editContent.trim().length > MAX_CONTENT_CHARS}
                  className="text-[12px] px-2.5 py-1 rounded-lg bg-[#7C72F6] text-white hover:bg-[#6C63E6] disabled:opacity-40 inline-flex items-center gap-1">
                  <Check size={12} />{updating ? '保存中' : '保存修改'}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-[#111827] dark:text-white/90 whitespace-pre-wrap break-words">{record.content}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function EventsTimeline({ query }: { query: ReturnType<typeof useProgressEvents> }) {
  const items = query.data?.items ?? [];
  if (query.isLoading) {
    return <p className="text-[12px] text-[#9CA3AF] text-center py-4">加载中…</p>;
  }
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[#E5E7EB] dark:border-white/[0.08] py-6 text-center">
        <p className="text-[12px] text-[#9CA3AF]">暂无本机状态事件(完成、重开、挂起等操作会自动留痕)。</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((event) => (
        <div key={event.id}
          className="flex items-center gap-2.5 rounded-xl border border-[#F3F4F6] dark:border-white/[0.06] bg-white dark:bg-[#1e1e32] px-3 py-2">
          <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0',
            event.transition === 'complete' ? 'bg-[#10B981]' : event.transition === 'reopen' ? 'bg-[#F59E0B]' : 'bg-[#9CA3AF]')} />
          <div className="flex-1 min-w-0">
            <p className={cn('text-[13px] truncate', event.task_deleted ? 'text-[#9CA3AF]' : 'text-[#111827] dark:text-white/90')}>
              {event.task_deleted ? `${event.title_snapshot}(任务已删除)` : event.title_snapshot}
              {event.task_id !== event.root_task_id && <span className="text-[#7C72F6]"> · 子任务</span>}
            </p>
            <p className="text-[11px] text-[#9CA3AF]">
              {event.occurred_at.slice(0, 16)} · {SOURCE_LABELS[event.source] ?? event.source}
            </p>
          </div>
          <span className="text-[12px] font-medium text-[#6B7280] flex-shrink-0">
            {TRANSITION_LABELS[event.transition] ?? event.transition}
          </span>
        </div>
      ))}
    </div>
  );
}
