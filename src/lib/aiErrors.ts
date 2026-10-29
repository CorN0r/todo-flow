/**
 * AI 调用错误的用户可读文案。
 * 后端错误码对应的上游状态(如 408/504 → timeout)对用户没有意义,
 * 在前端统一翻译成可行动的提示。
 */
export function aiFailureMessage(e: unknown): string {
  const err = e as { code?: string; message?: string } | null;
  if (err && typeof err === 'object') {
    if (err.code === 'cancelled') return '已取消';
    if (err.code === 'timeout') return '模型服务响应超时,请稍后重试';
    if (typeof err.message === 'string' && err.message) return err.message;
  }
  return String(e);
}

/** 是否为用户主动取消(不计为失败提示)。 */
export function isAiCancelled(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === 'cancelled';
}
