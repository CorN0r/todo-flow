export type SettingsMap = Record<string, string>;

export interface DashboardStats {
  total_tasks: number;
  completed_tasks: number;
  incomplete_tasks: number;
  overdue_tasks: number;
  suspended_tasks: number;
  abandoned_tasks: number;
  today_completed: number;
  today_total: number;
  completion_by_date: { date: string; completed: number }[];
  tasks_by_tag: { tag_id: string; tag_name: string; tag_color: string; count: number }[];
}
