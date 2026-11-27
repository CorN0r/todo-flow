/**
 * 把任意抛出值转成可以直接显示的一句话。
 *
 * 提示组件(toast)只能渲染文本:把 Error 或普通对象原样传给它,渲染会抛错,
 * 整个界面跟着卸载(白屏)。写操作的 onError 里一律先过这里。
 */
export function errMessage(err: unknown): string {
  const message =
    typeof err === 'string' ? err
    : err instanceof Error ? err.message
    : err && typeof err === 'object' ? (err as { message?: unknown }).message
    : null;
  if (typeof message === 'string' && message) return message;
  return err == null ? '未知错误' : String(err);
}
