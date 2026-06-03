import { useState, useMemo, useRef } from 'react';
import { Portal } from '../shared/Portal';
import { Plus, Tag, Flag, X, ChevronDown } from 'lucide-react';
import { useCreateTask } from '../../hooks/useTasks';
import { useTags } from '../../hooks/useTags';

import { DatePicker } from '../shared/DatePicker';
import { priorityColors, priorityLabels, PRIORITY_HEX } from '../../lib/priority';
import { parseTaskTitle, matchTagName } from '../../lib/nlp';
import { formatDate, todayISO } from '../../lib/date';

interface TaskQuickAddProps {
  tagId?: string;
  parentTaskId?: string;
  placeholder?: string;
  defaultDueDate?: string;
  defaultMyDay?: string;
  onCancel?: () => void;
  onCreated?: () => void;
}

export function TaskQuickAdd({ tagId, parentTaskId, placeholder = '添加任务...', defaultDueDate, defaultMyDay, onCancel, onCreated }: TaskQuickAddProps) {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState(defaultDueDate || (parentTaskId ? '' : todayISO()));
  const [selectedTagId, setSelectedTagId] = useState(tagId || '');
  const [priority, setPriority] = useState(0);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);
  const createTask = useCreateTask();
  const tagBtnRef = useRef<HTMLButtonElement>(null);
  const priorityBtnRef = useRef<HTMLButtonElement>(null);
  const { data: tags } = useTags();

  const nlp = useMemo(() => parseTaskTitle(title), [title]);

  const nlpTagId = useMemo(() => {
    if (!nlp.tagName || !tags) return undefined;
    return matchTagName(nlp.tagName, tags);
  }, [nlp.tagName, tags]);

  const nlpHint = nlp.dueDate || nlp.priority != null || nlp.recurrence || nlp.tagName
    ? { date: nlp.dueDate, priority: nlp.priority, recurrence: nlp.recurrence, tagName: nlp.tagName }
    : null;

  const effectiveTitle = nlp.title || title;
  const effectiveDueDate = dueDate || nlp.dueDate || '';
  const effectiveTagId = selectedTagId || nlpTagId || tagId || '';
  const effectivePriority = priority > 0 ? priority : (nlp.priority ?? 0);

  const handleSubmit = () => {
    const finalTitle = effectiveTitle.trim();
    if (!finalTitle) return;
    createTask.mutate({
      title: finalTitle,
      tag_id: effectiveTagId || undefined,
      parent_task_id: parentTaskId,
      due_date: effectiveDueDate || undefined,
      priority: effectivePriority > 0 ? effectivePriority : undefined,
      recurrence: nlp.recurrence || undefined,
      reminder: nlp.reminder || undefined,
      my_day_date: defaultMyDay,
    }, {
      onSuccess: () => {
        setTitle('');
        setDueDate('');
        onCreated?.();
      },
    });
  };

  const handleCancel = () => {
    setTitle('');
    setDueDate('');
    onCancel?.();
  };

  return (
    <div className="flex flex-col rounded-xl bg-white dark:bg-[#1e1e32] shadow-[0px_2px_8px_0px_rgba(124,114,246,0.08)]"
      style={{ border: '1.5px solid rgba(124, 114, 246, 0.25)' }}>
      <div className="flex items-center" style={{ height: '56px', padding: '0px 16px', gap: '10px' }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); } if (e.key === 'Escape') handleCancel(); }}
          placeholder={placeholder}
          autoFocus
          className="flex-1 min-w-[100px] bg-transparent text-[14px] outline-none placeholder:text-[#9CA3AF] text-[#111827] dark:text-white/90"
        />

        {/* Date picker */}
        <DatePicker value={dueDate} onChange={setDueDate} />

      {/* Tag button + picker */}
      {tags && tags.length > 0 && (
        <div className="relative">
          <button
            ref={tagBtnRef}
            onClick={() => { setShowTagPicker(!showTagPicker); setShowPriorityPicker(false); }}
            className={`flex items-center shrink-0 rounded-md transition-colors relative ${effectiveTagId ? 'bg-[#7C72F6]/[0.06] text-[#7C72F6]' : 'bg-[#F3F4F6] dark:bg-white/[0.06] text-[#6B7280] hover:bg-[#E5E7EB] dark:hover:bg-white/[0.1]'}`}
            style={{ height: '28px', padding: '0px 8px', gap: '4px' }}
          >
            <Tag size={13} />
            <span className="text-[12px] font-medium">
              {effectiveTagId ? tags.find((t) => t.id === effectiveTagId)?.name || '标签' : '标签'}
            </span>
            <ChevronDown size={10} />
          </button>
          {showTagPicker && (
            <Portal>
              <div className="fixed inset-0 z-40" onClick={() => setShowTagPicker(false)} aria-hidden="true" />
              <div
                className="fixed z-50 bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.07] rounded-xl shadow-xl py-1 min-w-[150px]"
                style={{
                  top: (tagBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
                  left: tagBtnRef.current?.getBoundingClientRect().left ?? 0,
                }}
              >
                <button onClick={() => { setSelectedTagId(''); setShowTagPicker(false); }}
                  className={`w-full text-left px-3 py-1.5 text-[13px] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] ${!effectiveTagId ? 'text-[#7C72F6] font-medium' : 'text-[#111827] dark:text-white/90'}`}>
                  无标签
                </button>
                {tags.map((t) => (
                  <button key={t.id} onClick={() => { setSelectedTagId(t.id); setShowTagPicker(false); }}
                    className={`w-full text-left px-3 py-1.5 text-[13px] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] flex items-center gap-2 ${effectiveTagId === t.id ? 'text-[#7C72F6] font-medium' : 'text-[#111827] dark:text-white/90'}`}>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                    {t.name}
                  </button>
                ))}
              </div>
            </Portal>
          )}
        </div>
      )}

      {/* Priority button + picker */}
      <div className="relative">
        <button
          ref={priorityBtnRef}
          onClick={() => { setShowPriorityPicker(!showPriorityPicker); setShowTagPicker(false); }}
          className={`flex items-center shrink-0 rounded-md transition-colors ${effectivePriority > 0 ? 'bg-[#7C72F6]/[0.06]' : 'bg-[#F3F4F6] dark:bg-white/[0.06] hover:bg-[#E5E7EB] dark:hover:bg-white/[0.1]'}`}
          style={{ height: '28px', padding: '0px 8px', gap: '4px' }}
        >
          <Flag size={13} className={priorityColors[effectivePriority]} />
          <span className={`text-[12px] font-medium ${priorityColors[effectivePriority]}`}>{priorityLabels[effectivePriority]}</span>
          <ChevronDown size={10} />
        </button>
        {showPriorityPicker && (
          <Portal>
            <div className="fixed inset-0 z-40" onClick={() => setShowPriorityPicker(false)} aria-hidden="true" />
            <div
              className="fixed z-50 bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.07] rounded-xl shadow-xl py-1 min-w-[120px]"
              style={{
                top: (priorityBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
                left: (priorityBtnRef.current?.getBoundingClientRect().left ?? 0),
              }}
            >
              {Object.entries(priorityLabels).map(([k, v]) => (
                <button key={k} onClick={() => { setPriority(Number(k)); setShowPriorityPicker(false); }}
                  className={`w-full text-left px-3 py-1.5 text-[13px] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] flex items-center gap-2 ${effectivePriority === Number(k) ? 'font-medium' : 'text-[#111827] dark:text-white/90'}`}>
                  <Flag size={13} className={priorityColors[Number(k)]} />
                  <span className={priorityColors[Number(k)]}>{v}</span>
                </button>
              ))}
            </div>
          </Portal>
        )}
      </div>

      {/* Submit button */}
      <button onClick={handleSubmit} disabled={!effectiveTitle.trim()}
        className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-[#7C72F6] text-white hover:bg-[#6C63E6] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        aria-label="创建任务">
        <Plus size={14} style={{ strokeWidth: 2.5 }} />
      </button>

      {/* Cancel button */}
      {onCancel && (
        <button onClick={handleCancel} className="shrink-0 p-1 rounded-md hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] transition-colors" aria-label="Cancel">
          <X size={14} className="text-[#6B7280]" />
        </button>
      )}
      </div>

      {/* NLP hint */}
      {nlpHint && (
        <div className="flex items-center gap-2 px-4 pb-2.5" style={{ paddingLeft: '54px' }}>
          {nlpHint.date && (
            <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md bg-[#7C72F6]/[0.08] text-[#7C72F6] font-medium">
              {formatDate(nlpHint.date)}
              {nlp.reminder && ` ${nlp.reminder.slice(11, 16)}`}
            </span>
          )}
          {nlpHint.priority != null && (
            <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md font-medium border border-current/20"
              style={{ color: PRIORITY_HEX[nlpHint.priority] }}>
              <Flag size={10} />
              {priorityLabels[nlpHint.priority]}
            </span>
          )}
          {nlpHint.recurrence && (
            <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md bg-[#F59E0B]/[0.08] text-[#F59E0B] font-medium">
              {nlpHint.recurrence.includes('daily') ? '每天' : nlpHint.recurrence.includes('weekly') ? '每周' : nlpHint.recurrence.includes('monthly') ? '每月' : '每年'}
            </span>
          )}
          {nlpHint.tagName && (
            <span className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md font-medium ${nlpTagId ? 'bg-[#7C72F6]/[0.08] text-[#7C72F6]' : 'bg-[#EF4444]/[0.08] text-[#EF4444]'}`}>
              #{nlpHint.tagName}{!nlpTagId ? ' ?' : ''}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
