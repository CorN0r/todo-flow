import type { Task } from '../types/task';

/** "建议"列表最多直接展示的条数，超出部分通过"展开全部"查看 */
export const SUGGESTION_COLLAPSED_COUNT = 6;

/**
 * 我的一天"建议"推荐规则（与 MyDayPage 查询条件对应）：
 * 候选集由查询保证为「未完成且截止日期 ≤ 今天」的任务，此处再过滤掉
 * 已加入我的一天、子任务、已暂停、已放弃、本次会话点了"暂不"的任务。
 * 排序：优先级高的在前（无优先级排最后），同优先级按截止日期近的在前。
 */
export function buildSuggestions(
  tasks: Task[],
  myDayIds: Set<string>,
  dismissedIds: Set<string>,
): Task[] {
  return tasks
    .filter(
      (t) =>
        !myDayIds.has(t.id) &&
        !t.parent_task_id &&
        !t.is_suspended &&
        !t.is_abandoned &&
        !dismissedIds.has(t.id),
    )
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        (a.due_date || '').slice(0, 10).localeCompare((b.due_date || '').slice(0, 10)),
    );
}

/** 每条建议的推荐原因，用于界面标注（如"已逾期 2 天"、"今天到期"） */
export function suggestionReason(task: Task, today: string): { label: string; overdue: boolean } {
  const due = (task.due_date || '').slice(0, 10);
  const diff = Math.round(
    (new Date(`${today}T00:00:00`).getTime() - new Date(`${due}T00:00:00`).getTime()) / 86400000,
  );
  return diff > 0 ? { label: `已逾期 ${diff} 天`, overdue: true } : { label: '今天到期', overdue: false };
}
