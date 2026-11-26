// “计划”的日期范围:按截止日期看任务的四个时间窗。全部任务(/date/all)不在其中
export const PLANNED_RANGES = ['today', 'tomorrow', 'this-week', 'this-month'] as const;
export type PlannedRange = (typeof PLANNED_RANGES)[number];
export const DEFAULT_PLANNED_RANGE: PlannedRange = 'this-week';

export function isPlannedRange(filter: string | undefined): filter is PlannedRange {
  return (PLANNED_RANGES as readonly string[]).includes(filter ?? '');
}
