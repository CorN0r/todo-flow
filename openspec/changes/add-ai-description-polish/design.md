## Context

复用 add-ai-model-access 建成的基础设施(见 `openspec/changes/archive/2026-10-25-add-ai-model-access/design.md`):AiRuntime 网关、keyring 凭证、默认模型、验证状态、进度事件 `ai-request-progress`、调用摘要与 `ai/breakdown.rs` 的输入边界模式。本变更只加一个薄功能层。

## Goals / Non-Goals

**Goals:** 一个生成命令 + 一个预览面板;采纳复用现有 `update_task`(描述是用户随时可改的字段,AI 结果等价于用户粘贴文本,无幂等/回执复杂度)。

**Non-Goals:** 不做描述版本历史、多轮对话润色、逐字 diff 视图;不改模型接入与拆解的任何契约。

## Decisions

- **输出契约取纯文本而非 JSON**:润色结果就是描述正文,不需要结构化字段;省掉 json_mode 与降级路径,finish=stop + 长度校验即可。上限 4000 字符(覆盖现有描述编辑器的常规规模)。
- **采纳在前端走 updateTask**:与拆解"批量采纳必须独立事务命令"不同,描述替换是单字段、用户级操作,重复点击最坏是重复写入同一内容,天然安全;后端不新建采纳命令。
- **存储格式**:面板返回纯文本;采纳时前端用既有 `wrapPlainText`(双换行→`<p>`、单换行→`<br>`)包装后提交,与旧数据兼容。
- **单飞**:复用 `AiRuntime.active_breakdowns`(语义升级为"同任务 AI 生成单飞"),润色与拆解互斥,避免同任务并发生成互相覆盖预览。
- **新代码落点**:`ai/polish.rs`(上下文构建/系统提示/校验,纯函数可测)+ `ai_commands::ai_polish_description`(校验准入→读默认模型与连接→释放库锁→网关调用→记摘要);request_id 前缀 `polish-`,摘要 purpose=`polish`。

## Risks / Trade-offs

- [模型输出 Markdown 标记混入描述] → 系统提示明确"纯文本,不用 Markdown 符号";预览可编辑,用户可自行修;不做自动剥离(保留模型格式意图)。
- [润色覆盖用户精心排版的富文本] → 预览阶段始终展示将写入的完整内容,采纳是显式动作;空描述生成时无此风险。

## Migration Plan

无数据库变更、无新依赖;回滚即移除入口与命令。

## Open Questions

无。
