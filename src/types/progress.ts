/** 手写进展记录(本机数据,不进同步) */
export interface ProgressRecord {
  id: string;
  task_id: string;
  root_task_id: string;
  root_tag_ids: string[];
  record_date: string;
  content: string;
  version: number;
  created_at: string;
  updated_at: string;
  task_title: string | null;
  task_deleted: boolean;
  is_subtask: boolean;
}

export interface ProgressRecordResult {
  record: ProgressRecord;
  already_saved: boolean;
}

export interface ProgressPage {
  items: ProgressRecord[];
  total: number;
  page: number;
  page_size: number;
}

export interface ProgressOverview {
  self_count: number;
  with_children_count: number;
  last_record_at: string | null;
}

/** 本机状态事件(complete/reopen/suspend/resume/abandon/restore) */
export interface TaskStateEvent {
  id: number;
  task_id: string;
  root_task_id: string;
  transition: string;
  occurred_at: string;
  occurred_utc: string;
  local_date: string;
  tz_offset: string;
  source: string;
  title_snapshot: string;
  root_tag_ids: string[];
  task_deleted: boolean;
}

export interface StateEventPage {
  items: TaskStateEvent[];
  total: number;
  page: number;
  page_size: number;
}

export interface CoverageGap {
  kind: string;
  start_date: string;
  end_date: string | null;
  note: string;
}

export interface CoverageInfo {
  baseline_start: string | null;
  gaps: CoverageGap[];
}

/** 回顾事实(程序计算) */
export interface TaskFact {
  task_id: string;
  title: string;
  is_root: boolean;
  occurred_at: string;
  task_deleted: boolean;
}

export interface ReviewFacts {
  period_kind: 'day' | 'week';
  period_start: string;
  period_end: string;
  tag_ids: string[];
  event_cutoff_at: string;
  prepared_at: string;
  timezone_offset: string;
  completed_root: TaskFact[];
  completed_subtask: TaskFact[];
  completed_then_reopened: TaskFact[];
  suspended_count: number;
  resumed_count: number;
  abandoned_count: number;
  restored_count: number;
  record_count: number;
  coverage: CoverageInfo;
  coverage_status: 'complete' | 'partial' | 'missing';
}

/** AI 回顾四类内容 */
export interface ReviewSectionItem {
  text: string;
  refs: string[];
}

export interface ReviewSections {
  summary: ReviewSectionItem[];
  observations: ReviewSectionItem[];
  suggestions: ReviewSectionItem[];
  questions: ReviewSectionItem[];
}

export interface ReviewSourceStatus {
  kind: string;
  ref_id: string;
  entity_id: string;
  title: string;
  available: boolean;
}

export interface SavedReview {
  id: string;
  scope_key: string;
  period_kind: 'day' | 'week';
  period_start: string;
  period_end: string;
  tag_ids: string[];
  manual_text: string;
  ai_sections: ReviewSections | null;
  ai_model_snapshot: string | null;
  event_cutoff_at: string | null;
  prepared_at: string | null;
  prepared_at_local_date: string | null;
  timezone_offset: string | null;
  coverage_note: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
  source_status: ReviewSourceStatus[];
}

export interface SaveReviewResult {
  review: SavedReview;
  already_saved: boolean;
}

/** AI 回顾准备上下文(快照预览) */
export interface PreparedSourceRef {
  ref_id: string;
  kind: string;
  entity_id: string;
  title: string;
}

export interface PreparedFactEntry {
  ref_id: string;
  entity_id: string;
  title: string;
  transition: string;
  date: string;
}

export interface PreparedRootGroup {
  ref_id: string;
  task_id: string;
  title: string;
  is_root: boolean;
  root_facts: PreparedFactEntry[];
  subtask_facts: PreparedFactEntry[];
}

export interface PreparedRecordRef {
  ref_id: string;
  record_id: string;
  task_id: string;
  task_title: string;
  record_date: string;
  excerpt: string;
  full_chars: number;
  truncated: boolean;
}

export interface PreparedTotals {
  total_root_groups: number;
  included_root_groups: number;
  total_subtask_facts: number;
  included_subtask_facts: number;
  total_records: number;
  included_records: number;
  truncated_records: number;
}

export interface PreparedReviewContext {
  scope_key: string;
  period_kind: 'day' | 'week';
  period_start: string;
  period_end: string;
  tag_ids: string[];
  timezone_offset: string;
  event_cutoff_at: string;
  prepared_at: string;
  prepared_at_local_date: string;
  coverage_note: string;
  completed_root_count: number;
  completed_subtask_count: number;
  reopened_count: number;
  suspended_count: number;
  resumed_count: number;
  abandoned_count: number;
  coverage_status: string;
  groups: PreparedRootGroup[];
  records: PreparedRecordRef[];
  user_note: string;
  totals: PreparedTotals;
  sources: PreparedSourceRef[];
  context_fingerprint: string;
}

export interface ReviewContextStatus {
  prepared: boolean;
  sources_changed: boolean;
  context_fingerprint: string | null;
}

export interface ReviewProposal {
  request_id: string;
  model_snapshot: string;
  sections: ReviewSections;
  event_cutoff_at: string;
  prepared_at: string;
  prepared_at_local_date: string;
  timezone_offset: string;
  coverage_note: string;
  source_refs: unknown;
  context_fingerprint: string;
}

export const TRANSITION_LABELS: Record<string, string> = {
  complete: '完成',
  reopen: '重新打开',
  suspend: '挂起',
  resume: '恢复进行',
  abandon: '放弃',
  restore: '恢复使用',
};

export const SOURCE_LABELS: Record<string, string> = {
  gui: '本机操作',
  agent: 'Agent',
};
