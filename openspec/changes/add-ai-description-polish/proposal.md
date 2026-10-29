## Why

AI 线首版(任务拆解)只覆盖"创建子任务"场景,而快速捕获的任务往往只有一句标题、描述为空或杂乱。补一个轻量的描述生成/润色能力,让模型接入模块的复用价值更直观,也让"小有成果再发布"的 AI 线有第二个可交付功能。

## What Changes

- 任务详情描述区新增"AI 润色"入口(仅顶层与子任务均可,未完成任务可用):空描述生成结构化说明,已有描述润色重写。
- 生成基于默认模型,输入仅含任务标题、描述文本与现有子任务标题(不传图片/附件/主键,沿用拆解的输入边界)。
- 结果为纯文本预览,可编辑;采纳走现有任务更新流程写入描述字段(段落换行按既有纯文本包装规则),不改其他字段、不标记来源。
- 复用既有基础设施:凭证、网关(超时/取消/并发槽/进度事件)、验证状态、调用摘要;新增 purpose=polish 摘要与 request_id 前缀 polish-。
- 同一任务同一时刻只允许一个 AI 生成(与拆解共用单飞集合)。

不包含:描述版本历史、多轮对话式润色、按任务单独选模型(仍用全局默认模型)。

## Capabilities

### New Capabilities

- `ai-description-polish`: 任务描述的 AI 生成/润色:输入范围、输出约束、预览编辑与经现有更新流程采纳。

### Modified Capabilities

无。任务拆解与模型接入能力的需求不变;描述更新沿用现有任务更新机制。

## Impact

- Rust:`src-tauri/src/ai/polish.rs`(上下文/提示/校验)+ `commands/ai_commands.rs` 新增 `ai_polish_description` 命令 + 注册。
- 前端:`src/components/ai/PolishPanel.tsx`、TaskDetail 描述区入口与 flushSave 复用、domain 契约与 db 包装、memory 替身。
- 测试:Rust 单测(提示组装/校验/截断拒绝)+ 前端面板测试;无需数据库迁移、无新依赖。
