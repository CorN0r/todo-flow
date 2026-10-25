import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bot, ChevronDown, ChevronRight, KeyRound, Loader2, Plus, RefreshCw, ShieldCheck,
  Sparkles, Trash2, CircleCheck, CircleX, CircleHelp,
} from 'lucide-react';
import {
  useAiConnections, useAiDefaultModel, useAiInvocations, useAiModels, useAiPresets,
  useCreateAiConnection, useCreateAiModel, useDeleteAiConnection, useDeleteAiModel,
  useFetchAiModels, useSetAiConnectionEnabled, useSetAiDefaultModel,
  useUpdateAiConnection, useVerifyAiModel, useClearAiInvocations,
} from '../../hooks/useAiModels';
import type { AiConnectionInfo, AiModelInfo, AiVerificationKind } from '../../domain/models/ai';
import { verificationOf } from '../../domain/models/ai';
import { cn } from '../../lib/cn';

const VERIFY_KINDS: { kind: AiVerificationKind; label: string }[] = [
  { kind: 'basic', label: '基础调用' },
  { kind: 'stream', label: '流式接收' },
  { kind: 'breakdown', label: '任务拆解' },
];

function VerificationBadge({ model, kind }: { model: AiModelInfo; kind: AiVerificationKind }) {
  const v = verificationOf(model, kind);
  if (!v || v.status === 'unknown') {
    return <span className="inline-flex items-center gap-1 text-[11px] text-[#9CA3AF]"><CircleHelp size={12} />未验证</span>;
  }
  if (v.status === 'passed') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-[#10B981]" title={v.detail ?? undefined}>
        <CircleCheck size={12} />已通过
      </span>
    );
  }
  if (v.status === 'expired') {
    return <span className="inline-flex items-center gap-1 text-[11px] text-[#F59E0B]"><CircleHelp size={12} />已过期</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-[#EF4444]" title={v.detail ?? undefined}>
      <CircleX size={12} />{v.status === 'unsupported' ? '不支持' : '未通过'}
    </span>
  );
}

function ConnectionForm({
  onDone,
  editing,
}: {
  onDone: () => void;
  editing?: AiConnectionInfo;
}) {
  const { data: presets = [] } = useAiPresets();
  const createConnection = useCreateAiConnection();
  const updateConnection = useUpdateAiConnection();

  const initialPreset = editing?.preset_id ?? 'custom';
  const [presetId, setPresetId] = useState(initialPreset);
  const [name, setName] = useState(editing?.name ?? '');
  const [baseUrl, setBaseUrl] = useState(editing?.base_url ?? '');
  const [apiKey, setApiKey] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [timeoutSecs, setTimeoutSecs] = useState<string>(editing?.timeout_secs ? String(editing.timeout_secs) : '');

  const preset = presets.find((p) => p.id === presetId);
  const effectiveBaseUrl = baseUrl || preset?.base_url || '';

  const applyPreset = (id: string) => {
    setPresetId(id);
    const p = presets.find((x) => x.id === id);
    if (p && p.base_url) setBaseUrl(p.base_url);
    if (p && !name) setName(p.name);
  };

  const submit = () => {
    if (!name.trim() || !effectiveBaseUrl.trim()) return;
    if (!editing && !apiKey.trim()) return;
    if (editing) {
      updateConnection.mutate(
        {
          id: editing.id,
          name: name.trim(),
          base_url: effectiveBaseUrl.trim(),
          ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
        },
        { onSuccess: onDone },
      );
    } else {
      createConnection.mutate(
        {
          name: name.trim(),
          protocol: 'openai_chat',
          base_url: effectiveBaseUrl.trim(),
          preset_id: presetId === 'custom' ? null : presetId,
          timeout_secs: timeoutSecs ? Number(timeoutSecs) : null,
          api_key: apiKey.trim(),
        },
        { onSuccess: onDone },
      );
    }
  };

  const busy = createConnection.isPending || updateConnection.isPending;

  return (
    <div className="rounded-xl border border-[#E5E7EB] dark:border-white/[0.08] bg-[#FAFAFA] dark:bg-white/[0.02] p-4 space-y-3">
      {!editing && (
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p.id)}
              title={p.note}
              className={cn(
                'px-2.5 py-1 rounded-full text-[12px] transition-colors',
                presetId === p.id
                  ? 'bg-[#7C72F6] text-white'
                  : 'bg-[#F3F4F6] dark:bg-white/[0.06] text-[#6B7280] hover:bg-[#E5E7EB] dark:hover:bg-white/[0.1]',
              )}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="显示名称"
          className="text-[13px] px-3 py-2 rounded-lg border border-[#D1D5DB] dark:border-white/[0.10] bg-transparent outline-none focus:border-[#7C72F6] text-[#111827] dark:text-white/90"
        />
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="API 基础地址,如 https://api.example.com/v1"
          className="text-[13px] px-3 py-2 rounded-lg border border-[#D1D5DB] dark:border-white/[0.10] bg-transparent outline-none focus:border-[#7C72F6] text-[#111827] dark:text-white/90"
        />
      </div>
      <input
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder={editing ? '替换 API Key(留空保持不变)' : 'API Key(仅存入系统凭证管理器)'}
        className="w-full text-[13px] px-3 py-2 rounded-lg border border-[#D1D5DB] dark:border-white/[0.10] bg-transparent outline-none focus:border-[#7C72F6] text-[#111827] dark:text-white/90"
      />
      <button
        type="button"
        onClick={() => setShowAdvanced((s) => !s)}
        className="inline-flex items-center gap-1 text-[12px] text-[#6B7280] hover:text-[#7C72F6]"
      >
        {showAdvanced ? <ChevronDown size={13} /> : <ChevronRight size={13} />}高级选项
      </button>
      {showAdvanced && (
        <div className="flex items-center gap-2 text-[12px] text-[#6B7280]">
          <span>单次请求超时(秒,默认 120)</span>
          <input
            value={timeoutSecs}
            onChange={(e) => setTimeoutSecs(e.target.value.replace(/\D/g, ''))}
            placeholder="120"
            className="w-20 px-2 py-1 rounded-lg border border-[#D1D5DB] dark:border-white/[0.10] bg-transparent outline-none focus:border-[#7C72F6] text-[#111827] dark:text-white/90"
          />
        </div>
      )}
      <p className="text-[11px] text-[#9CA3AF]">
        地址填写到基础路径即可(不需要包含 /chat/completions);是否带 /v1 取决于你的服务商文档。
        {!editing && ' 首版预设标记为"文档适配",未做真实调用验收。'}
      </p>
      <div className="flex justify-end gap-2">
        <button onClick={onDone} className="px-3 py-1.5 rounded-lg text-[13px] text-[#6B7280] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06]">
          取消
        </button>
        <button
          onClick={submit}
          disabled={busy || !name.trim() || !effectiveBaseUrl.trim() || (!editing && !apiKey.trim())}
          className="px-4 py-1.5 rounded-lg text-[13px] bg-[#7C72F6] text-white hover:bg-[#6C63E6] disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
        >
          {busy && <Loader2 size={13} className="animate-spin" />}保存连接
        </button>
      </div>
    </div>
  );
}

function ModelRow({
  model,
  isDefault,
}: {
  model: AiModelInfo;
  isDefault: boolean;
}) {
  const setDefault = useSetAiDefaultModel();
  const deleteModel = useDeleteAiModel();
  const verify = useVerifyAiModel();

  return (
    <div className="rounded-xl border border-[#E5E7EB] dark:border-white/[0.08] bg-white dark:bg-[#1e1e32] p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-medium text-[#111827] dark:text-white/90 flex-1 truncate">
          {model.display_name}
          <span className="ml-1.5 text-[11px] text-[#9CA3AF] font-normal">{model.model_id}</span>
        </span>
        {isDefault ? (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#7C72F6]/[0.10] text-[#7C72F6] font-medium">默认</span>
        ) : (
          <button
            onClick={() => setDefault.mutate(model.id)}
            className="text-[11px] px-2 py-0.5 rounded-full text-[#6B7280] hover:text-[#7C72F6] hover:bg-[#7C72F6]/[0.06]"
          >
            设为默认
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {VERIFY_KINDS.map(({ kind, label }) => (
          <button
            key={kind}
            onClick={() => verify.mutate({ modelEntryId: model.id, kind })}
            disabled={verify.isPending}
            className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-[#F3F4F6] dark:bg-white/[0.04] text-[#6B7280] hover:bg-[#E5E7EB] dark:hover:bg-white/[0.08] disabled:opacity-50"
          >
            {verify.isPending && verify.variables?.modelEntryId === model.id ? (
              <Loader2 size={11} className="animate-spin" />
            ) : null}
            验证{label}
          </button>
        ))}
        <span className="flex-1" />
        {VERIFY_KINDS.map(({ kind }) => (
          <VerificationBadge key={kind} model={model} kind={kind} />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => deleteModel.mutate(model.id)}
          disabled={isDefault}
          title={isDefault ? '默认模型不能直接删除,请先更换默认' : '删除模型'}
          className="text-[11px] inline-flex items-center gap-1 text-[#9CA3AF] hover:text-[#EF4444] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Trash2 size={11} />删除
        </button>
      </div>
    </div>
  );
}

function ConnectionCard({
  connection,
  models,
  defaultModelId,
}: {
  connection: AiConnectionInfo;
  models: AiModelInfo[];
  defaultModelId: string | null;
}) {
  const [expanded, setExpanded] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const deleteConnection = useDeleteAiConnection();
  const setEnabled = useSetAiConnectionEnabled();
  const fetchModels = useFetchAiModels();
  const createModel = useCreateAiModel();
  const [manualModelId, setManualModelId] = useState('');

  const myModels = models.filter((m) => m.connection_id === connection.id);

  return (
    <div className="rounded-xl border border-[#E5E7EB] dark:border-white/[0.08] bg-white dark:bg-[#1e1e32] overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button onClick={() => setExpanded((e) => !e)} className="flex-1 flex items-center gap-2 text-left">
          {expanded ? <ChevronDown size={14} className="text-[#9CA3AF]" /> : <ChevronRight size={14} className="text-[#9CA3AF]" />}
          <span className="text-[13px] font-medium text-[#111827] dark:text-white/90">{connection.name}</span>
          <span className="text-[11px] text-[#9CA3AF] truncate hidden sm:inline">{connection.base_url}</span>
        </button>
        <span
          className={cn(
            'inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full',
            connection.credential_present
              ? 'text-[#10B981] bg-[#ECFDF5] dark:bg-emerald-950/30'
              : 'text-[#F59E0B] bg-[#FFFBEB] dark:bg-amber-950/30',
          )}
        >
          <KeyRound size={11} />
          {connection.credential_present ? 'Key 已配置' : '需重新填写 Key'}
        </span>
        <label className="inline-flex items-center gap-1 text-[11px] text-[#6B7280] cursor-pointer">
          <input
            type="checkbox"
            checked={connection.enabled}
            onChange={(e) => setEnabled.mutate({ id: connection.id, enabled: e.target.checked })}
            className="accent-[#7C72F6]"
          />
          启用
        </label>
      </div>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-[#F3F4F6] dark:border-white/[0.05] pt-2.5">
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchModels.mutate(connection.id)}
              disabled={fetchModels.isPending}
              className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#F3F4F6] dark:bg-white/[0.04] text-[#6B7280] hover:bg-[#E5E7EB] dark:hover:bg-white/[0.08] disabled:opacity-50"
            >
              {fetchModels.isPending ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
              获取模型列表
            </button>
            {fetchModels.data && <span className="text-[11px] text-[#9CA3AF]">获取到 {fetchModels.data.length} 个,点击下方添加</span>}
            {fetchModels.isError && <span className="text-[11px] text-[#F59E0B]">获取失败,可手动填写</span>}
          </div>

          {fetchModels.data && fetchModels.data.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {fetchModels.data
                .filter((id) => !myModels.some((m) => m.model_id === id))
                .slice(0, 30)
                .map((id) => (
                  <button
                    key={id}
                    onClick={() => createModel.mutate({ connectionId: connection.id, modelId: id })}
                    className="text-[11px] px-2 py-0.5 rounded-full bg-[#F3F4F6] dark:bg-white/[0.06] text-[#6B7280] hover:bg-[#7C72F6] hover:text-white"
                  >
                    + {id}
                  </button>
                ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              value={manualModelId}
              onChange={(e) => setManualModelId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  createModel.mutate(
                    { connectionId: connection.id, modelId: manualModelId.trim() },
                    { onSuccess: () => setManualModelId('') },
                  );
                }
              }}
              placeholder="手动填写模型标识,如 deepseek-chat"
              className="flex-1 text-[12px] px-2.5 py-1.5 rounded-lg border border-dashed border-[#D1D5DB] dark:border-white/[0.10] bg-transparent outline-none focus:border-[#7C72F6] text-[#111827] dark:text-white/90"
            />
            <button
              onClick={() =>
                createModel.mutate(
                  { connectionId: connection.id, modelId: manualModelId.trim() },
                  { onSuccess: () => setManualModelId('') },
                )
              }
              disabled={!manualModelId.trim()}
              className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-[#7C72F6] text-white hover:bg-[#6C63E6] disabled:opacity-40"
            >
              <Plus size={14} style={{ strokeWidth: 2.5 }} />
            </button>
          </div>

          <div className="space-y-2">
            {myModels.map((m) => (
              <ModelRow key={m.id} model={m} isDefault={defaultModelId === m.id} />
            ))}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => setShowForm((s) => !s)}
              className="text-[11px] text-[#6B7280] hover:text-[#7C72F6] inline-flex items-center gap-1"
            >
              <ShieldCheck size={11} />{showForm ? '收起' : '替换 Key / 修改地址'}
            </button>
            <span className="flex-1" />
            <button
              onClick={() => deleteConnection.mutate(connection.id)}
              className="text-[11px] inline-flex items-center gap-1 text-[#9CA3AF] hover:text-[#EF4444]"
            >
              <Trash2 size={11} />删除连接
            </button>
          </div>
          {showForm && <ConnectionForm editing={connection} onDone={() => setShowForm(false)} />}
        </div>
      )}
    </div>
  );
}

export function AiModelSettings() {
  useTranslation();
  const { data: connections = [] } = useAiConnections();
  const { data: models = [] } = useAiModels();
  const { data: defaultModelId } = useAiDefaultModel();
  const { data: invocations = [] } = useAiInvocations(10);
  const clearInvocations = useClearAiInvocations();
  const [showNewForm, setShowNewForm] = useState(false);

  const defaultModel = useMemo(
    () => models.find((m) => m.id === defaultModelId),
    [models, defaultModelId],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot size={15} className="text-[#7C72F6]" />
          <span className="section-label">AI 模型</span>
        </div>
        <button
          onClick={() => setShowNewForm((s) => !s)}
          disabled={showNewForm}
          className="text-[12px] inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#7C72F6] text-white hover:bg-[#6C63E6] disabled:opacity-40"
        >
          <Plus size={12} />新增服务
        </button>
      </div>

      {showNewForm && <ConnectionForm onDone={() => setShowNewForm(false)} />}

      {connections.length === 0 && !showNewForm && (
        <p className="text-[12px] text-[#9CA3AF] py-2">
          还没有配置模型服务。点击"新增服务",使用预设或自定义兼容地址;API Key 只保存在本机系统凭证存储中。
        </p>
      )}

      <div className="space-y-2">
        {connections.map((c) => (
          <ConnectionCard key={c.id} connection={c} models={models} defaultModelId={defaultModelId ?? null} />
        ))}
      </div>

      <div className="rounded-xl border border-[#E5E7EB] dark:border-white/[0.08] p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles size={13} className="text-[#7C72F6]" />
          <span className="text-[12px] font-medium text-[#111827] dark:text-white/90">全局默认模型</span>
        </div>
        <p className="text-[12px] text-[#6B7280]">
          {defaultModel
            ? `当前:${defaultModel.display_name}(所有 AI 功能共用)`
            : '尚未选择。验证通过某个模型后,点击"设为默认"。'}
        </p>
      </div>

      <div className="rounded-xl border border-[#E5E7EB] dark:border-white/[0.08] p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-medium text-[#111827] dark:text-white/90">最近调用</span>
          <button
            onClick={() => clearInvocations.mutate()}
            className="text-[11px] text-[#9CA3AF] hover:text-[#EF4444]"
          >
            清除摘要
          </button>
        </div>
        {invocations.length === 0 && <p className="text-[11px] text-[#9CA3AF]">暂无调用记录(仅保存摘要,不含请求与回复内容)</p>}
        {invocations.slice(0, 5).map((inv) => (
          <div key={inv.id} className="flex items-center gap-2 text-[11px] text-[#6B7280]">
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full shrink-0',
                inv.status === 'success' ? 'bg-[#10B981]' : inv.status === 'cancelled' ? 'bg-[#9CA3AF]' : 'bg-[#EF4444]',
              )}
            />
            <span className="truncate flex-1">
              {inv.connection_snapshot}
              {inv.error_code ? ` · ${inv.error_code}` : ''}
              {inv.usage?.total_tokens != null ? ` · ${inv.usage.total_tokens} tokens` : ''}
            </span>
            <span className="shrink-0 text-[#9CA3AF]">{inv.created_at.slice(5, 16)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
