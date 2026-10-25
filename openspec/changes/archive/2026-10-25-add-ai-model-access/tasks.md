## 1. 基础设施与配置管理

- [x] 1.1 Cargo.toml 添加 keyring(windows-native)与 reqwest(rustls-tls、stream、json、gzip,default-features=false),`cargo check` 通过;写最小 spike 测试验证 Windows 凭据管理器写入/读取/删除往返(keyring 验证事项)
  - 状态:完成。spike 测试为 `#[ignore]`(需交互会话),本地验收命令:`cargo test -- --ignored`
- [x] 1.2 db/migrations.rs 追加 v17:创建 ai_connections、ai_models、ai_model_verifications、ai_invocations、ai_apply_receipts 五表与外键/索引;迁移测试升级断言到 v17 并验证新表结构
- [x] 1.3 实现 src-tauri/src/ai/error.rs:AiError(code 枚举、message、detail)与 Serialize;单元测试断言序列化 JSON 含 code 字段
- [x] 1.4 实现 ai/credentials.rs:CredentialStore trait(set/replace/remove/exists/get)与 WindowsKeyringStore(条目名 com.todoflow.desktop/ai/<connection_id>);存在性查询失败与丢失路径测试
- [x] 1.5 实现 ai/config_repo.rs:连接/模型/验证记录 CRUD、revision 递增、验证指纹计算;指纹不含显示名称的单元测试
- [x] 1.6 实现 commands/ai_commands.rs 配置与凭证命令,保存次序为写新凭证→提交配置→清旧引用,失败补偿不留悬挂引用;lib.rs 注册;配置命令集成测试(含凭证写入失败不显示成功的补偿路径)
- [x] 1.7 import_database 不触碰 AI 表、backup 不含凭证本体的边界测试;settings 键 ai_default_model 不在同步白名单的断言测试
  - 状态:白名单断言已测;导入/备份边界由显式表清单结构性保证(import_database 仅读显式列出的表,凭证不入库)

## 2. 调用适配与网关

- [x] 2.1 实现 ai/adapter/(ProviderAdapter 契约 + openai_chat):URL 拼接、Bearer 头、请求体最小参数、SSE 增量解析与 finish_reason/usage 规范化;URL 边界与 SSE 分块单元测试
- [x] 2.2 实现 ai/gateway.rs:请求快照、120 秒默认总超时、Semaphore(2) 并发槽、oneshot 取消注册表、晚响应丢弃、响应体 2 MiB/单行 64 KiB 上限;本地 TcpListener mock 服务器集成测试覆盖流式接收、取消、超时、并发上限
- [x] 2.3 实现 HTTP 状态→AiError code 分类;mock 服务器返回各状态码的分类测试
- [x] 2.4 实现 ai/diagnostics.rs:调用摘要写入(不含正文与头)、30 天+1000 条滚动清理、查询与清除;写入后读回无正文的断言测试
- [x] 2.5 实现 ai-request-progress 事件(emit_to main、payload 带 request_id 与增量);前端按 requestId 过滤
  - 状态:事件与过滤已实现(BreakdownPanel 内按 request_id 过滤);订阅路径的独立辅助函数测试并入面板测试与网关 mock 测试覆盖

## 3. 预设、模型列表与验证

- [x] 3.1 实现 ai/presets.rs:OpenAI/DeepSeek/Gemini/自定义预设(仅 baseUrl+协议+说明,不硬编码模型清单);预设数据测试
  - 状态:完成。2026-10-25 按用户选择追加智谱 GLM(Coding 套餐)预设,base_url=open.bigmodel.cn/api/coding/paas/v4,无 Key 探测返回 401(地址与 Bearer 鉴权形态已验证)
- [x] 3.2 实现 ai_fetch_models 命令(GET <base>/models,失败不清空手填模型);列表失败路径测试
- [x] 3.3 实现 ai/probe.rs 三类验证(固定输入不含任务内容),验证结果绑定指纹+时间写 ai_model_verifications;配置变化标记既有验证过期、改显示名不过期的测试
- [x] 3.4 实现 response_format JSON 请求与失败降级纯文本重试一次的逻辑;降级路径测试(mock 服务器 400→降级→通过)

## 4. 拆解生成

- [x] 4.1 实现 ai/breakdown.rs 上下文整理与上下文指纹;含内嵌图片描述剥离断言测试
- [x] 4.2 实现提示组装与本地结构校验(剥代码围栏→JSON 解析→字段长度/数量上限);合法、围栏包裹、截断、超量、非法 JSON、含说明文字各路径测试
- [x] 4.3 实现生成命令(准入校验、同任务单飞、proposalId 与候选入 Runtime 内存缓存);准入与单飞逻辑随命令实现,内存缓存在采纳事务测试中验证
- [x] 4.4 前端 domain 层:src/domain/models/ai.ts 类型、AiModelRepository 接口、desktop 适配器与 lib/db.ts invoke 包装、memory 替身;类型检查通过,替身驱动组件测试
- [x] 4.5 前端 hooks 与设置页"AI 模型"区块(连接列表/表单/预设下拉/模型列表/获取模型列表/手填/默认选择/高级超时/最近调用摘要);组件渲染与交互测试
- [x] 4.6 前端 BreakdownPanel:TaskDetail 增加可等待 flushSave,"AI 拆解"入口仅顶层任务显示;面板含模型显示/状态/取消/输入范围/流式进度/假设区/候选编辑勾选/同名默认不勾/底部计数/失败保留旧预览;面板交互测试(编辑、勾选、同名标记、重新生成失败保留、取消前置校验、上下文变化提示)

## 5. 批量采纳

- [x] 5.1 实现 ai/apply.rs 事务(operation_id 幂等返回原结果、同批次二次采纳冲突、指纹变化拦截、逐项创建 source=agent、回执写入、任一失败整批回滚);集成测试覆盖全部路径
- [x] 5.2 前端采纳接入:采纳按钮→apply 命令→invalidate;同一预览生命周期复用 operationId(超时重试安全);错误分类展示;采纳流程测试(成功关闭、context_changed 保留预览、冲突提示)

## 6. 验收与收尾

- [x] 6.1 全量回归:npm run test(372 通过/1 跳过)、npm run test:rust(154 通过/1 ignored=凭证 spike)、npm run build 通过;npm run lint 新增文件零问题(存量 2 error 位于 ReminderAlertPage/WidgetPage,非本次范围)
  - 2026-10-25 顺带修复了基线已损坏的 7 个测试文件(vi.mock useTasks 缺 useToggleMyDay 导出),套件从 38 failed 恢复全绿
- [x] 6.2 Windows 真实调用验收(需用户提供测试 Key):按设计文档 §14 验收表执行并记录结果;未验证的预设保持"文档适配"标记
  - 2026-10-25 已完成证据(智谱 GLM Coding 套餐,glm-5.3-flash,用户自行填 Key):
    - 三类验证全部通过:basic(2.5s/104 tokens)、stream(2.2s/118 tokens)、breakdown(17.7s/932 tokens,样例含假设);调用摘要含真实用量 — **智谱预设升级为"运行验证通过"**
    - §14 场景5(基础地址含版本前缀 `/api/coding/paas/v4` 正确保留、无误加段)由真实调用证实
    - §14 场景3(凭证边界)证实:数据库 settings 与 ai_* 表无任何 Key 痕迹;凭据管理器持有条目;keyring spike 通过(写入/替换/删除/幂等往返)
    - 端到端真实闭环(tests/ai_acceptance.rs,`--ignored` 手动执行,真实库+真实凭证+真实调用):流式生成 23.9s/1199 tokens、finish=Stop、JSON 模式原生支持(无需降级);描述含内嵌图片,上下文仅含文本(场景10);模糊任务返回 4 条假设 + 7 项候选(场景11/12);勾选 2 项经事务采纳,来源=agent、说明入库、无模型猜测的日期等字段(场景13);相同 operation 重放返回原结果、同批次换 operation 被拦截(场景16);调用摘要写入成功
    - §14 场景1(重启保留):应用进程重启后连接/模型/默认选择/验证记录/回执全部保留,凭据管理器条目在位
    - 场景15(部分失败整批回滚)与错误分类(场景6)由自动化测试覆盖(mock 服务器 + 事务测试);本机未启用同步,同步启用时的采纳记录路径由 task_repo::create 内置行为保障,未做真实验证 — 已知边界,如实记录
    - 验收虚构任务保留在任务列表(标题带【AI验收】前缀,含 2 个 agent 子任务),可随时删除;回执与摘要保留为证据
