## Why

TodoFlow 计划内置 AI 功能,但当前应用没有任何模型配置、凭证管理或模型调用能力,首个目标功能"任务拆解"也无法落地。需要一套可复用的模型接入模块,让用户自带 API Key、在应用内完成配置与验证,并交付第一个真实业务功能。

依据:`docs/AI_MODEL_ACCESS_DESIGN.md`(2026-10-25,已完成四轮设计交流,范围已确认)。

## What Changes

- 新增模型接入模块:多组服务连接与模型条目的本地管理(不同步)、全局默认模型选择、系统凭证存储(Windows 凭据管理器,Key 不入库、不进备份、不同步)。
- 新增 OpenAI 兼容 Chat Completions 适配器:统一请求/结果契约、基础地址拼接规则、流式与非流式接收、取消、超时、错误分类与有限调用诊断摘要。
- 新增能力验证:基础文本生成、流式接收、任务拆解样例三类验证,基于配置指纹判定过期;支持从服务获取模型列表,也允许手填。
- 新增"设置 → AI 模型"页面:服务预设(智谱 GLM/OpenAI/DeepSeek/Gemini/自定义)与连接表单、模型列表、凭证状态(仅"已配置",可替换/删除)、验证状态与最近调用摘要。
- 新增任务拆解功能:任务详情"AI 拆解"入口,生成假设与候选子任务,预览中编辑勾选,经独立采纳命令批量创建子任务(来源标记 `agent`),含上下文变化检测与重复采纳保护。
- 新增依赖:reqwest(rustls-tls,流式)、keyring(Windows 凭据);新增数据库迁移 v17(ai_connections、ai_models、ai_model_verifications、ai_invocations、ai_apply_receipts)。
- 模型配置、验证状态、凭证与调用摘要均按设备本地管理,不进入任务同步白名单;整库备份不含凭证本体。

不包含(首版明确排除):统一模型额度、独立云端代理、Responses/厂商原生接口、本地模型管理、自动模型路由、完整对话历史、自主 Agent 执行。

## Capabilities

### New Capabilities

- `ai-model-access`: 模型服务连接、模型条目与全局默认模型的本地管理;凭证的保存/替换/删除与存在性状态;OpenAI 兼容调用的统一契约、生命周期(取消/超时/错误分类)与能力验证;有限调用诊断摘要及其清理边界。
- `task-breakdown`: 任务拆解功能:入口与输入范围约束、生成结果的本地结构校验、假设与候选的预览编辑、独立采纳命令的幂等事务与上下文一致性保护。

### Modified Capabilities

无。任务采纳复用现有任务创建规则与同步机制,`source='agent'` 标记与界面展示已存在,不改变现有任务能力的需求。

## Impact

- Rust 后端:新增 `src-tauri/src/ai/`(error/credentials/config_repo/presets/adapter/gateway/probe/diagnostics/breakdown/apply)与 `commands/ai_commands.rs`,在 `lib.rs` 注册;`db/migrations.rs` 追加 v17;`Cargo.toml` 新增 reqwest、keyring。
- 前端:domain 层新增 `AiModelRepository` 契约与 desktop/memory 适配器;`src/lib/db.ts` 新增调用包装;新增 `src/components/ai/`(设置区块 + 拆解面板);`SettingsPage` 增加"AI 模型"区块;`TaskDetail` 子任务区增加"AI 拆解"入口,并把防抖保存改造出可等待的 flush 能力。
- 数据与同步:五张新表全部本地管理;默认模型走 settings 键 `ai_default_model`(白名单外,不同步);采纳产生的子任务是普通任务,沿用现有同步、备份与编辑机制。
- 测试:Rust 单测/集成测试(迁移、配置仓储、适配器地址规则、SSE 解析、拆解校验、采纳事务幂等与回滚)+ 前端 vitest(设置表单、拆解面板、适配器替身)+ Windows 真实调用验收(需用户提供测试 API Key)。
