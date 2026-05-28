use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Habit {
    pub id: String,
    pub name: String,
    pub color: String,
    pub icon: String,
    pub frequency: String,
    pub target_count: i32,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HabitWithStats {
    pub id: String,
    pub name: String,
    pub color: String,
    pub icon: String,
    pub frequency: String,
    pub target_count: i32,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
    pub current_streak: i32,
    pub best_streak: i32,
    pub completion_rate: f64,
    pub is_done_today: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HabitLog {
    pub id: String,
    pub habit_id: String,
    pub log_date: String,
    pub count: i32,
    pub note: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateHabitRequest {
    pub name: String,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub frequency: Option<String>,
    pub target_count: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateHabitRequest {
    pub name: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub frequency: Option<String>,
    pub target_count: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct ReorderHabitsItem {
    pub id: String,
    pub sort_order: i32,
}
