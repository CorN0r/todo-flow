## MODIFIED Requirements

### Requirement: Desktop task collection pages share one filter experience
系统 SHALL 在我的一天、全部任务、计划的各日期范围和标签页面提供同一套桌面状态筛选行为，并让筛选结果适用于列表、便签墙、一体式、看板和四象限视图。

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

### Requirement: Filtering composes with task operations
系统 MUST 让状态筛选与排序、视图切换、详情选择和批量选择使用同一个可见任务集合。

#### Scenario: All desktop views show the same result
- **WHEN** 用户在某个状态筛选下切换列表、便签墙、一体式或看板视图
- **THEN** 四种视图显示相同的匹配根任务集合；四象限视图显示其中未完成且未放弃的任务

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
