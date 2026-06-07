import { useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Portal } from '../shared/Portal';
import { Plus, Tag, Flag, X, Bell } from 'lucide-react';
import { useCreateTask, useCreateTaskReminder } from '../../hooks/useTasks';
import { useTags } from '../../hooks/useTags';

import { DatePicker } from '../shared/DatePicker';
import { RecurrencePicker } from '../shared/RecurrencePicker';
import { priorityColors, priorityLabels, PRIORITY_HEX } from '../../lib/priority';
import { parseTaskTitle, matchTagName } from '../../lib/nlp';
import { todayISO, getReminderPresets, getReminderLabel } from '../../lib/date';

interface TaskQuickAddProps {
  tagId?: string;
  parentTaskId?: string;
  placeholder?: string;
  defaultDueDate?: string;
  defaultMyDay?: string;
  onCancel?: () => void;
  onCreated?: () => void;
}

function ChipBtn({ active, activeClass, activeStyle, icon, label, onClear, onClick, title }: {
  active: boolean;
  activeClass?: string;
  activeStyle?: React.CSSProperties;
  icon: React.ReactNode;
  label: string;
  onClear: () => void;
  onClick: () => void;
  title: string;
}) {
  if (active) {
    return (
      <div onClick={onClick}
        className={(activeClass || 'inline-flex items-center gap-1 text-[12px] px-2 py-1 rounded-full font-medium') + ' cursor-pointer hover:opacity-80 transition-opacity'}
        style={activeStyle}>
        {icon}
        <span className="truncate max-w-[90px]">{label}</span>
        <button onClick={(e) => { e.stopPropagation(); onClear(); }}
          className="shrink-0 opacity-60 hover:opacity-100 transition-opacity">
          <X size={12} />
        </button>
      </div>
    );
  }
  return (
    <button onClick={onClick}
      className="flex items-center justify-center shrink-0 rounded-full bg-[#F3F4F6] dark:bg-white/[0.06] text-[#6B7280] hover:bg-[#E5E7EB] dark:hover:bg-white/[0.1] transition-colors"
      style={{ width: 28, height: 28 }}
      title={title}>
      {icon}
    </button>
  );
}

export function TaskQuickAdd({ tagId, parentTaskId, placeholder = '添加任务...', defaultDueDate, defaultMyDay, onCancel, onCreated }: TaskQuickAddProps) {
  const { t: _t } = useTranslation();
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState(defaultDueDate || (parentTaskId ? '' : todayISO()));
  const [selectedTagId, setSelectedTagId] = useState(tagId || '');
  const [priority, setPriority] = useState(0);
  const [recurrence, setRecurrence] = useState('');
  const [reminderOffset, setReminderOffset] = useState('');
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const createTask = useCreateTask();
  const createReminder = useCreateTaskReminder();
  const tagBtnRef = useRef<HTMLDivElement>(null);
  const priorityBtnRef = useRef<HTMLDivElement>(null);
  const reminderBtnRef = useRef<HTMLDivElement>(null);
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
  const effectiveRecurrence = recurrence || nlp.recurrence || '';
  const effectiveReminder = reminderOffset || nlp.reminder || '';

  const selectedTag = tags?.find((t) => t.id === effectiveTagId);

  const closeAll = () => { setShowTagPicker(false); setShowPriorityPicker(false); setShowReminderPicker(false); };

  const handleSubmit = () => {
    const finalTitle = effectiveTitle.trim();
    if (!finalTitle) return;
    createTask.mutate({
      title: finalTitle,
      tag_id: effectiveTagId || undefined,
      parent_task_id: parentTaskId,
      due_date: effectiveDueDate || undefined,
      priority: effectivePriority > 0 ? effectivePriority : undefined,
      recurrence: effectiveRecurrence || undefined,
      reminder: effectiveReminder || undefined,
      my_day_date: defaultMyDay,
    }, {
      onSuccess: (task) => {
        if (reminderOffset && task.id) {
          createReminder.mutate({ taskId: task.id, offset: reminderOffset, dueDate: effectiveDueDate || undefined });
        }
        setTitle('');
        setDueDate('');
        setRecurrence('');
        setReminderOffset('');
        onCreated?.();
      },
    });
  };

  const handleCancel = () => {
    setTitle('');
    setDueDate('');
    setRecurrence('');
    setReminderOffset('');
    onCancel?.();
  };

  return (
    <div className="flex flex-col rounded-xl bg-white dark:bg-[#1e1e32] shadow-[0px_2px_8px_0px_rgba(124,114,246,0.08)]"
      style={{ border: '1.5px solid rgba(124, 114, 246, 0.25)' }}>
      <div className="flex items-center" style={{ height: '56px', padding: '0px 10px', gap: '6px' }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); } if (e.key === 'Escape') handleCancel(); }}
          placeholder={placeholder}
          autoFocus
          className="flex-1 min-w-[80px] bg-transparent text-[14px] outline-none placeholder:text-[#9CA3AF] text-[#111827] dark:text-white/90"
        />

        {/* Date */}
        <DatePicker value={dueDate} onChange={setDueDate} showTime iconOnly />

        {/* Reminder */}
        <div className="relative" ref={reminderBtnRef}>
          <ChipBtn
            active={!!reminderOffset}
            activeClass="inline-flex items-center gap-1 text-[12px] px-2 py-1 rounded-full font-medium bg-[#7C72F6]/[0.10] text-[#7C72F6]"
            icon={<Bell size={12} />}
            label={getReminderLabel(reminderOffset)}
            onClear={() => setReminderOffset('')}
            onClick={() => { closeAll(); setShowReminderPicker(true); }}
            title="提醒"
          />
          {showReminderPicker && (
            <Portal>
              <div className="fixed inset-0 z-40" onClick={() => setShowReminderPicker(false)} aria-hidden="true" />
              <div className="fixed z-50 bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.07] rounded-xl shadow-xl py-1 min-w-[130px]"
                style={{ top: (reminderBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4, left: reminderBtnRef.current?.getBoundingClientRect().left ?? 0 }}>
                {Object.entries(getReminderPresets()).map(([key, { label }]) => (
                  <button key={key} onClick={() => { setReminderOffset(key); setShowReminderPicker(false); }}
                    className={`w-full text-left px-3 py-1.5 text-[13px] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors ${reminderOffset === key ? 'text-[#7C72F6] font-medium' : 'text-[#111827] dark:text-white/90'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </Portal>
          )}
        </div>

        {/* Priority */}
        <div className="relative" ref={priorityBtnRef}>
          <ChipBtn
            active={effectivePriority > 0}
            activeClass="inline-flex items-center gap-1 text-[12px] px-2 py-1 rounded-full font-medium"
            activeStyle={{ backgroundColor: PRIORITY_HEX[effectivePriority] + '18', color: PRIORITY_HEX[effectivePriority] }}
            icon={<Flag size={12} />}
            label={priorityLabels[effectivePriority]}
            onClear={() => setPriority(0)}
            onClick={() => { closeAll(); setShowPriorityPicker(true); }}
            title={priorityLabels[effectivePriority]}
          />
          {showPriorityPicker && (
            <Portal>
              <div className="fixed inset-0 z-40" onClick={() => setShowPriorityPicker(false)} aria-hidden="true" />
              <div className="fixed z-50 bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.07] rounded-xl shadow-xl py-1 min-w-[120px]"
                style={{ top: (priorityBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4, left: priorityBtnRef.current?.getBoundingClientRect().left ?? 0 }}>
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

        {/* Tag */}
        {tags && tags.length > 0 && (
          <div className="relative" ref={tagBtnRef}>
            <ChipBtn
              active={!!selectedTagId}
              activeClass="inline-flex items-center gap-1 text-[12px] px-2 py-1 rounded-full font-medium"
              activeStyle={{ backgroundColor: (selectedTag?.color || '#7C72F6') + '20', color: selectedTag?.color }}
              icon={<Tag size={12} />}
              label={selectedTag?.name || ''}
              onClear={() => setSelectedTagId('')}
              onClick={() => { closeAll(); setShowTagPicker(true); }}
              title="标签"
            />
            {showTagPicker && (
              <Portal>
                <div className="fixed inset-0 z-40" onClick={() => setShowTagPicker(false)} aria-hidden="true" />
                <div className="fixed z-50 bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.07] rounded-xl shadow-xl py-1 min-w-[150px]"
                  style={{ top: (tagBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4, left: tagBtnRef.current?.getBoundingClientRect().left ?? 0 }}>
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

        {/* Recurrence */}
        <RecurrencePicker value={recurrence} onChange={setRecurrence} iconOnly />

        {/* Submit */}
        <button onClick={handleSubmit} disabled={!effectiveTitle.trim()}
          className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-[#7C72F6] text-white hover:bg-[#6C63E6] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          aria-label="创建任务">
          <Plus size={14} style={{ strokeWidth: 2.5 }} />
        </button>

        {/* Cancel */}
        {onCancel && (
          <button onClick={handleCancel} className="shrink-0 p-1 rounded-md hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] transition-colors" aria-label="Cancel">
            <X size={14} className="text-[#6B7280]" />
          </button>
        )}
      </div>

      {/* NLP hints */}
      {nlpHint && (
        <div className="flex items-center gap-2 px-4 pb-2.5" style={{ paddingLeft: '54px' }}>
          {nlpHint.date && (
            <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md bg-[#7C72F6]/[0.08] text-[#7C72F6] font-medium">日期: {nlpHint.date}</span>
          )}
          {nlpHint.priority != null && (
            <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md font-medium border border-current/20" style={{ color: PRIORITY_HEX[nlpHint.priority] }}>
              <Flag size={12} />{priorityLabels[nlpHint.priority]}
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
