use serde::{Deserialize, Serialize};

use super::progress::CoverageInfo;

/// 日/周回顾范围(日=单日;周=自然周周一至周日)
#[derive(Debug, Clone)]
pub struct ReviewScope {
    pub kind: String,
    pub start_date: String,
    pub end_date: String,
    /// 空数组表示全部标签
    pub tag_ids: Vec<String>,
    pub scope_key: String,
}

/// 事实条目(按真实事件去重后的任务级事实)
#[derive(Debug, Clone, Serialize)]
pub struct TaskFact {
    pub task_id: String,
    pub title: String,
    pub is_root: bool,
    pub occurred_at: String,
    pub task_deleted: bool,
}

/// 程序计算的回顾事实(不含 AI 解释)
#[derive(Debug, Clone, Serialize)]
pub struct ReviewFacts {
    pub period_kind: String,
    pub period_start: String,
    pub period_end: String,
    pub tag_ids: Vec<String>,
    /// 事件统计截止(过去周期=周期结束;当前周期=资料准备时刻)
    pub event_cutoff_at: String,
    /// 资料准备时间(与统计截止分开保存)
    pub prepared_at: String,
    pub timezone_offset: String,
    pub completed_root: Vec<TaskFact>,
    pub completed_subtask: Vec<TaskFact>,
    pub completed_then_reopened: Vec<TaskFact>,
    pub suspended_count: i64,
    pub resumed_count: i64,
    pub abandoned_count: i64,
    pub restored_count: i64,
    pub record_count: i64,
    pub coverage: CoverageInfo,
    /// complete / partial / missing(基于本机覆盖承诺)
    pub coverage_status: String,
}

/// AI 回顾四类内容条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewSectionItem {
    pub text: String,
    /// 引用的本次来源临时编号(如 T1/R3)
    pub refs: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ReviewSections {
    pub summary: Vec<ReviewSectionItem>,
    pub observations: Vec<ReviewSectionItem>,
    pub suggestions: Vec<ReviewSectionItem>,
    pub questions: Vec<ReviewSectionItem>,
}

/// 保存 AI 稿时随快照保留的元数据
#[derive(Debug, Clone, Deserialize)]
pub struct AiReviewPayload {
    pub sections: ReviewSections,
    pub model_snapshot: String,
    pub event_cutoff_at: String,
    pub prepared_at: String,
    pub prepared_at_local_date: String,
    pub timezone_offset: String,
    pub coverage_note: String,
    /// 来源引用列表(JSON,由准备阶段生成并在保存时回传)
    pub source_refs: serde_json::Value,
}

#[derive(Debug, Deserialize)]
pub struct SaveReviewRequest {
    pub period_kind: String,
    pub start_date: String,
    pub tag_ids: Vec<String>,
    pub manual_text: Option<String>,
    pub ai: Option<AiReviewPayload>,
    /// 0=新建;否则必须等于当前文稿版本
    pub expected_revision: i64,
    pub operation_id: Option<String>,
}

/// 已保存回顾(含来源可用状态,读取时实时计算)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedReview {
    pub id: String,
    pub scope_key: String,
    pub period_kind: String,
    pub period_start: String,
    pub period_end: String,
    pub tag_ids: Vec<String>,
    pub manual_text: String,
    pub ai_sections: Option<ReviewSections>,
    pub ai_model_snapshot: Option<String>,
    pub event_cutoff_at: Option<String>,
    pub prepared_at: Option<String>,
    pub prepared_at_local_date: Option<String>,
    pub timezone_offset: Option<String>,
    pub coverage_note: Option<String>,
    pub revision: i64,
    pub created_at: String,
    pub updated_at: String,
    /// 来源引用及当前可用性(kind: record/task)
    pub source_status: Vec<ReviewSourceStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewSourceStatus {
    pub kind: String,
    pub ref_id: String,
    pub entity_id: String,
    pub title: String,
    pub available: bool,
}
