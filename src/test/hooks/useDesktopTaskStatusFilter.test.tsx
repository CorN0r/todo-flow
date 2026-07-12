import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useDesktopTaskStatusFilter } from '../../hooks/useDesktopTaskStatusFilter';
import { useUIStore } from '../../stores/uiStore';
import { buildTask } from '../test-utils';

describe('useDesktopTaskStatusFilter', () => {
  beforeEach(() => {
    useUIStore.setState({
      taskStatusFilter: 'all',
      selectedTaskId: 'completed',
      selectedTaskIds: new Set(['active', 'completed']),
      selectableIds: ['active', 'completed'],
    });
  });

  it('clears hidden bulk selection and detail when the status changes', async () => {
    const tasks = [
      buildTask({ id: 'active' }),
      buildTask({ id: 'completed', is_completed: true }),
    ];
    const { result } = renderHook(() => useDesktopTaskStatusFilter(tasks, '2026-07-11'));

    act(() => result.current.setStatusFilter('active'));

    await waitFor(() => expect(result.current.filteredTasks.map((task) => task.id)).toEqual(['active']));
    await waitFor(() => expect(useUIStore.getState().selectedTaskId).toBeNull());
    expect([...useUIStore.getState().selectedTaskIds]).toEqual(['active']);
    expect(useUIStore.getState().selectableIds).toEqual(['active']);
  });
});
