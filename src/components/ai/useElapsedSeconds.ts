import { useEffect, useState } from 'react';

/**
 * 生成中每秒刷新的已等待秒数。
 * startedAt 来自会话 store(而非组件挂载),退出详情再进来计时不会归零;
 * 重挂载时用惰性初值取当前时刻,重算的会话立即显示真实已等待时长。
 */
export function useElapsedSeconds(active: boolean, startedAt: number | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    // 订阅外部时钟:仅在回调中采样,不在 effect 体内同步 setState
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active, startedAt]);
  if (!active || !startedAt) return 0;
  // 新一代请求的 startedAt 晚于上一次采样时钳为 0,首跳误差 ≤1 秒
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}
