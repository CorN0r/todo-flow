## Purpose

规定 MCP 服务与命令行工具如何确定读写哪个工作区，使 Agent 的写入与用户在应用中看到的内容保持一致，并允许把 Agent 限定在指定的工作区内。

## ADDED Requirements

### Requirement: 默认跟随当前激活的工作区

未指定目标时，MCP 服务与命令行 MUST 作用于当前激活的工作区。MCP 服务 MUST 在每次工具调用时重新确定目标：应用中的激活工作区变化后，后续调用 MUST 作用于新的激活工作区，并 MUST 释放对原工作区数据库文件的占用。

#### Scenario: 跟随应用中的切换
- **WHEN** MCP 服务已在运行，用户在应用中从“默认工作区”切换到“工作”，随后 Agent 调用 create_task
- **THEN** 新任务出现在“工作”，不出现在“默认工作区”

#### Scenario: 读取也跟随切换
- **WHEN** 上一场景之后 Agent 调用 list_tasks
- **THEN** 返回“工作”的任务，不返回“默认工作区”的任务

#### Scenario: 切换后原工作区可以被删除
- **WHEN** MCP 服务仍在运行，用户删除刚才离开的工作区
- **THEN** 删除成功，不提示文件被占用

#### Scenario: 命令行一次性调用
- **WHEN** 用户运行不带 `--profile` 的 `todoflow-mcp list`
- **THEN** 返回当前激活工作区的任务

### Requirement: 按名称指定工作区

MCP 服务与命令行 MUST 支持 `--profile <名称>` 指定目标工作区；名称匹配 MUST 去除首尾空白且不区分大小写。指定后所有读写 MUST 作用于该工作区，不随应用中的切换改变。名称不存在时系统 MUST 报错并列出可用名称，MUST NOT 创建新工作区。

#### Scenario: 固定目标
- **WHEN** 以 `--profile 工作` 启动 MCP 服务，用户随后在应用中切换到“个人”
- **THEN** create_task 仍写入“工作”

#### Scenario: 名称大小写不同
- **WHEN** 工作区名称登记为“Work”，Agent 指定 `--profile work`
- **THEN** 调用作用于“Work”

#### Scenario: 名称不存在
- **WHEN** Agent 指定一个不存在的工作区名称
- **THEN** 调用报错并列出全部可用名称，清单与数据不变

### Requirement: 向未激活工作区写入

向未激活的工作区写入 MUST NOT 影响当前激活工作区的数据，也 MUST NOT 引起应用界面刷新。写入的内容 MUST 在该工作区被激活后完整可见。

#### Scenario: 写入后台工作区
- **WHEN** Agent 向未激活的“试验”创建任务
- **THEN** 应用界面不变；切换到“试验”后该任务存在

### Requirement: 与显式路径参数的关系

`--db-path` MUST 保留现有语义：作用于指定文件，该文件 MUST NOT 被登记为工作区。同时给出 `--db-path` 与 `--profile` 时系统 MUST 报错，不得猜测目标。两者都未给出且不存在工作区清单时，系统 MUST 回退到现有的默认数据库路径，已有配置 MUST 无需修改即可继续使用。

#### Scenario: 同时给出两个参数
- **WHEN** 启动时同时给出 `--db-path` 与 `--profile`
- **THEN** 报错退出，不读写任何文件

#### Scenario: 没有工作区清单
- **WHEN** 数据目录中只有现有默认数据库，没有工作区清单
- **THEN** 不带参数的调用作用于该默认数据库

#### Scenario: 使用显式路径
- **WHEN** Agent 使用 `--db-path` 指定一个文件
- **THEN** 行为与此前一致，该文件不出现在应用的工作区列表中
