import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';
import { setRepositoriesForTesting, resetRepositories } from '../../domain/repositories/current';
import { createMemoryRepositories } from '../../domain/adapters/memory';
import {
  useClearTaskReminders,
  useCreateTask,
  useCreateTaskReminder,
  useDeleteTask,
  useDeleteTaskReminder,
  useDuplicateTask,
  useUpdateTask,
} from '../../hooks/useTasks';
import { useCreateTag, useUpdateTag } from '../../hooks/useTags';
import { useCreateHabit, useDeleteHabit, useToggleHabitLog, useUpdateHabit } from '../../hooks/useHabits';
import { useDeleteAttachment, useUploadAttachment } from '../../hooks/useAttachments';

type Repositories = ReturnType<typeof createMemoryRepositories>['repositories'];
interface Mutation {
  mutate: (variables: never) => void;
}
interface Case {
  name: string;
  /** 渲染要写成 renderHook(() => useX()) 的样子,hook 的使用规则才认得 */
  render: () => Mutation;
  call: (mutation: Mutation) => void;
  fail: (repositories: Repositories) => void;
}

// 写操作失败时抛出来的不一定是字符串(后端的字符串、前端的 Error、带 message 的对象都有)。
// 提示组件只能渲染文本:把 Error 原样传给它,整个界面会跟着卸载
const FAILURE = new Error('磁盘已满');
const cases: Case[] = [
  {
    name: '新建任务',
    render: () => renderHook(() => useCreateTask(), { wrapper: Wrapper }).result.current as Mutation,
    call: (m) => m.mutate({ title: '写周报' } as never),
    fail: (r) => vi.spyOn(r.tasks, 'create').mockRejectedValue(FAILURE),
  },
  {
    name: '更新任务',
    render: () => renderHook(() => useUpdateTask(), { wrapper: Wrapper }).result.current as Mutation,
    call: (m) => m.mutate({ id: 't1', title: '写周报' } as never),
    fail: (r) => vi.spyOn(r.tasks, 'update').mockRejectedValue(FAILURE),
  },
  {
    name: '删除任务',
    render: () => renderHook(() => useDeleteTask(), { wrapper: Wrapper }).result.current as Mutation,
    call: (m) => m.mutate('t1' as never),
    fail: (r) => vi.spyOn(r.tasks, 'delete').mockRejectedValue(FAILURE),
  },
  {
    name: '复制任务',
    render: () => renderHook(() => useDuplicateTask(), { wrapper: Wrapper }).result.current as Mutation,
    call: (m) => m.mutate('t1' as never),
    fail: (r) => vi.spyOn(r.tasks, 'duplicate').mockRejectedValue(FAILURE),
  },
  {
    name: '添加提醒',
    render: () => renderHook(() => useCreateTaskReminder(), { wrapper: Wrapper }).result.current as Mutation,
    call: (m) => m.mutate({ taskId: 't1', offset: '-30m', dueDate: '2026-11-27' } as never),
    fail: (r) => vi.spyOn(r.reminders, 'create').mockRejectedValue(FAILURE),
  },
  {
    name: '删除提醒',
    render: () => renderHook(() => useDeleteTaskReminder(), { wrapper: Wrapper }).result.current as Mutation,
    call: (m) => m.mutate('r1' as never),
    fail: (r) => vi.spyOn(r.reminders, 'delete').mockRejectedValue(FAILURE),
  },
  {
    name: '清空提醒',
    render: () => renderHook(() => useClearTaskReminders(), { wrapper: Wrapper }).result.current as Mutation,
    call: (m) => m.mutate('t1' as never),
    fail: (r) => vi.spyOn(r.reminders, 'clearForTask').mockRejectedValue(FAILURE),
  },
  {
    name: '新建标签',
    render: () => renderHook(() => useCreateTag(), { wrapper: Wrapper }).result.current as Mutation,
    call: (m) => m.mutate({ name: '工作', color: '#60A5FA' } as never),
    fail: (r) => vi.spyOn(r.tags, 'create').mockRejectedValue(FAILURE),
  },
  {
    name: '更新标签',
    render: () => renderHook(() => useUpdateTag(), { wrapper: Wrapper }).result.current as Mutation,
    call: (m) => m.mutate({ id: 'g1', name: '工作' } as never),
    fail: (r) => vi.spyOn(r.tags, 'update').mockRejectedValue(FAILURE),
  },
  {
    name: '新建习惯',
    render: () => renderHook(() => useCreateHabit(), { wrapper: Wrapper }).result.current as Mutation,
    call: (m) => m.mutate({ name: '晨跑', color: '#34D399', frequency: 'daily', target_count: 1 } as never),
    fail: (r) => vi.spyOn(r.habits, 'create').mockRejectedValue(FAILURE),
  },
  {
    name: '更新习惯',
    render: () => renderHook(() => useUpdateHabit(), { wrapper: Wrapper }).result.current as Mutation,
    call: (m) => m.mutate({ id: 'h1', name: '晨跑' } as never),
    fail: (r) => vi.spyOn(r.habits, 'update').mockRejectedValue(FAILURE),
  },
  {
    name: '删除习惯',
    render: () => renderHook(() => useDeleteHabit(), { wrapper: Wrapper }).result.current as Mutation,
    call: (m) => m.mutate('h1' as never),
    fail: (r) => vi.spyOn(r.habits, 'delete').mockRejectedValue(FAILURE),
  },
  {
    name: '打卡',
    render: () => renderHook(() => useToggleHabitLog(), { wrapper: Wrapper }).result.current as Mutation,
    call: (m) => m.mutate({ habitId: 'h1' } as never),
    fail: (r) => vi.spyOn(r.habits, 'toggleLog').mockRejectedValue(FAILURE),
  },
  {
    name: '上传附件',
    render: () => renderHook(() => useUploadAttachment(), { wrapper: Wrapper }).result.current as Mutation,
    call: (m) => m.mutate({ taskId: 't1', sourcePath: 'C:/tmp/a.png' } as never),
    fail: (r) => vi.spyOn(r.attachments, 'uploadFile').mockRejectedValue(FAILURE),
  },
  {
    name: '删除附件',
    render: () => renderHook(() => useDeleteAttachment(), { wrapper: Wrapper }).result.current as Mutation,
    call: (m) => m.mutate('a1' as never),
    fail: (r) => vi.spyOn(r.attachments, 'delete').mockRejectedValue(FAILURE),
  },
];

function Wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('写操作失败时的提示', () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
  });
  afterEach(() => {
    resetRepositories();
  });

  describe.each(cases)('$name', ({ render, call, fail }) => {
    it('把 Error 转成一句话,而不是把对象交给提示组件', async () => {
      const { repositories } = createMemoryRepositories();
      fail(repositories);
      setRepositoriesForTesting(repositories);
      const mutation = render();

      act(() => call(mutation));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('磁盘已满'));
      expect(vi.mocked(toast.error).mock.calls.every(([message]) => typeof message === 'string')).toBe(true);
    });
  });

  it('后端给的是字符串时原样显示', async () => {
    const { repositories } = createMemoryRepositories();
    vi.spyOn(repositories.tasks, 'update').mockRejectedValue('数据库被锁定');
    setRepositoriesForTesting(repositories);
    const { result } = renderHook(() => useUpdateTask(), { wrapper: Wrapper });

    act(() => (result.current as Mutation).mutate({ id: 't1', title: '写周报' } as never));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('数据库被锁定'));
  });
});
