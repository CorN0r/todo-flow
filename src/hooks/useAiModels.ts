import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getRepositories } from '../domain/repositories/current';
import type {
  AiVerificationKind,
  CreateConnectionInput,
  UpdateConnectionInput,
} from '../domain/models/ai';
import { isAiError } from '../domain/models/ai';

// AI 数据当前仅本机使用,不做跨端同步;查询键集中在 queryKeys 之外以降低侵入,
// 但沿用同样的 staleTime 风格。
export const aiQueryKeys = {
  all: ['ai'] as const,
  presets: () => [...aiQueryKeys.all, 'presets'] as const,
  connections: () => [...aiQueryKeys.all, 'connections'] as const,
  models: () => [...aiQueryKeys.all, 'models'] as const,
  defaultModel: () => [...aiQueryKeys.all, 'defaultModel'] as const,
  invocations: () => [...aiQueryKeys.all, 'invocations'] as const,
};

function invalidateAi(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: aiQueryKeys.all });
}

export function useAiPresets() {
  return useQuery({
    queryKey: aiQueryKeys.presets(),
    queryFn: () => getRepositories().ai.getPresets(),
    staleTime: Infinity,
  });
}

export function useAiConnections() {
  return useQuery({
    queryKey: aiQueryKeys.connections(),
    queryFn: () => getRepositories().ai.listConnections(),
  });
}

export function useAiModels() {
  return useQuery({
    queryKey: aiQueryKeys.models(),
    queryFn: () => getRepositories().ai.listModels(),
  });
}

export function useAiDefaultModel() {
  return useQuery({
    queryKey: aiQueryKeys.defaultModel(),
    queryFn: () => getRepositories().ai.getDefaultModel(),
  });
}

export function useAiInvocations(limit = 20) {
  return useQuery({
    queryKey: aiQueryKeys.invocations(),
    queryFn: () => getRepositories().ai.listInvocations(limit),
  });
}

export function useCreateAiConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateConnectionInput) => getRepositories().ai.createConnection(input),
    onSuccess: (conn) => {
      invalidateAi(queryClient);
      toast.success(`连接「${conn.name}」已保存`);
    },
    onError: (err: unknown) => toast.error(errMessage(err)),
  });
}

export function useUpdateAiConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateConnectionInput) => getRepositories().ai.updateConnection(input),
    onSuccess: () => {
      invalidateAi(queryClient);
      toast.success('连接已更新');
    },
    onError: (err: unknown) => toast.error(errMessage(err)),
  });
}

export function useDeleteAiConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getRepositories().ai.deleteConnection(id),
    onSuccess: () => {
      invalidateAi(queryClient);
      toast.success('连接已删除');
    },
    onError: (err: unknown) => toast.error(errMessage(err)),
  });
}

export function useSetAiConnectionEnabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      getRepositories().ai.setConnectionEnabled(id, enabled),
    onSuccess: () => invalidateAi(queryClient),
    onError: (err: unknown) => toast.error(errMessage(err)),
  });
}

export function useSetAiConnectionTimeout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, timeoutSecs }: { id: string; timeoutSecs: number | null }) =>
      getRepositories().ai.setConnectionTimeout(id, timeoutSecs),
    onSuccess: () => {
      invalidateAi(queryClient);
      toast.success('超时已更新,该连接的验证结论已标记过期');
    },
    onError: (err: unknown) => toast.error(errMessage(err)),
  });
}

export function useCreateAiModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ connectionId, modelId, displayName }: { connectionId: string; modelId: string; displayName?: string }) =>
      getRepositories().ai.createModel(connectionId, modelId, displayName),
    onSuccess: () => {
      invalidateAi(queryClient);
      toast.success('模型已添加');
    },
    onError: (err: unknown) => toast.error(errMessage(err)),
  });
}

export function useDeleteAiModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getRepositories().ai.deleteModel(id),
    onSuccess: () => {
      invalidateAi(queryClient);
      toast.success('模型已删除');
    },
    onError: (err: unknown) => toast.error(errMessage(err)),
  });
}

export function useSetAiDefaultModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (modelEntryId: string | null) => getRepositories().ai.setDefaultModel(modelEntryId),
    onSuccess: () => invalidateAi(queryClient),
    onError: (err: unknown) => toast.error(errMessage(err)),
  });
}

export function useFetchAiModels() {
  // 不缓存:一次性获取动作
  return useMutation({
    mutationFn: (connectionId: string) => getRepositories().ai.fetchModels(connectionId),
    onError: (err: unknown) => toast.error(errMessage(err)),
  });
}

export function useVerifyAiModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ modelEntryId, kind }: { modelEntryId: string; kind: AiVerificationKind }) =>
      getRepositories().ai.verifyModel(modelEntryId, kind),
    onSuccess: (verification) => {
      invalidateAi(queryClient);
      if (verification.status === 'passed') {
        toast.success('验证通过');
      } else {
        toast.error(`验证未通过:${verification.detail ?? '请检查配置'}`);
      }
    },
    onError: (err: unknown) => toast.error(errMessage(err)),
  });
}

export function useClearAiInvocations() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => getRepositories().ai.clearInvocations(),
    onSuccess: () => {
      invalidateAi(queryClient);
      toast.success('调用摘要已清除');
    },
    onError: (err: unknown) => toast.error(errMessage(err)),
  });
}

export function errMessage(err: unknown): string {
  if (isAiError(err)) return err.message;
  return String(err);
}
