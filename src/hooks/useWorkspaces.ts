import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getRepositories } from '../domain/repositories/current';
import { queryKeys } from '../lib/queryKeys';

export function useWorkspaces() {
  return useQuery({
    queryKey: queryKeys.workspaces.all,
    queryFn: () => getRepositories().settings.listWorkspaces(),
    staleTime: 0,
  });
}

/** 把后端的错误对象转成适合直接显示的一句话 */
export function workspaceErrorMessage(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.replace(/^(Validation error|Not found|Generic error|IO error|Lock error):\s*/, '');
}

/**
 * 工作区操作:统一处理错误提示和列表刷新,失败时返回 undefined。
 * 切换工作区会重启应用,`activate` 的调用方不需要等它返回。
 */
export function useWorkspaceActions() {
  const queryClient = useQueryClient();

  async function run<T>(action: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
    try {
      const value = await action();
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
      return { ok: true, value };
    } catch (err) {
      return { ok: false, message: workspaceErrorMessage(err) };
    }
  }

  return {
    create: (name: string, switchAfter: boolean) =>
      run(() => getRepositories().settings.createWorkspace(name, switchAfter)),
    addFromFile: (source: string, name: string | null, switchAfter: boolean) =>
      run(() => getRepositories().settings.addWorkspaceFromFile(source, name, switchAfter)),
    rename: (id: string, name: string) =>
      run(() => getRepositories().settings.renameWorkspace(id, name)),
    remove: (id: string) => run(() => getRepositories().settings.deleteWorkspace(id)),
    activate: (id: string) =>
      run(() => getRepositories().settings.activateWorkspace(id)).then((result) => {
        // 重启前界面还在:切换失败时让用户看到原因
        if (!result.ok) toast.error(result.message);
        return result;
      }),
  };
}
