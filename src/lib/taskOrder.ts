export function mergeVisibleTaskOrder<T extends { id: string }>(
  allTasks: T[],
  visibleOrder: T[],
): T[] {
  if (allTasks.length === 0 || visibleOrder.length === 0) return [...allTasks];

  const allIds = new Set(allTasks.map((task) => task.id));
  const orderedVisible = visibleOrder.filter((task) => allIds.has(task.id));
  const visibleIds = new Set(orderedVisible.map((task) => task.id));
  let visibleIndex = 0;

  return allTasks.map((task) => {
    if (!visibleIds.has(task.id)) return task;
    const replacement = orderedVisible[visibleIndex];
    visibleIndex += 1;
    return replacement ?? task;
  });
}
