import { useEffect, useMemo } from 'react';
import type { Task } from '../types/task';
import { todayISO } from '../lib/date';
import { filterTasksByStatus, getTaskStatusCounts } from '../lib/taskStatusFilter';
import { useUIStore } from '../stores/uiStore';

export function useDesktopTaskStatusFilter(tasks: Task[], today = todayISO()) {
  const statusFilter = useUIStore((state) => state.taskStatusFilter);
  const setStatusFilter = useUIStore((state) => state.setTaskStatusFilter);
  const setSelectableIds = useUIStore((state) => state.setSelectableIds);
  const selectedTaskId = useUIStore((state) => state.selectedTaskId);
  const setSelectedTaskId = useUIStore((state) => state.setSelectedTaskId);

  const statusCounts = useMemo(() => getTaskStatusCounts(tasks, today), [tasks, today]);
  const filteredTasks = useMemo(
    () => filterTasksByStatus(tasks, statusFilter, today),
    [tasks, statusFilter, today],
  );

  useEffect(() => {
    setSelectableIds(filteredTasks.map((task) => task.id));
  }, [filteredTasks, setSelectableIds]);

  useEffect(() => {
    if (selectedTaskId && !filteredTasks.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(null);
    }
  }, [filteredTasks, selectedTaskId, setSelectedTaskId]);

  return { filteredTasks, statusCounts, statusFilter, setStatusFilter };
}
