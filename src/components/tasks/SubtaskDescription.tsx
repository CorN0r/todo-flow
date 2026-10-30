import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { stripHtml } from '../../lib/html';
import { useUpdateTask } from '../../hooks/useTasks';

/**
 * 子任务描述:展示态为标题下方单行截断预览,点击展开纯文本 textarea 编辑。
 * editing 提升到父级,便于联动禁用拖拽/隐藏行尾 chips/与标题编辑互斥。
 * 数据约定:子任务 description 存纯文本(AI 拆解写入的即纯文本);预览经 stripHtml 兼容历史 HTML。
 */
export function SubtaskDescription({ taskId, description, editing, onEditingChange }: {
  taskId: string;
  description: string;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
}) {
  const updateTask = useUpdateTask();
  const [val, setVal] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const descriptionRef = useRef(description);
  useEffect(() => { descriptionRef.current = description; }, [description]);

  // 进入编辑态:以纯文本为初值,聚焦、光标置尾、按内容自适应高度
  useEffect(() => {
    if (!editing) return;
    setVal(stripHtml(descriptionRef.current));
    setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }, 0);
  }, [editing]);

  const commit = () => {
    const next = val.trim();
    if (next !== stripHtml(descriptionRef.current)) {
      updateTask.mutate({ id: taskId, description: next }, { onError: () => toast.error('描述保存失败,请重试') });
    }
    onEditingChange(false);
  };

  if (!editing) {
    const text = stripHtml(description);
    if (!text) return null;
    return (
      <p className="text-[12px] text-[#9CA3AF] truncate cursor-text" onClick={() => onEditingChange(true)} title="点击编辑描述">
        {text}
      </p>
    );
  }

  return (
    <textarea
      ref={ref}
      value={val}
      onChange={(e) => {
        setVal(e.target.value);
        e.target.style.height = 'auto';
        e.target.style.height = `${e.target.scrollHeight}px`;
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') { setVal(stripHtml(descriptionRef.current)); onEditingChange(false); }
      }}
      placeholder="添加执行说明..."
      rows={1}
      className="w-full text-[12px] px-1.5 py-1 rounded bg-[#F3F4F6] dark:bg-white/[0.08] outline-none ring-1 ring-[#7C72F6]/40 text-[#111827] dark:text-white/80 placeholder:text-[#9CA3AF] resize-none overflow-hidden"
    />
  );
}
