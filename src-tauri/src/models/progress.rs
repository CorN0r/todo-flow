use serde::{Deserialize, Serialize};

/// 手写进展记录(单条只归属一个任务;root_task_id/root_tag_ids 为保存时快照)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressRecord {
    pub id: String,
    pub task_id: String,
    pub root_task_id: String,
    pub root_tag_ids: Vec<String>,
    pub record_date: String,
    pub content: String,
    pub version: i64,
    pub created_at: String,
    pub updated_at: String,
    /// 聚合展示用:来源任务当前标题(任务已删除时为 None)
    pub task_title: Option<String>,
    /// 来源任务是否已删除(硬删或软删)
    pub task_deleted: bool,
    /// 记录归属的任务是否为子任务(按当前任务表判断)
    pub is_subtask: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateProgressRequest {
    pub task_id: String,
    pub content: String,
    /// 用户选择的记录日期(YYYY-MM-DD),默认今天,允许补记过去
    pub record_date: String,
    /// 保存幂等回执键;同一操作重试不新增重复记录
    pub operation_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProgressRequest {
    pub record_id: String,
    pub content: String,
    pub record_date: String,
    /// 期望版本;不匹配即冲突,保留用户输入不覆盖
    pub expected_version: i64,
    pub operation_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProgressPage {
    pub items: Vec<ProgressRecord>,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
}

/// 轻量入口摘要:详情页签上展示的记录计数
#[derive(Debug, Clone, Serialize)]
pub struct ProgressOverview {
    pub self_count: i64,
    pub with_children_count: i64,
    pub last_record_at: Option<String>,
}

/// 本机真实状态转换事件(complete/reopen/suspend/resume/abandon/restore)
#[derive(Debug, Clone, Serialize)]
pub struct TaskStateEvent {
    pub id: i64,
    pub task_id: String,
    pub root_task_id: String,
    pub transition: String,
    pub occurred_at: String,
    pub occurred_utc: String,
    pub local_date: String,
    pub tz_offset: String,
    pub source: String,
    pub title_snapshot: String,
    pub root_tag_ids: Vec<String>,
    pub task_deleted: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct StateEventPage {
    pub items: Vec<TaskStateEvent>,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
}

/// 回顾材料页:按 material_kind 返回记录页或事件页(前端按 items 内容区分)
#[derive(Debug, Clone, serde::Serialize)]
#[serde(untagged)]
pub enum ReviewMaterialPage {
    Records(ProgressPage),
    Events(StateEventPage),
}

/// 覆盖缺口区间(retention_off/cleanup/import)
#[derive(Debug, Clone, Serialize)]
pub struct CoverageGap {
    pub kind: String,
    pub start_date: String,
    pub end_date: Option<String>,
    pub note: String,
}

/// 本机事实历史覆盖说明
#[derive(Debug, Clone, Serialize, Default)]
pub struct CoverageInfo {
    /// 本机可靠状态事件起点(之前的历史缺失)
    pub baseline_start: Option<String>,
    pub gaps: Vec<CoverageGap>,
}
