## Context

设计依据 `docs/AI_MODEL_ACCESS_DESIGN.md`(四轮交流后的首版范围)。代码现状关键约束:

- Rust 侧 `AppState.db` 为 `Arc<Mutex<rusqlite::Connection>>` 单连接,同步命令在主线程执行;异步命令(先例 `note_commands.rs open_task_note`)跑在线程池,但 MutexGuard 不能跨 await。
- 迁移机制为 `db/migrations.rs` 的 `user_version` 递进,当前 v16;`tasks.source` 列已存在,`task_repo::create` 的 `CreateTaskRequest` 已含 `source` 字段,GUI 命令固定 `None`,界面已识别 `source === 'agent'`。
- `AppError` 序列化为纯字符串(`error.rs`),前端各处 `String(e)`;不适合承载机器可读错误码。
- 设置同步白名单仅 `theme|language`(`sync_repo.rs is_syncable_setting_key`),settings 表键默认不同步。
- 前端有 domain 仓储边界(`domain/repositories` + desktop/memory 适配器)、TanStack Query、Zustand;任务详情富文本描述走 800ms 防抖自动保存(`TaskDetail.tsx doSave`)。
- 整库备份复制 `todo.db` 文件;导入(`import_database`)按表 INSERT OR IGNORE,不触碰新表即天然不覆盖模型配置。

## Goals / Non-Goals

**Goals:**

- Rust 侧新增 `src-tauri/src/ai/` 模块,职责分层对齐设计文档 §4,可被未来 Android 端以同契约复用业务规则。
- 结构化错误(`AiError { code, message }`)与 `AppError` 并存,AI 命令统一返回前者。
- 凭证经 Windows 凭据管理器(keyring crate,`windows-native` 特性)存取,条目名 `com.todoflow.desktop/ai/<connection_id>`;数据库只存 `credential_version` 与隐式引用。
- HTTP 层用 reqwest(rustls-tls、stream),流式 SSE 增量解析;取消用 `tokio::select!` + 请求注册表。
- 采纳走独立命令,`unchecked_transaction` 单事务完成幂等检查、指纹比对、逐项创建(`source=Some("agent")`)与回执写入。

**Non-Goals:**

- 不改 `AppError` 既有序列化行为,不迁移现有命令。
- 不引入通用 Agent 框架、向量库、工作流引擎;不做 Responses/厂商原生协议(适配器 trait 留位)。
- 不做 Android 实现(Windows 凭证/网络行为通过 trait 边界隔离即可)。
- 不把模型配置塞进通用设置 JSON——连接与模型独立建表。

## Decisions

### D1: 模块布局与命令层

`src-tauri/src/ai/` 下按职责分文件:`error.rs`(AiError + 错误码枚举)、`credentials.rs`(CredentialStore trait + WindowsKeyringStore)、`config_repo.rs`(连接/模型/验证记录 CRUD)、`presets.rs`(预设常量)、`adapter/`(ProviderAdapter trait + openai_chat 实现)、`gateway.rs`(请求运行时)、`probe.rs`(验证)、`diagnostics.rs`(调用摘要)、`breakdown.rs`(拆解生成)、`apply.rs`(采纳事务)。`commands/ai_commands.rs` 做 tauri 命令注册层,薄封装。

理由:commands/ 现有文件均为"仓储调用 + emit"薄层;重逻辑放 db/ 与领域模块是既有惯例(如 reminders.rs、shortcuts.rs 顶层模块)。ai/ 单独成模块是因为它不依赖数据库锁的网络生命周期管理,与 CRUD 命令混放会模糊边界。

### D2: 结构化错误不并入口径化 AppError

`AiError` 含 `code`(serde snake_case 枚举,覆盖 spec 的 13 类)、`message`(用户可读中文)、可选 `detail`(脱敏)。命令返回 `Result<T, AiError>`,tauri 序列化为 JSON 对象,前端 `err.code` 判断分类。内部 `AppError`/`rusqlite` 错误在 ai 模块边界转换为对应 AiError code。

理由:改 AppError 序列化会波及全部现有前端 `String(e)` 调用点;独立类型零回归。备选(给 AppError 加 kind 字段)被否——序列化格式变更影响面不可控。

### D3: 数据模型(迁移 v17,五张表,全部本地)

```
ai_connections(id TEXT PK, name, protocol, base_url, preset_id, credential_version INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 1, enabled INTEGER DEFAULT 1, timeout_secs INTEGER NULL, created_at, updated_at)
ai_models(id TEXT PK, connection_id REFERENCES ai_connections ON DELETE CASCADE, model_id, display_name, created_at, updated_at)
ai_model_verifications(id TEXT PK, model_entry_id REFERENCES ai_models ON DELETE CASCADE, kind TEXT CHECK(basic|stream|breakdown), status TEXT CHECK(unknown|passed|unsupported|failed|expired), fingerprint TEXT, detail TEXT, verified_at)
ai_invocations(id TEXT PK, purpose TEXT, model_entry_id, connection_snapshot TEXT, status TEXT, error_code TEXT NULL, duration_ms INTEGER, usage TEXT NULL, created_at)  -- 调用摘要,不含正文
ai_apply_receipts(operation_id TEXT PK, proposal_id, task_id, item_count, content_hash, created_at, result TEXT)
```

- 凭证引用隐式:条目名即 `com.todoflow.desktop/ai/<connection_id>`;`credential_version` 随每次替换 +1,参与验证指纹。存在性查询走 keyring,查询不到即"需重新填写"。
- 默认模型:settings 键 `ai_default_model`(存 ai_models.id),白名单外天然不同步。
- `ai_invocations` 写入时顺手清理 30 天前/超 1000 条的旧记录。
- import_database 不读这些表 → 导入不覆盖;backup 复制整库但凭证本就不在库内。

备选(凭证存 DPAPI 加密文件)被否:keyring 的 windows-native 后端即 CredWrite,系统级隔离且省自实现。

### D4: 运行时网关 `AiRuntime`(tauri State)

```
pub struct AiRuntime {
  http: reqwest::Client,                       // 连接池复用,UA 固定
  permits: Arc<Semaphore>,                     // 并发 2
  in_flight: Mutex<HashMap<String, oneshot::Sender<()>>>,  // requestId → 取消信号
  active_breakdowns: Mutex<HashSet<String>>,   // 同任务单飞
  proposals: Mutex<HashMap<String, StoredProposal>>,       // proposalId → 候选缓存(内存,退出即弃)
}
```

命令流程:校验配置/凭证(短持锁读库)→ drop guard → 组装请求快照 → `tokio::spawn` 执行(带超时 + oneshot 取消 + 信号量)→ 进度经 `app.emit_to("main", "ai-request-progress", {request_id, delta|status})` → 结束写 `ai_invocations`(短持锁)。晚响应:取消信号触发后 spawn 分支直接丢弃,不 emit、不写库为成功。

### D5: Chat Completions 地址与参数规则

- URL:用户填基础地址(必填,要求 https);拼接规则:去尾 `/` 后追加 `/chat/completions`(基础地址含 `/v1` 与否完全由用户决定);若用户输入已以 `/chat/completions` 结尾则报 Validation 提示修正。模型列表端点为 `<base>/models`。
- 请求体:仅发 `model`、`messages`、`stream`;`max_tokens` 仅在用户显式配置输出上限时携带;不默认发 temperature/推理参数。拆解请求优先带 `response_format: {type:"json_object"}`,发送前标记"已请求 JSON",若服务报 4xx 再降级为纯文本重试一次并记录(界面注明"该服务未声明 JSON 模式")。
- 响应:`choices[0].finish_reason` 规范化为 `stop|length|content_filter|other`;`usage` 缺失记 null(界面"用量未知")。字节上限:响应体累积 2 MiB、单行 SSE 64 KiB,超限报 Format 错误。
- 错误分类:HTTP 401/403→auth_failed,404→model_not_found(注明可能是模型标识或地址错误),429→rate_limited,5xx/连接错误→connection_failed,总超时→timeout,body 解析失败→invalid_format。

### D6: 拆解流程与上下文指纹

- generate 命令只收 `task_id` + `user_note`;后端读任务与子任务(短持锁),描述经简化 HTML→文本(仅移除标签,不保留 img data);提示词为中文系统提示 + 用户消息(标题/描述文本/现有子任务标题与完成态/补充要求),要求输出 `{"assumptions":[...],"items":[{"title","instructions"}]}` 纯 JSON。
- 本地校验:剥代码围栏 → serde 解析 → 字段校验(标题 1..=120 字符,说明 0..=2000,items 1..=20,assumptions 0..=10,每项 ≤200 字符),非法项整批拒绝(format 错误)。
- 上下文指纹 = SHA256(父任务标题+描述规范化文本+现有子任务有序 (标题,完成态) 列表)。proposal 存内存(Runtime.proposals),含指纹、模型快照、候选。采纳时重算比对,不一致报 context_changed。
- 同任务单飞:`active_breakdowns` 命中即返回 conflict 类错误提示"该任务正在拆解"。

### D7: 采纳事务

`apply_breakdown(parent_task_id, proposal_id, operation_id, items)`:事务内 ① 查 `ai_apply_receipts` 有 operation_id → 返回原 result(幂等);② 查 proposal 内存缓存,无 → expired;③ 重算指纹,不匹配 → context_changed;④ 逐项 `task_repo::create(CreateTaskRequest{ source: Some("agent"), parent_task_id, title, description: instructions 纯文本, ..Default 语义 })`(task_repo 内部已自动记同步操作);⑤ 写回执(operation_id, content_hash, 创建 ID 列表);提交后 emit 一次 `task-changed`。重复 proposal_id 已有成功回执 → conflict;同 operation_id 内容 hash 不同 → conflict。

`instructions` 入库为纯文本(换行保留);前端展示子任务描述沿用现有 HTML 兼容渲染(纯文本无标签,`wrapPlainText` 语义安全)。

### D8: 前端接入

- domain:`src/domain/models/ai.ts`(类型)+ repositories/index.ts 新增 `AiModelRepository`(配置/凭证/验证/调用/拆解/采纳/诊断七组方法)+ desktop.ts 接 `src/lib/db.ts` 新增 invoke 包装;memory.ts 提供 Web/test 替身(拆解返回固定样例)。
- 设置页:SettingsPage 新增"AI 模型"卡片区块,内嵌连接列表 + 新增/编辑表单(预设下拉预填)+ 模型列表(获取/手填/验证按钮/默认选择)+ 高级区(超时)。组件放 `src/components/ai/`。
- 拆解面板:`src/components/ai/BreakdownPanel.tsx`,TaskDetail 子任务标题行加"AI 拆解"按钮(仅顶层任务渲染)。TaskDetail 需暴露可等待的 `flushSave`(把现有 doSave + 定时器状态收敛为返回 Promise 的方法,保存失败 reject);生成前 await 它。
- 进度:面板按 requestId 过滤 `ai-request-progress` 事件展示流式增量;采纳成功后 invalidate 任务详情。
- 文案:按项目现状硬编码中文(i18n 键位后续统一补)。

## Risks / Trade-offs

- [keyring windows-native 在部分环境(域控策略)写入失败] → 阶段 1 先做 spike 验证;保存失败明确报错、不显示成功、不留悬挂引用(写新条目→提交配置→删旧条目,失败时回滚配置行)。
- [reqwest 代理/TLS 行为在目标 Windows 环境未验证] → 阶段 2 用本地 mock 服务器(TcpListener 手写 SSE)覆盖流式/取消/超时;真实验收延后到用户提供 Key。
- [Mutex 单连接下 ai_invocations 写入与长任务 UI 写库竞争] → 全部 DB 访问收敛为短临界区,任何 await 前 drop guard;网关不持锁。
- [流式 JSON 无完成保证] → 只在 finish_reason=stop 且校验通过后才产出候选;length/中断一律 format 错误。
- [内存 proposal 缓存随重启丢失] → 设计允许(候选不跨会话恢复);回执在库,重复提交仍幂等。
- [拆解 JSON 模式兼容差异] → response_format 失败自动降级纯文本重试一次,界面注明;不做多轮修复循环。

## Migration Plan

迁移 v17 仅新增表,不动既有表;旧版本数据库打开即自动升级。回滚 = 删除五张新表(数据均为可重建的本地配置)。无服务器端变更。

## Open Questions

- 真实验收用哪家服务的测试 Key(OpenAI/DeepSeek/Gemini 任一)——不阻塞开发,仅阻塞"预设标记为运行验证通过"。
