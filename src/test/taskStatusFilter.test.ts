import { describe, expect, it } from 'vitest';
import {
  classifyTaskStatus,
  filterTasksByStatus,
  getTaskStatusCounts,
  isTaskOverdueForStatus,
} from '../lib/taskStatusFilter';
import { buildTask } from './test-utils';

const TODAY = '2026-07-11';

describe('task status filtering', () => {
  it('classifies canonical states with deterministic precedence', () => {
    expect(classifyTaskStatus(buildTask())).toBe('active');
    expect(classifyTaskStatus(buildTask({ is_suspended: true }))).toBe('suspended');
    expect(classifyTaskStatus(buildTask({ is_completed: true, is_suspended: true }))).toBe('completed');
    expect(classifyTaskStatus(buildTask({ is_abandoned: true, is_completed: true, is_suspended: true }))).toBe('abandoned');
  });

  it('treats only active tasks due before the local day as overdue', () => {
    expect(isTaskOverdueForStatus(buildTask({ due_date: '2026-07-10' }), TODAY)).toBe(true);
    expect(isTaskOverdueForStatus(buildTask({ due_date: '2026-07-10 23:59' }), TODAY)).toBe(true);
    expect(isTaskOverdueForStatus(buildTask({ due_date: '2026-07-11 08:00' }), TODAY)).toBe(false);
    expect(isTaskOverdueForStatus(buildTask({ due_date: null }), TODAY)).toBe(false);
    expect(isTaskOverdueForStatus(buildTask({ due_date: '2026-07-10', is_suspended: true }), TODAY)).toBe(false);
    expect(isTaskOverdueForStatus(buildTask({ due_date: '2026-07-10', is_completed: true }), TODAY)).toBe(false);
  });

  it('filters each status without promoting archived tasks or subtasks', () => {
    const tasks = [
      buildTask({ id: 'active' }),
      buildTask({ id: 'completed', is_completed: true }),
      buildTask({ id: 'suspended', is_suspended: true }),
      buildTask({ id: 'abandoned', is_abandoned: true }),
      buildTask({ id: 'archived', is_archived: true }),
      buildTask({ id: 'child', parent_task_id: 'active' }),
    ];

    expect(filterTasksByStatus(tasks, 'all', TODAY).map((task) => task.id)).toEqual([
      'active', 'completed', 'suspended', 'abandoned',
    ]);
    expect(filterTasksByStatus(tasks, 'active', TODAY).map((task) => task.id)).toEqual(['active']);
    expect(filterTasksByStatus(tasks, 'completed', TODAY).map((task) => task.id)).toEqual(['completed']);
    expect(filterTasksByStatus(tasks, 'suspended', TODAY).map((task) => task.id)).toEqual(['suspended']);
    expect(filterTasksByStatus(tasks, 'abandoned', TODAY).map((task) => task.id)).toEqual(['abandoned']);
  });

  it('counts root tasks by exclusive primary status and overlapping overdue view', () => {
    const parent = buildTask({
      id: 'parent',
      due_date: '2026-07-10',
      children: [buildTask({ id: 'nested-child', parent_task_id: 'parent', is_completed: true })],
    });
    const tasks = [
      parent,
      buildTask({ id: 'completed', is_completed: true }),
      buildTask({ id: 'suspended', is_suspended: true, due_date: '2026-07-09' }),
      buildTask({ id: 'abandoned', is_abandoned: true, is_completed: true }),
      buildTask({ id: 'flat-child', parent_task_id: 'parent' }),
    ];

    expect(getTaskStatusCounts(tasks, TODAY)).toEqual({
      all: 4,
      active: 1,
      completed: 1,
      suspended: 1,
      abandoned: 1,
      overdue: 1,
    });
  });
});
