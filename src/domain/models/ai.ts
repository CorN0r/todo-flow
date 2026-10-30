/**
 * AI 模型接入模块的前端契约类型。与 src-tauri/src/ai 各结构体对应。
 * 错误统一为 { code, message, detail? } 对象(见 AiErrorShape),按 code 分类展示。
 */

export type AiErrorCode =
  | 'config_missing'
  | 'credential_unavailable'
  | 'auth_failed'
  | 'model_not_found'
  | 'connection_failed'
  | 'rate_limited'
  | 'timeout'
  | 'cancelled'
  | 'unsupported'
  | 'output_truncated'
  | 'invalid_format'
  | 'context_changed'
  | 'apply_conflict'
  | 'validation'
  | 'internal';

export interface AiErrorShape {
  code: AiErrorCode;
  message: string;
  detail?: string;
}

export function isAiError(e: unknown): e is AiErrorShape {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as AiErrorShape).code === 'string' &&
    typeof (e as AiErrorShape).message === 'string'
  );
}

export interface AiConnection {
  id: string;
  name: string;
  protocol: string;
  base_url: string;
  preset_id: string | null;
  credential_version: number;
  revision: number;
  enabled: boolean;
  timeout_secs: number | null;
  created_at: string;
  updated_at: string;
}

export interface AiConnectionInfo extends AiConnection {
  credential_present: boolean;
}

export type AiVerificationKind = 'basic' | 'stream' | 'breakdown';
export type AiVerificationStatus = 'unknown' | 'passed' | 'unsupported' | 'failed' | 'expired';

export interface AiVerification {
  id: string;
  model_entry_id: string;
  kind: AiVerificationKind;
  status: AiVerificationStatus;
  fingerprint: string | null;
  detail: string | null;
  verified_at: string;
}

export interface AiModel {
  id: string;
  connection_id: string;
  model_id: string;
  display_name: string;
  created_at: string;
  updated_at: string;
}

export interface AiModelInfo extends AiModel {
  verifications: AiVerification[];
}

export interface ProviderPreset {
  id: string;
  name: string;
  protocol: string;
  base_url: string;
  note: string;
}

export interface CreateConnectionInput {
  name: string;
  protocol: string;
  base_url: string;
  preset_id?: string | null;
  timeout_secs?: number | null;
  api_key: string;
}

export interface UpdateConnectionInput {
  id: string;
  name?: string;
  base_url?: string;
  api_key?: string;
}

export interface AiUsage {
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
}

export interface AiInvocationSummary {
  id: string;
  purpose: string;
  model_entry_id: string | null;
  connection_snapshot: string;
  status: 'success' | 'failed' | 'cancelled';
  error_code: string | null;
  duration_ms: number | null;
  usage: AiUsage | null;
  created_at: string;
}

export interface BreakdownItem {
  title: string;
  instructions: string;
}

export interface BreakdownProposal {
  proposal_id: string;
  /** 发起本次生成的请求标识,用于过滤进度事件与取消 */
  request_id: string;
  model_snapshot: string;
  assumptions: string[];
  items: BreakdownItem[];
  used_stream: boolean;
  json_fallback: boolean;
  context_fingerprint: string;
}

export interface ApplyBreakdownResult {
  created_task_ids: string[];
  already_applied: boolean;
}

/** 描述润色/生成结果(纯文本,前端预览可编辑,采纳走 updateTask) */
export interface PolishProposal {
  request_id: string;
  model_snapshot: string;
  text: string;
}

// ---------- 今日行动建议 ----------

export interface MyDayCandidateSubtask {
  subtask_id: string;
  temp_ref: string;
  title: string;
  instructions: string;
  is_completed: boolean;
}

export type MyDayCandidateGroup =
  | 'manual'
  | 'overdue'
  | 'upcoming'
  | 'pinned_high'
  | 'no_due_date'
  | 'other';

/** 可执行但未纳入上下文的子任务摘要(不发给模型,仅供界面替换选择) */
export interface MyDayOmittedSubtask {
  subtask_id: string;
  title: string;
}

/** 候选快照条目:真实任务事实 + 发送模型的截断文本(temp_ref 不外发给界面以外的消费方) */
export interface MyDayCandidate {
  task_id: string;
  temp_ref: string;
  title: string;
  description_text: string;
  due_date: string | null;
  priority: number;
  is_pinned: boolean;
  already_in_my_day: boolean;
  group: MyDayCandidateGroup;
  subtasks: MyDayCandidateSubtask[];
  truncated_desc: boolean;
  omitted_subtasks: number;
  omitted_subtask_details: MyDayOmittedSubtask[];
  fingerprint: string;
}

/** 合格但受数量上限未带入的根任务,供界面手动补入 */
export interface MyDayOmittedCandidate {
  task_id: string;
  title: string;
  due_date: string | null;
  priority: number;
  is_pinned: boolean;
  already_in_my_day: boolean;
}

export interface MyDayContextPreview {
  context_id: string;
  local_date: string;
  candidates: MyDayCandidate[];
  omitted_candidates: MyDayOmittedCandidate[];
  eligible_total: number;
  used_count: number;
  omitted_count: number;
  /** 当前本机计划版本,采纳时作为期望版本回传 */
  current_revision: number;
}

/** 行动卡(模型建议解析为真实任务引用后的形态) */
export interface MyDayPlanAction {
  root_task_id: string;
  root_title: string;
  target_subtask_id: string | null;
  subtask_title: string | null;
  already_in_my_day: boolean;
  reason: string;
  next_step: string;
  stop_at: string;
}

export interface MyDayNotSelected {
  task_id: string;
  title: string;
  reason: string;
}

export interface MyDayPlanProposal {
  proposal_id: string;
  request_id: string;
  model_snapshot: string;
  local_date: string;
  assumptions: string[];
  actions: MyDayPlanAction[];
  not_selected: MyDayNotSelected[];
}

export interface MyDaySubtaskPickInput {
  task_id: string;
  subtask_ids: string[];
}

/** 采纳时提交的行动卡(真实任务 ID + 用户编辑后的文本,数组顺序即采纳顺序) */
export interface MyDayActionInput {
  root_task_id: string;
  target_subtask_id: string | null;
  reason: string;
  next_step: string;
  stop_at: string;
}

export interface ApplyMyDayPlanResult {
  added_task_ids: string[];
  plan_id: string;
  revision: number;
  already_applied: boolean;
}

/** 卡片实时状态:ok 可开工;changed 内容有变需检查;其余为不可开工的具体失效原因 */
export type MyDayActionStatus =
  | 'ok'
  | 'changed'
  | 'completed'
  | 'suspended'
  | 'abandoned'
  | 'archived'
  | 'deleted'
  | 'removed_from_day'
  | 'subtask_invalid'
  | 'subtask_completed';

export interface MyDayPlanActionView {
  display_order: number;
  root_task_id: string;
  target_subtask_id: string | null;
  root_title: string | null;
  subtask_title: string | null;
  reason: string;
  next_step: string;
  stop_at: string;
  status: MyDayActionStatus;
  can_start: boolean;
}

/** 当日已采纳计划(联查实时任务状态后的视图) */
export interface MyDayPlanView {
  plan_id: string;
  local_date: string;
  revision: number;
  focus_text: string;
  model_snapshot: string;
  adopted_at: string;
  actions: MyDayPlanActionView[];
}

export function verificationOf(model: AiModelInfo | undefined, kind: AiVerificationKind): AiVerification | undefined {
  return model?.verifications.find((v) => v.kind === kind);
}
