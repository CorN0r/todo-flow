## 1. 共享组件

- [x] 1.1 新建 `src/components/tasks/SubtaskDescription.tsx`:展示态单行截断预览(stripHtml,空描述不渲染)/编辑态 textarea(初值纯文本、聚焦光标置尾、高度自适应、失焦值变化才保存、Esc 取消);`editing` 受控由父级联动

## 2. 两处子任务 UI

- [x] 2.1 TaskCard:SortableSubtaskRow 纵向容器(标题+描述)、行尾 hover AlignLeft 图标(有描述紫/无描述灰)、标题与描述编辑互斥且编辑中禁用拖拽;SubtaskContent 右键菜单新增"编辑描述"项
- [x] 2.2 TaskDetail:提取 DetailSubtaskRow(同款预览/编辑、行尾 hover 图标入口、删除按钮补 aria-label="删除子任务")

## 3. 修复与验收

- [x] 3.1 修复 7 处删除撤销重建丢描述(TaskCard×2、TaskDetail×2、StickyNote、ExpandedNote、UnifiedLayout 补 `description`)
- [x] 3.2 验收测试 `src/test/components/SubtaskDescription.test.tsx`:组件层 8 用例(预览/stripHtml/空不渲染/进入编辑/失焦保存/无变化不保存/Esc 取消/清空存空串)+ TaskCard 4(预览与图标/编辑保存/右键入口/撤销带描述)+ TaskDetail 4(预览/编辑保存/无描述图标添加/撤销带描述)
- [x] 3.3 全量回归:前端 57 文件 404 测试通过、eslint 改动文件零问题、build 通过;勾选任务并归档(spec 同步落库)

## 完成记录(2026-10-29)

- 零后端/零迁移/零类型改动:复用 Task.description 既有全链路(AI 拆解已在写入)
- 前端新增 SubtaskDescription 共享组件;TaskCard 子任务行纵向化+右键菜单+hover 图标;TaskDetail 提取 DetailSubtaskRow
- 7 处撤销重建补 description;TaskDetail 子任务删除按钮补 aria-label
- 验收:16 个新用例全过;全量前端 404 过零失败;eslint 新旧改动文件 0 error;npm run build 通过
