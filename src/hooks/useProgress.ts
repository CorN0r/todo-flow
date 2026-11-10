import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  progressCreateRecord,
  progressDeleteRecord,
  progressGetOverview,
  progressListEvents,
  progressListRecords,
  progressUpdateRecord,
} from '../lib/db';
import { queryKeys } from '../lib/queryKeys';

const PAGE_SIZE = 20;

/** 详情时间线:分页手写记录 */
export function useProgressRecords(taskId: string | undefined, includeChildren: boolean, page: number) {
  return useQuery({
    queryKey: queryKeys.progress.records(taskId ?? null, includeChildren, page, PAGE_SIZE),
    queryFn: () => progressListRecords(taskId!, includeChildren, page, PAGE_SIZE),
    enabled: !!taskId,
  });
}

/** 详情时间线:分页状态事件(与手写记录分开查看) */
export function useProgressEvents(taskId: string | undefined, includeChildren: boolean, page: number) {
  return useQuery({
    queryKey: queryKeys.progress.events(taskId ?? null, includeChildren, page, PAGE_SIZE),
    queryFn: () => progressListEvents(taskId!, includeChildren, page, PAGE_SIZE),
    enabled: !!taskId,
  });
}

/** 页签徽标摘要 */
export function useProgressOverview(taskId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.progress.overview(taskId ?? null),
    queryFn: () => progressGetOverview(taskId!),
    enabled: !!taskId,
    staleTime: 10_000,
  });
}

function invalidateProgress(queryClient: ReturnType<typeof useQueryClient>, taskId?: string) {
  queryClient.invalidateQueries({ queryKey: queryKeys.progress.all });
  if (taskId) {
    queryClient.invalidateQueries({ queryKey: ['reviews'] });
  }
}

/** 保存新记录:失败保留输入;同一操作重试幂等(后端回执去重) */
export function useCreateProgressRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { taskId: string; content: string; recordDate: string; operationId: string }) =>
      progressCreateRecord(input.taskId, input.content, input.recordDate, input.operationId),
    onSuccess: (result, variables) => {
      invalidateProgress(queryClient, variables.taskId);
      if (result.already_saved) {
        toast.info('该次保存此前已成功,未重复记录');
      }
    },
    onError: (error: unknown) => {
      toast.error(errorMessage(error), { duration: 6000 });
    },
  });
}

export function useUpdateProgressRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { recordId: string; content: string; recordDate: string; expectedVersion: number; operationId: string }) =>
      progressUpdateRecord(input.recordId, input.content, input.recordDate, input.expectedVersion, input.operationId),
    onSuccess: (result) => {
      invalidateProgress(queryClient, result.record.task_id);
    },
    onError: (error: unknown) => {
      toast.error(errorMessage(error), { duration: 6000 });
    },
  });
}

export function useDeleteProgressRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { recordId: string; expectedVersion: number; taskId: string }) =>
      progressDeleteRecord(input.recordId, input.expectedVersion),
    onSuccess: (_data, variables) => {
      invalidateProgress(queryClient, variables.taskId);
    },
    onError: (error: unknown) => {
      toast.error(errorMessage(error), { duration: 6000 });
    },
  });
}

function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return '进展记录保存失败,输入已保留,可直接重试';
}
