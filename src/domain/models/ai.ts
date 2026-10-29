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

export function verificationOf(model: AiModelInfo | undefined, kind: AiVerificationKind): AiVerification | undefined {
  return model?.verifications.find((v) => v.kind === kind);
}
