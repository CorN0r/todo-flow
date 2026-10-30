## Why

AI 拆解采纳时已把每条候选的"执行说明"以纯文本写入子任务 `description`(见 task-breakdown 采纳事务),但界面无处展示、无法编辑——数据只写不读,用户既看不到 AI 给的执行说明,也不能修正。同时多处"删除撤销"重建子任务时只回传标题,静默丢掉已有描述。

## What Changes

- 子任务与主任务本就共用 `tasks` 表与 `Task` 模型,`description` 端到端链路(DB/命令/类型/mutation/同步)现成——本次**零后端、零迁移、零类型改动**,纯前端 UI。
- 新建共享组件 `SubtaskDescription`:展示态为标题下方单行截断灰字预览(`stripHtml` 兼容历史 HTML),点击预览展开为与拆解面板"执行说明"同款的轻量 textarea(自动聚焦光标置尾、按内容自适应高度);失焦保存(值变化才提交)、Esc 取消、Enter 换行。
- 列表展开区(TaskCard):子任务行改为"勾选钮 | 标题+描述纵向排布 | 行尾图标",右键菜单新增"编辑描述"项,行尾 hover 出现 AlignLeft 小图标(有描述品牌紫/无描述灰色);编辑中禁用拖拽、与标题 inline 编辑互斥。
- 详情面板(TaskDetail):子任务行提取为 `DetailSubtaskRow`,同款预览与编辑;行尾 hover 图标入口。
- 修复 7 处"删除撤销"重建丢描述:TaskCard×2、TaskDetail×2、StickyNote、ExpandedNote、UnifiedLayout 的重建调用补 `description`。

不包含:移动端子任务描述(移动端子任务尚无 inline 标题编辑,价值低)、快速添加子任务时同时填描述(AI 拆解已覆盖批量带描述创建)、子任务富文本编辑。

## Capabilities

### New Capabilities

- `subtask-description`: 子任务描述的展示、编辑入口与保存语义;删除撤销重建时保留描述。

### Modified Capabilities

无。task-breakdown 的采纳契约不变(instructions→description 写入行为照旧),本变更是该数据的前端消费侧。

## Impact

- 前端:新增 `src/components/tasks/SubtaskDescription.tsx`;修改 TaskCard、TaskDetail(提取 DetailSubtaskRow)、StickyNote、ExpandedNote、UnifiedLayout。
- 测试:新增 `src/test/components/SubtaskDescription.test.tsx`(组件/TaskCard/TaskDetail 三层 16 用例);TaskDetail 子任务删除按钮补 aria-label。
- 无 Rust/DB/同步改动。
