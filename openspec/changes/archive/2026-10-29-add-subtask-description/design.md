## Context

子任务即 `parent_task_id` 非空的 `Task`(同表同模型,两级限制在 repo 层),`description` 从 SQLite 列到前端 `useUpdateTask` 全链路现成;唯一写入方 AI 拆解(`ai/apply.rs`)落的是纯文本。BreakdownPanel 候选卡的"标题 + 说明 textarea"是项目内对"子任务标题+说明"最成熟的交互范式。

## Goals / Non-Goals

**Goals:** 补齐描述的前端消费侧:两处桌面子任务 UI(列表展开区、详情面板)同款展示与编辑;顺带修复撤销重建丢描述。

**Non-Goals:** 不做移动端、快速添加带描述、富文本编辑;不改任何后端契约与数据格式。

## Decisions

- **复用 `description` 字段,维持纯文本约定**:子任务描述的既定数据格式就是纯文本(AI 拆解写入什么就存什么);编辑初值经 `stripHtml` 归一,保存纯文本。主任务富文本描述不受影响,预览侧本就 `stripHtml` 兼容两种。
- **轻量 textarea 而非 Tiptap**:与拆解面板"执行说明"同款形成"AI 生成→采纳→查看→继续编辑"闭环;子任务说明天然短文本,逐行挂富文本编辑器过重。
- **`editing` 受控提升到父级**:列表行需要联动禁用拖拽、编辑时收起行尾 chips、与标题 inline 编辑互斥;详情行仅管理自身展开。
- **保存语义取最简**:失焦时值有变化才 `updateTask({ id, description })`(单字段、用户级操作,重复提交最坏幂等,无需防抖/事务);Esc 还原退出;textarea 内 Enter 为换行(同 BreakdownPanel)。
- **无描述入口不占空间**:点击预览仅服务已有描述;新增入口为 TaskCard 子任务右键菜单"编辑描述"项 + 两处行尾 hover 图标(仿 SubtaskReminderButton 低调图标模式,有描述着色提示)。
- **行布局改纵向容器**:勾选钮与行尾图标垂直居中,标题与描述在中列堆叠;`truncate` 保持单行预览不撑高行高。

## Risks / Trade-offs

- [编辑保存纯文本会丢掉历史 HTML 描述的格式] → 子任务描述当前唯一来源是 AI 拆解的纯文本,风险趋零;即便混入,编辑初值 `stripHtml` 保证可见文本不丢。
- [行高因预览增加,列表信息密度下降] → 仅有描述的子任务多一行 12px 预览;无描述不占空间。

## Migration Plan

无数据库变更、无新依赖;回滚即还原五个前端文件。

## Open Questions

无。
