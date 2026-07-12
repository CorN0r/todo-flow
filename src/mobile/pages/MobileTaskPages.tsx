import { useMemo, useState } from 'react';
import { ArrowDownUp, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTags } from '../../hooks/useTags';
import { useTasks, useUpdateTask } from '../../hooks/useTasks';
import type { Task } from '../../domain/models/task';
import type { TagWithCount } from '../../types/tag';
import { MobileManualSyncButton } from '../components/MobileManualSyncButton';
import { MobileTaskActionSheet } from '../components/MobileTaskActionSheet';
import { MobileTaskCard } from '../components/MobileTaskCard';
import { MobileTaskDetailSheet } from '../components/MobileTaskDetailSheet';
import { MobileAppBar, MobileChip, MobileEmptyState, MobilePage, MobilePageContent } from '../components/MobilePrimitives';
import {
  TASK_STATUS_FILTERS,
  filterTasksByStatus,
  getTaskStatusCounts,
  type TaskStatusFilter,
} from '../../lib/taskStatusFilter';

type SortMode = 'manual' | 'due' | 'priority';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function isVisibleRootTask(task: Task) {
  return !task.parent_task_id && !task.is_archived;
}

function flattenTags(tags: TagWithCount[]): TagWithCount[] {
  return tags.flatMap((tag) => [tag, ...flattenTags(tag.children ?? [])]);
}

function tagMap(tags: TagWithCount[]) {
  return new Map(flattenTags(tags).map((tag) => [tag.id, tag]));
}

function taskMatchesSearch(task: Task, query: string) {
  if (!query.trim()) return true;
  return task.title.toLowerCase().includes(query.trim().toLowerCase());
}

function sortTaskList(tasks: Task[], mode: SortMode) {
  const next = [...tasks];
  if (mode === 'due') {
    return next.sort((a, b) => (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31'));
  }
  if (mode === 'priority') {
    return next.sort((a, b) => b.priority - a.priority || a.sort_order - b.sort_order);
  }
  return next.sort((a, b) => a.sort_order - b.sort_order);
}

function TaskSection({
  title,
  tasks,
  tags,
  onToggle,
  onOpen,
  onLongPress,
}: {
  title: string;
  tasks: Task[];
  tags: Map<string, TagWithCount>;
  onToggle: (task: Task) => void;
  onOpen: (task: Task) => void;
  onLongPress: (task: Task) => void;
}) {
  if (tasks.length === 0) return null;
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-[var(--mobile-font-caption)] font-semibold uppercase tracking-wide text-[var(--mobile-color-text-muted)]">
          {title}
        </h2>
        <span className="text-[var(--mobile-font-caption)] text-[var(--mobile-color-text-subtle)]">{tasks.length}</span>
      </div>
      <div className="space-y-2">
        {tasks.map((task) => (
          <MobileTaskCard
            key={task.id}
            task={task}
            tag={task.tag_id ? tags.get(task.tag_id) : undefined}
            onToggle={() => onToggle(task)}
            onOpen={() => onOpen(task)}
            onLongPress={() => onLongPress(task)}
          />
        ))}
      </div>
    </section>
  );
}

export function MobileTodayPage() {
  const today = todayISO();
  const { data: tasks = [], isLoading } = useTasks({ include_children: true });
  const { data: tags = [] } = useTags();
  const updateTask = useUpdateTask();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [actionTask, setActionTask] = useState<Task | null>(null);

  const tagsById = useMemo(() => tagMap(tags), [tags]);
  const topLevel = useMemo(() => tasks.filter(isVisibleRootTask).filter((task) => !task.is_abandoned), [tasks]);
  const sections = useMemo(() => {
    const overdue = topLevel.filter((task) => !task.is_completed && task.due_date && task.due_date < today);
    const used = new Set(overdue.map((task) => task.id));
    const myDay = topLevel.filter((task) => task.my_day_date === today && !used.has(task.id));
    myDay.forEach((task) => used.add(task.id));
    const dueToday = topLevel.filter((task) => task.due_date === today && !used.has(task.id));
    return { overdue, myDay, dueToday };
  }, [today, topLevel]);

  const totalToday = sections.overdue.length + sections.myDay.length + sections.dueToday.length;
  const toggleTask = (task: Task) => updateTask.mutate({ id: task.id, is_completed: !task.is_completed });

  return (
    <MobilePage>
      <MobileAppBar
        title="今天"
        trailing={(
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--mobile-color-text-muted)]">{totalToday}</span>
            <MobileManualSyncButton compact />
          </div>
        )}
      />
      <MobilePageContent>
        {isLoading && <MobileEmptyState title="正在加载" />}
        {!isLoading && totalToday === 0 && <MobileEmptyState title="今天很清爽" />}
        <TaskSection
          title="逾期"
          tasks={sections.overdue}
          tags={tagsById}
          onToggle={toggleTask}
          onOpen={(task) => setSelectedTaskId(task.id)}
          onLongPress={setActionTask}
        />
        <TaskSection
          title="我的一天"
          tasks={sections.myDay}
          tags={tagsById}
          onToggle={toggleTask}
          onOpen={(task) => setSelectedTaskId(task.id)}
          onLongPress={setActionTask}
        />
        <TaskSection
          title="今天到期"
          tasks={sections.dueToday}
          tags={tagsById}
          onToggle={toggleTask}
          onOpen={(task) => setSelectedTaskId(task.id)}
          onLongPress={setActionTask}
        />
      </MobilePageContent>
      <MobileTaskDetailSheet taskId={selectedTaskId} open={!!selectedTaskId} onClose={() => setSelectedTaskId(null)} />
      <MobileTaskActionSheet
        task={actionTask}
        open={!!actionTask}
        onClose={() => setActionTask(null)}
        onOpenDetail={(taskId) => setSelectedTaskId(taskId)}
      />
    </MobilePage>
  );
}

export function MobileTasksPage() {
  const { t } = useTranslation();
  const { data: tasks = [], isLoading } = useTasks({ include_children: true });
  const { data: tags = [] } = useTags();
  const updateTask = useUpdateTask();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [actionTask, setActionTask] = useState<Task | null>(null);
  const [filter, setFilter] = useState<TaskStatusFilter>('active');
  const [selectedTagId, setSelectedTagId] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('manual');
  const [query, setQuery] = useState('');
  const tagsById = useMemo(() => tagMap(tags), [tags]);

  const scopedTasks = useMemo(() => {
    let next = tasks.filter(isVisibleRootTask).filter((task) => taskMatchesSearch(task, query));
    if (selectedTagId) next = next.filter((task) => task.tag_id === selectedTagId);
    return next;
  }, [query, selectedTagId, tasks]);
  const statusCounts = useMemo(() => getTaskStatusCounts(scopedTasks), [scopedTasks]);
  const visibleTasks = useMemo(
    () => sortTaskList(filterTasksByStatus(scopedTasks, filter), sortMode),
    [filter, scopedTasks, sortMode],
  );

  const toggleTask = (task: Task) => updateTask.mutate({ id: task.id, is_completed: !task.is_completed });

  return (
    <MobilePage>
      <MobileAppBar
        title="任务"
        trailing={(
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--mobile-color-text-muted)]">{visibleTasks.length}</span>
            <MobileManualSyncButton compact />
          </div>
        )}
      />
      <MobilePageContent>
        <label className="flex min-h-12 items-center gap-2 rounded-[var(--mobile-radius-md)] border border-[var(--mobile-color-border)] bg-[var(--mobile-color-surface)] px-3">
          <Search aria-hidden className="h-5 w-5 text-[var(--mobile-color-text-muted)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索任务"
            className="min-w-0 flex-1 bg-transparent text-[var(--mobile-font-body)] text-[var(--mobile-color-text)] outline-none placeholder:text-[var(--mobile-color-text-subtle)]"
          />
        </label>

        <div className="-mx-1 flex shrink-0 gap-2 overflow-x-auto px-1 pb-1" aria-label={t('filter.statusMenu')}>
          {TASK_STATUS_FILTERS.map((status) => (
            <div key={status} className="shrink-0">
              <MobileChip active={filter === status} onClick={() => setFilter(status)}>
                {t(`filter.status.${status}`)} {statusCounts[status]}
              </MobileChip>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <MobileChip active={sortMode === 'manual'} onClick={() => setSortMode('manual')}>
            <ArrowDownUp aria-hidden className="h-4 w-4" />
            手动
          </MobileChip>
          <MobileChip active={sortMode === 'due'} onClick={() => setSortMode('due')}>日期</MobileChip>
          <MobileChip active={sortMode === 'priority'} onClick={() => setSortMode('priority')}>优先级</MobileChip>
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <MobileChip active={!selectedTagId} onClick={() => setSelectedTagId('')}>全部标签</MobileChip>
            {flattenTags(tags).map((tag) => (
              <MobileChip key={tag.id} active={selectedTagId === tag.id} onClick={() => setSelectedTagId(tag.id)}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                {tag.name}
              </MobileChip>
            ))}
          </div>
        )}

        {isLoading && <MobileEmptyState title="正在加载" />}
        {!isLoading && visibleTasks.length === 0 && (
          <MobileEmptyState
            title={scopedTasks.length > 0 && filter !== 'all' ? t(`filter.empty.${filter}`) : '没有匹配任务'}
            action={scopedTasks.length > 0 && filter !== 'all' ? (
              <button
                type="button"
                onClick={() => setFilter('all')}
                className="mt-3 min-h-11 rounded-[var(--mobile-radius-md)] border border-[var(--mobile-color-border)] px-4 text-[var(--mobile-font-caption)] font-medium text-[var(--mobile-color-primary)]"
              >
                {t('filter.showAll')}
              </button>
            ) : undefined}
          />
        )}
        <div className="space-y-2">
          {visibleTasks.map((task) => (
            <MobileTaskCard
              key={task.id}
              task={task}
              tag={task.tag_id ? tagsById.get(task.tag_id) : undefined}
              onToggle={() => toggleTask(task)}
              onOpen={() => setSelectedTaskId(task.id)}
              onLongPress={() => setActionTask(task)}
            />
          ))}
        </div>
      </MobilePageContent>
      <MobileTaskDetailSheet taskId={selectedTaskId} open={!!selectedTaskId} onClose={() => setSelectedTaskId(null)} />
      <MobileTaskActionSheet
        task={actionTask}
        open={!!actionTask}
        onClose={() => setActionTask(null)}
        onOpenDetail={(taskId) => setSelectedTaskId(taskId)}
      />
    </MobilePage>
  );
}
