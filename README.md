# TodoFlow v0.7.0

面向 Windows 与 Android 的本地优先待办事项管理应用，基于 Tauri v2 + React 19 构建。

![主界面概览](https://cdn.jsdelivr.net/gh/CorN0r/todo-flow@master/docs/images/01-main-overview.png)

---

## 系统要求

- Windows 10 / 11 64 位
- Android 7.0（API 24）及以上

## 安装

运行安装包：

- `TodoFlow_0.7.0_x64-setup.exe`（NSIS）
- `TodoFlow_0.7.0_arm64-preview.apk`（Android ARM64 预览版，测试签名）

安装后通过桌面快捷方式或开始菜单启动。

---

## 核心功能

| 模块 | 说明 |
|------|------|
| 任务管理 | 创建 / 编辑 / 删除任务，设置优先级、截止日期（含具体时间）、提醒（支持多个）、标签 |
| **状态过滤** | 按全部、进行中、已完成、挂起、已放弃和超期筛选任务，支持桌面与移动端 |
| **Android** | 移动端任务、日历、习惯、专注与设置体验，支持离线使用 |
| **跨端同步** | 本地优先同步架构，支持任务、标签与提醒在桌面和 Android 之间同步 |
| **富文本描述** | WYSIWYG 编辑器，支持 Markdown 快捷输入、图片粘贴/拖放、表格、链接、全屏编辑 |
| 子任务 | 支持两级嵌套，拖拽排序，详情面板内嵌卡片样式 |
| 三种视图 | 列表视图、便签墙视图、一体式左右分栏视图，一键切换 |
| 日历视图 | 月 / 周 / 日三种视图 |
| 标签系统 | 多级标签嵌套 + 任务多标签，颜色标记，右键重命名 / 删除 |
| 我的一天 | 聚焦今日重点任务，智能推荐（支持暂不 / 重新推荐） |
| 四象限 | Eisenhower Matrix 优先级矩阵 |
| 看板 | 按标签/优先级/完成状态分列的看板视图 |
| 习惯追踪 | 每日打卡，可视化进度 |
| 数据看板 | 任务统计概览 + 专注统计分页（今日/本周/连续打卡） |
| 全局搜索 | 搜索所有任务 + 高级搜索页 |
| 命令面板 | `Ctrl+K` 打开，键盘导航 |
| 悬浮窗 | 独立窗口，拖拽，展开/折叠到气泡，气泡颜色可自定义 |
| 多主题 | 浅色 / 深色 / 跟随系统 / 玻璃 / 温暖石炭 / 浮光，六种主题随意切换 |
| **番茄钟** | 独立桌面悬浮窗，专注/短休/长休循环，全屏沉浸模式，Windows 原生通知，统计面板 |
| **Agent 集成** | 内置 MCP server + CLI，让 Claude Desktop / Claude Code / Cursor 等 AI 直接创建、查询、管理任务 |
| **桌面便签** | 把任务固定为桌面无边框透明小窗，三款皮肤，Alt+D 一键显示/隐藏 |

## 界面预览

![一体式视图](https://cdn.jsdelivr.net/gh/CorN0r/todo-flow@master/docs/images/05-unified-view.png)

![日历视图](https://cdn.jsdelivr.net/gh/CorN0r/todo-flow@master/docs/images/06-calendar-month.png)

![看板视图](https://cdn.jsdelivr.net/gh/CorN0r/todo-flow@master/docs/images/08-kanban.png)

![桌面便签](https://cdn.jsdelivr.net/gh/CorN0r/todo-flow@master/docs/images/23-note.png)

![Agent 集成](https://cdn.jsdelivr.net/gh/CorN0r/todo-flow@master/docs/images/21-mcp.png)

---

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Shift+T` | 全局热键：显示/隐藏主窗口 |
| `Ctrl+K` | 命令面板 |
| `Ctrl+B` | 折叠 / 展开侧边栏 |
| `N` | 快速新建任务 |
| `Ctrl+Shift+P` | 启动番茄钟 |
| `Esc` | 关闭详情面板 / 退出选择 / 退出全屏 |

---

## 番茄钟

- **启动**：任务右键菜单 → "开始番茄钟" / TaskDetail 按钮 / `Ctrl+Shift+P`
- **桌面悬浮窗**：独立 always-on-top 窗口，hover 显示控制按钮，拖拽移动
- **全屏沉浸**：点击 ⛶ 进入真全屏，400px 大圆环 + 光晕，Esc 退出
- **循环逻辑**：专注(25m) → 短休(5m) × 3 → 长休(15m) → 循环（可在设置中自定义）
- **通知**：Windows 原生系统通知 + 提示音，主界面隐藏也能收到
- **统计**：数据看板 → 专注分页，今日统计 / 本周柱状图 / 按任务排行 / 连续打卡

---

## 系统托盘

| 操作 | 行为 |
|------|------|
| 左键点击托盘图标 | 打开主界面 |
| 右键托盘图标 | 弹出菜单：打开主界面 / 设置 / 退出 |
| 关闭主窗口 | 隐藏到托盘，程序不退出 |

---

## 主题

支持六种主题，点击标题栏最左侧按钮循环切换：

- **浅色** — 明亮白底
- **深色** — 深色护眼
- **温暖石炭** — 暖炭底色 #161514 + 哑金琥珀 #C9A84C 强调
- **浮光** — 去纯白、弥散阴影、高级亮色视觉
- **玻璃** — 毛玻璃半透明效果
- **跟随系统** — 自动匹配 Windows 主题

---

## 排序方式

| 选项 | 说明 |
|------|------|
| 手动排序 | 默认模式，可拖拽任务调整顺序 |
| 截止日期 (近→远) | 最近到期的排最前，无日期排末尾 |
| 截止日期 (远→近) | 最远到期的排最前，无日期排末尾 |
| 优先级 (高→低) | 红旗优先 |
| 字母 (A→Z) | 按标题字母升序 |
| 字母 (Z→A) | 按标题字母降序 |
| 创建时间 (新→旧) | 最新创建排最前 |
| 创建时间 (旧→新) | 最早创建排最前 |

---

## 任务操作

- **快速添加**：页面右上角点击「新建任务」
- **勾选完成**：点击任务左侧圆形复选框
- **右键任务**：标记完成 / 未完成、加入我的一天、添加子任务、复制、删除、**开始番茄钟**
- **拖拽排序**：手动排序模式下拖拽任务调整顺序
- **多选模式**：点击「多选」按钮进入批量操作模式
- **设置提醒**：每个任务支持多个提醒，准时/提前5分钟/30分钟/1小时/1天/1周/自定义
- **截止日期时间**：支持设置具体时间，预设上午9点/下午2点/傍晚5点30

---

## 数据管理

- **存储位置**：`%APPDATA%/com.todoflow.desktop/todo.db`（SQLite 本地数据库）
- **备份**：设置页 → 备份数据库，保存为 `.db` 文件
- **导出**：设置页 → 导出任务为 CSV，可用 Excel 打开

---

## Agent 集成（MCP / 本地接口）

TodoFlow 内置 MCP（Model Context Protocol）服务器，让 Claude Desktop、Claude Code、Cursor 等 AI Agent 直接创建、查询、更新你的任务。数据库本地直连，无需网络。

### 构建二进制

```bash
cd src-tauri
cargo build --release --bin todoflow-mcp
# 产物: src-tauri/target/release/todoflow-mcp.exe
```

> tauri 安装包不包含此二进制，需用上述命令单独构建。

### 配置 Agent

**Claude Desktop**：编辑 `%APPDATA%\Claude\claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "todoflow": {
      "command": "C:\\Users\\<你的用户名>\\...\\todoflow-mcp.exe",
      "args": ["serve"]
    }
  }
}
```

**Claude Code**：

```bash
claude mcp add todoflow -- "C:\...\todoflow-mcp.exe" serve
```

**Cursor**：项目根目录 `.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "todoflow": {
      "command": "C:\\...\\todoflow-mcp.exe",
      "args": ["serve"]
    }
  }
}
```

### 提供的工具

`create_task`、`list_tasks`、`get_task`、`update_task`、`complete_task`、`reopen_task`、`delete_task`、`list_tags`、`create_tag`。

- 通过标签**名称**引用即可（不存在的标签自动创建）
- `due_date` 格式：`YYYY-MM-DD` 或 `YYYY-MM-DD HH:mm`
- `priority`：0=无 1=低 2=中 3=高 4=紧急
- 支持子任务（`parent_task_id`）、「我的今天」（`my_day`）、提前提醒（`remind_minutes_before`，需配合 `due_date`）

### 命令行用法（同一二进制）

```bash
todoflow-mcp add "写周报" --priority 3 --due "2026-08-14" --tag work --my-day
todoflow-mcp list --search 周报
todoflow-mcp list --tag work --completed
todoflow-mcp done <任务ID>
todoflow-mcp tags
todoflow-mcp --db-path D:\backup\todo.db list
```

### 数据位置与安全

- 默认数据库：`%APPDATA%\com.todoflow.desktop\todo.db`（可用 `--db-path` 覆盖）
- GUI 运行期间，Agent 写入的任务约 2 秒内自动出现在界面中
- 本地直连 SQLite，无网络请求、无鉴权；Agent 拥有与你相同的读写权限，注意提示词安全

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Tauri v2 |
| 前端 | React 19 + TypeScript |
| 样式 | Tailwind CSS v4 |
| 状态管理 | TanStack Query v5 + Zustand v5 |
| 数据库 | SQLite（rusqlite，WAL 模式） |
| 路由 | react-router-dom v7（MemoryRouter） |
| 拖拽 | @dnd-kit |
| 动画 | motion (framer-motion) |
| 图标 | lucide-react |
| 通知 | tauri-plugin-notification |

---

## 开发

```bash
npm install          # 安装依赖
npm run tauri dev    # 启动开发模式
npm run tauri build  # 构建发布版本
npm test             # 运行测试
```

---

## 版本历史

| 版本 | 日期 | 更新内容 |
|------|------|----------|
| v0.7.0 | 2026-08-14 | 任务多标签、Agent 集成（MCP/CLI）、桌面便签、子任务时间设置、开机自启与快捷键开关、多项修复 |
| v0.6.0 | 2026-07-12 | Android 移动端预览、本地优先跨端同步、六状态任务过滤、同步安全与数据库兼容性改进 |
| v0.5.0 | 2026-06-19 | 富文本描述编辑器（TipTap/ProseMirror）、图片粘贴拖放、表格、全屏编辑、面板宽度可拖拽、时区修复（localtime）、番茄钟边缘吸附 |
| v0.4.0 | 2026-06-15 | 番茄钟完整重构（独立悬浮窗+全屏沉浸+统计）、悬浮窗跟随全局主题、气泡颜色自定义 |
| v0.3.0 | 2026-06-08 | 一体式视图、便签墙展开详情、多提醒、截止日期时间、Warm/Lumina 主题、数据看板 |
| v0.2.0 | 2026-06-01 | 托盘菜单、排序修复、悬浮窗重构、UI 优化 |
| v0.1.0 | 2026-05-24 | 初始版本 |
