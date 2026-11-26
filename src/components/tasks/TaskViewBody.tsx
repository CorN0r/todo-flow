import type { Task } from '../../types/task';
import type { TaskViewMode } from '../../stores/uiStore';
import { TaskList } from './TaskList';
import { StickyWall } from './StickyWall';
import { UnifiedLayout } from './UnifiedLayout';
import { KanbanBoard } from './KanbanBoard';
import { MatrixBoard } from './MatrixBoard';

interface TaskViewBodyProps {
  mode: TaskViewMode;
  // 当前范围经状态筛选后的任务,带子任务
  tasks: Task[];
  // 完整的根任务顺序,列表里手动排序时要合并回它
  topLevel?: Task[];
}

export function TaskViewBody({ mode, tasks, topLevel }: TaskViewBodyProps) {
  // 看板与四象限只有根任务卡片。去掉子任务:TaskCard 会读 task.children,
  // 原来的独立页面取数时不带子任务,带上的话卡片行为会变
  const rootTasks = mode === 'kanban' || mode === 'matrix'
    ? tasks.map((task) => ({ ...task, children: [] }))
    : tasks;

  switch (mode) {
    case 'wall':
      return <StickyWall tasks={tasks} />;
    case 'unified':
      return <UnifiedLayout tasks={tasks} reorderScope={topLevel} />;
    case 'kanban':
      return <KanbanBoard tasks={rootTasks} />;
    case 'matrix':
      return <MatrixBoard tasks={rootTasks} />;
    default:
      return <TaskList tasks={tasks} reorderScope={topLevel} />;
  }
}
