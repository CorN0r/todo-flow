import { describe, expect, it } from 'vitest';
import { buildSuggestions, suggestionReason } from '../../lib/myDaySuggestions';
import { buildTask } from '../test-utils';

const TODAY = '2026-08-09';

describe('buildSuggestions', () => {
  it('keeps due incomplete tasks including those without priority', () => {
    const noPriority = buildTask({ id: 'a', priority: 0, due_date: TODAY });
    const withPriority = buildTask({ id: 'b', priority: 2, due_date: TODAY });
    const result = buildSuggestions([noPriority, withPriority], new Set(), new Set());
    expect(result.map((t) => t.id)).toContain('a');
    expect(result.map((t) => t.id)).toContain('b');
  });

  it('excludes tasks already in my day, subtasks, suspended, abandoned and dismissed', () => {
    const tasks = [
      buildTask({ id: 'in-myday', due_date: TODAY }),
      buildTask({ id: 'subtask', parent_task_id: 'p', due_date: TODAY }),
      buildTask({ id: 'suspended', is_suspended: true, due_date: TODAY }),
      buildTask({ id: 'abandoned', is_abandoned: true, due_date: TODAY }),
      buildTask({ id: 'dismissed', due_date: TODAY }),
      buildTask({ id: 'kept', due_date: TODAY }),
    ];
    const result = buildSuggestions(tasks, new Set(['in-myday']), new Set(['dismissed']));
    expect(result.map((t) => t.id)).toEqual(['kept']);
  });

  it('sorts by priority desc, then due date asc', () => {
    const tasks = [
      buildTask({ id: 'low-early', priority: 1, due_date: '2026-08-01' }),
      buildTask({ id: 'high', priority: 3, due_date: '2026-08-09' }),
      buildTask({ id: 'none', priority: 0, due_date: '2026-08-01' }),
      buildTask({ id: 'low-late', priority: 1, due_date: '2026-08-08' }),
    ];
    const result = buildSuggestions(tasks, new Set(), new Set());
    expect(result.map((t) => t.id)).toEqual(['high', 'low-early', 'low-late', 'none']);
  });

  it('does not mutate the input array', () => {
    const tasks = [
      buildTask({ id: 'b', priority: 1, due_date: TODAY }),
      buildTask({ id: 'a', priority: 3, due_date: TODAY }),
    ];
    buildSuggestions(tasks, new Set(), new Set());
    expect(tasks.map((t) => t.id)).toEqual(['b', 'a']);
  });
});

describe('suggestionReason', () => {
  it('labels tasks due today', () => {
    const task = buildTask({ due_date: TODAY });
    expect(suggestionReason(task, TODAY)).toEqual({ label: '今天到期', overdue: false });
  });

  it('labels overdue tasks with day count', () => {
    const task = buildTask({ due_date: '2026-08-07' });
    expect(suggestionReason(task, TODAY)).toEqual({ label: '已逾期 2 天', overdue: true });
  });

  it('handles due dates with time part', () => {
    const task = buildTask({ due_date: '2026-08-08 18:00:00' });
    expect(suggestionReason(task, TODAY)).toEqual({ label: '已逾期 1 天', overdue: true });
  });
});
