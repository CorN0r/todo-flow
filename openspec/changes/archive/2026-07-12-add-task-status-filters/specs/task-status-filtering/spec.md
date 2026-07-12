## ADDED Requirements

### Requirement: Canonical task status views
系统 MUST 为未归档根任务提供 `all`、`active`、`completed`、`suspended`、`abandoned` 和 `overdue` 六种单选筛选视图，并使用共享判定逻辑。

#### Scenario: Active view hides non-actionable tasks
- **WHEN** 用户选择“进行中”筛选
- **THEN** 系统仅显示未完成、未挂起且未放弃的根任务

#### Scenario: Suspended view isolates suspended tasks
- **WHEN** 用户选择“挂起”筛选
- **THEN** 系统仅显示挂起、未完成且未放弃的根任务

#### Scenario: Completed and abandoned are distinct
- **WHEN** 当前基础集合同时包含已完成任务和已放弃任务
- **THEN** “已完成”与“已放弃”视图分别显示各自的任务，且任务不会同时计入两个主状态

#### Scenario: Conflicting historical flags use deterministic precedence
- **WHEN** 一个历史任务同时具有多个状态标记
- **THEN** 系统按已放弃、已完成、挂起、进行中的优先级把它归入唯一主状态

#### Scenario: Overdue is derived from active tasks
- **WHEN** 用户选择“超期”且任务的截止时间早于本地当天
- **THEN** 系统仅在该任务属于进行中状态时显示它

### Requirement: Status counts use the current base scope
系统 MUST 基于当前页面、日期、搜索和标签约束后的未归档根任务计算状态计数，并在应用状态筛选前完成计数。

#### Scenario: Counts remain stable while switching status
- **WHEN** 用户在同一基础任务范围内切换不同状态
- **THEN** 每个状态显示的计数保持基于完整基础范围，不缩减为当前结果数量

#### Scenario: Search and tag narrow mobile counts
- **WHEN** 移动端用户输入搜索词或选择标签
- **THEN** 系统重新计算该搜索和标签范围内的全部状态计数与可见结果

#### Scenario: Subtasks remain parent context
- **WHEN** 根任务匹配当前状态且包含子任务
- **THEN** 系统保留其子任务层级作为上下文，但不把子任务单独计入根任务状态计数

### Requirement: Desktop task collection pages share one filter experience
系统 SHALL 在今天、全部任务及日期范围、我的一天和标签页面提供同一套桌面状态筛选行为，并让筛选结果适用于列表、便签墙和一体式视图。

#### Scenario: Filter persists across desktop collection pages
- **WHEN** 用户在一个桌面任务集合页选择状态后导航到另一个受支持的任务集合页
- **THEN** 系统在当前应用会话中保留该状态选择，并按新页面的基础范围重新计算结果

#### Scenario: Desktop app starts unfiltered
- **WHEN** 用户重新加载或重新启动桌面应用
- **THEN** 状态筛选默认为“全部”

#### Scenario: Compact layout does not collide with title actions
- **WHEN** 桌面标题栏没有足够宽度展示完整状态入口
- **THEN** 系统把状态选项收敛到带当前状态提示的过滤菜单，且标题、计数和操作按钮不重叠

#### Scenario: Secondary status remains visible when selected
- **WHEN** 用户从菜单选择挂起、已放弃或超期
- **THEN** 过滤入口显示所选状态及计数，并呈现明确的激活状态

### Requirement: Mobile task page supports all status views
系统 SHALL 在移动任务页延续现有触控筛选模式，并允许用户选择全部六种状态视图。

#### Scenario: Mobile task page defaults to active
- **WHEN** 用户进入或重新进入移动任务页
- **THEN** 系统默认选择“进行中”，隐藏已完成、挂起和已放弃任务

#### Scenario: Mobile user selects suspended tasks
- **WHEN** 移动端用户点击“挂起”状态选项
- **THEN** 任务列表立即只显示匹配的挂起根任务，并保留当前搜索、标签和排序条件

#### Scenario: Mobile controls remain touch safe
- **WHEN** 六种状态选项在窄屏设备上显示
- **THEN** 控件可横向滚动或稳定换行，并保持项目现有的最小触控目标和无文本遮挡布局

### Requirement: Filtering composes with task operations
系统 MUST 让状态筛选与排序、视图切换、详情选择和批量选择使用同一个可见任务集合。

#### Scenario: All desktop views show the same result
- **WHEN** 用户在某个状态筛选下切换列表、便签墙或一体式视图
- **THEN** 三种视图显示相同的匹配根任务集合

#### Scenario: Hidden selection is removed
- **WHEN** 筛选变化使已选择任务变为不可见
- **THEN** 系统从批量选择中移除不可见任务，且“全选”只作用于当前可见任务

#### Scenario: Hidden detail is closed
- **WHEN** 一体式视图中打开的任务不再匹配新筛选
- **THEN** 系统关闭该任务详情并清除其选中状态

#### Scenario: Filtered manual reorder preserves hidden order
- **WHEN** 用户在状态筛选结果中手动拖拽任务
- **THEN** 系统把可见任务的新顺序稳定合并回完整基础顺序，并保持隐藏任务的相对顺序

#### Scenario: Status change updates the current result
- **WHEN** 用户修改某个可见任务的完成、挂起或放弃状态，使其不再匹配当前筛选
- **THEN** 该任务在更新成功后从当前结果移除，计数同步更新且任务数据不会被筛选操作额外修改

### Requirement: Filtered empty states are recoverable
系统 MUST 区分基础集合为空和筛选结果为空，并让用户能从无匹配结果恢复到全部视图。

#### Scenario: Non-empty source has no suspended tasks
- **WHEN** 基础集合包含任务但“挂起”筛选结果为零
- **THEN** 系统显示“没有挂起任务”类状态化反馈和“显示全部”操作，而不是页面原有的数据为空提示

#### Scenario: User clears the status filter
- **WHEN** 用户在筛选无结果状态中选择“显示全部”
- **THEN** 系统切换到“全部”并显示基础集合中的任务

### Requirement: Filter controls are localized and accessible
系统 SHALL 为状态名称、计数、筛选无结果和清除操作提供简体中文与英文文案，并为交互控件暴露可访问状态。

#### Scenario: Assistive technology identifies current filter
- **WHEN** 用户通过键盘或辅助技术访问状态筛选控件
- **THEN** 每个选项可聚焦、具有明确名称，并暴露当前选中状态

#### Scenario: Language change updates filter copy
- **WHEN** 用户切换应用语言
- **THEN** 状态标签、计数和筛选空状态使用所选语言显示
