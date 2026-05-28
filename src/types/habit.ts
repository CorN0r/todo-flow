export interface Habit {
  id: string;
  name: string;
  color: string;
  icon: string;
  frequency: string;
  target_count: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface HabitWithStats extends Habit {
  current_streak: number;
  best_streak: number;
  completion_rate: number;
  is_done_today: boolean;
}

export interface HabitLog {
  id: string;
  habit_id: string;
  log_date: string;
  count: number;
  note: string;
  created_at: string;
}

export interface CreateHabitInput {
  name: string;
  color?: string;
  icon?: string;
  frequency?: string;
  target_count?: number;
}

export interface UpdateHabitInput {
  name?: string;
  color?: string;
  icon?: string;
  frequency?: string;
  target_count?: number;
}

export interface ReorderHabitsItem {
  id: string;
  sort_order: number;
}
