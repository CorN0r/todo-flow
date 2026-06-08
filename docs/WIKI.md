# TodoFlow — 为 Windows 打造的现代桌面待办事项管理工具

> 原生轻量 · 六种主题 · 多种视图 · 习惯追踪 · 隐私优先

[![Version](https://img.shields.io/badge/version-0.3.0-blue)](https://gitcode.com/CorN0r/todo-flow)
[![License](https://img.shields.io/badge/license-MIT-green)](https://gitcode.com/CorN0r/todo-flow/blob/main/LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11%2064--bit-lightgrey)](https://gitcode.com/CorN0r/todo-flow)

---

## 为什么选择 TodoFlow？

在日常工作和生活中，我们每天都会面对大量任务——工作项目、个人待办、学习计划、习惯养成。市面上虽然有很多 TODO 工具，但大多数要么是臃肿的 Electron 应用，要么需要注册账号将你的数据存储在云端。

**TodoFlow 给了你第三个选择**：一个基于 Tauri v2 构建的原生 Windows 桌面应用，轻量快速（安装包不到 10MB），所有数据完全存储在本地，同时不妥协于功能和颜值。

![主界面概览](https://gitcode.com/CorN0r/todo-flow/raw/master/docs/images/01-main-overview.png)

---

## 快速上手

### 安装

1. 从 [Release 页面](https://gitcode.com/CorN0r/todo-flow/releases) 下载安装包
   - `TodoFlow_0.3.0_x64-setup.exe`（NSIS 格式）
   - `TodoFlow_0.3.0_x64_zh-CN.msi`（MSI 格式）
2. 双击安装，桌面和开始菜单会自动创建快捷方式
3. 系统要求：**Windows 10 / 11 64 位**

### 30 秒创建你的第一个任务

1. 点击右上角「新建任务」按钮，或按 `N` 键
2. 输入任务标题
3. 可选：设置优先级（红旗）、截止日期、提醒时间
4. 按 Enter 确认

![快捷创建](https://gitcode.com/CorN0r/todo-flow/raw/master/docs/images/14-quick-add.png)

> 💡 按下 `Ctrl+Shift+T` 可以在任何界面唤起 TodoFlow 并直接开始新建任务。

### 常用快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Shift+T` | 全局热键：唤起主窗口 + 快速新建 |
| `Ctrl+K` | 聚焦搜索栏 |
| `Ctrl+B` | 折叠 / 展开侧边栏 |
| `N` | 快速新建任务 |
| `1` | 全部任务 |
| `2` | 日历 |
| `3` | 设置 |
| `Esc` | 关闭详情面板 / 弹窗 |
| `?` | 命令面板 |

---

## 核心功能

### 📋 任务管理

完整支持创建、编辑、删除任务。每个任务可以设置：

- **优先级**：高 / 中 / 低 / 无（红旗标记）
- **截止日期**：支持日期 + 具体时间（上午9点 / 下午2点 / 傍晚5点30 等预设，也可自定义）
- **多个提醒**：准时 / 提前 5分钟 / 30分钟 / 1小时 / 1天 / 1周 / 自定义时间
- **标签归类**：将任务关联到标签
- **拖拽排序**：手动排序模式下自由调整任务顺序

![任务详情面板](https://gitcode.com/CorN0r/todo-flow/raw/master/docs/images/02-task-detail.png)

### 📑 子任务系统

支持两级嵌套子任务，让复杂任务变得井井有条：

- 任务下可创建多个子任务
- 子任务支持独立勾选完成
- 拖拽排序子任务顺序
- 详情面板内嵌卡片样式，视觉清晰

### 👁 三大任务视图

一键切换三种视图模式，适应不同工作场景：

| 视图 | 适用场景 |
|------|---------|
| **列表视图** | 传统清晰的线性展示，适合批量处理和精确管理 |
| **便签墙视图** | 自由排列的卡片式布局，视觉化思维，适合头脑风暴 |
| **一体式视图** | 左右分栏，可调节分隔线，键盘 `↑↓` 切换选中，适合高频操作 |

![便签墙视图](https://gitcode.com/CorN0r/todo-flow/raw/master/docs/images/03-sticky-wall.png)

![一体式视图](https://gitcode.com/CorN0r/todo-flow/raw/master/docs/images/04-unified-view.png)

### 📅 日历视图

月 / 周 / 日三种粒度，直观看到每天的任务分布：

- 日期格上显示任务数量标记
- 点击日期查看当天任务列表
- 与任务截止日期无缝联动

![日历月视图](https://gitcode.com/CorN0r/todo-flow/raw/master/docs/images/05-calendar-month.png)

### 🏷 标签系统

灵活的多级标签，帮你将任务分门别类：

- **多级嵌套**：支持父子标签层级（如「工作 → 项目A」）
- **颜色标记**：每个标签可自定义颜色
- **右键操作**：重命名 / 删除
- **侧边栏显示**：标签列表显示未完成任务计数

### ☀️ 我的一天

聚焦今日最重要的任务：

- 智能推荐：系统根据截止日期、优先级自动推荐今日任务
- 手动管理：支持「加入我的一天」和「移除」
- 暂不推荐 / 重新推荐

![我的一天](https://gitcode.com/CorN0r/todo-flow/raw/master/docs/images/08-myday.png)

### 🎯 四象限矩阵

基于 Eisenhower Matrix 优先级矩阵，帮你区分：

- **重要且紧急** → 立即处理
- **重要不紧急** → 计划安排
- **紧急不重要** → 委派他人
- **不重要不紧急** → 删除或推迟

![四象限矩阵](https://gitcode.com/CorN0r/todo-flow/raw/master/docs/images/06-matrix.png)

### 📊 看板视图

按标签 / 优先级 / 完成状态分列展示任务，一目了然：

![看板视图](https://gitcode.com/CorN0r/todo-flow/raw/master/docs/images/07-kanban.png)

### ✅ 习惯追踪

不只是待办，更是习惯养成工具：

- 每日打卡，可视化进度
- 按日 / 周频率设置
- 支持目标计数（如「每天8杯水」）
- 日历热力图展示坚持情况

![习惯追踪](https://gitcode.com/CorN0r/todo-flow/raw/master/docs/images/09-habits.png)

### 📈 数据看板

任务统计概览，快速了解自己的效率：

- 完成率、逾期率、本周任务数等关键指标
- 数字卡片点击可直接跳转到对应列表
- 一眼掌握整体状态

![数据看板](https://gitcode.com/CorN0r/todo-flow/raw/master/docs/images/10-dashboard.png)

### 🔍 全局搜索 & 命令面板

- **搜索**：`Ctrl+K` 打开，实时搜索所有任务标题和描述
- **高级搜索页**：按标签、日期、优先级等条件综合筛选
- **命令面板**：按 `?` 键打开，键盘导航，快速跳转到任意页面或切换主题

![搜索](https://gitcode.com/CorN0r/todo-flow/raw/master/docs/images/13-search.png)

![命令面板](https://gitcode.com/CorN0r/todo-flow/raw/master/docs/images/11-command-palette.png)

### 🫧 悬浮窗

独立小窗口，始终保持在其他窗口之上：

- **气泡态**：收缩为一个小圆点，不干扰工作
- **展开态**：点击展开查看任务列表
- 支持拖拽移动位置

---

## 特色亮点

### 🎨 六种精美主题

点击标题栏最左侧按钮一键切换，总有适合你的风格：

| 主题 | 效果 |
|------|------|
| **浅色** | 经典明亮白底，适合白天使用 |
| **深色** | 护眼深色，适合夜间和低光环境 |
| **温暖石炭** | 暖炭底色 #161514 + 哑金琥珀强调色，沉稳有温度 |
| **浮光** | 去纯白、弥散阴影、高级亮色视觉 |
| **玻璃** | 毛玻璃半透明效果，现代感十足 |
| **跟随系统** | 自动匹配 Windows 明/暗主题 |

![深色主题](https://gitcode.com/CorN0r/todo-flow/raw/master/docs/images/12-dark-theme.png)

### 🔒 隐私优先

- **全部数据存储在本地**：SQLite 数据库位于 `%APPDATA%/com.todoflow.desktop/`
- **无需注册**：不用创建账号，不用连接网络
- **你的数据你做主**：支持数据库备份和 CSV 导出
- **MIT 开源**：代码完全透明，放心使用

### 🖥 系统托盘常驻

- 关闭主窗口自动隐藏到托盘，程序不退出
- 左键托盘图标：打开主界面
- 右键托盘图标：快速访问、设置、退出
- `Ctrl+Shift+T` 全局热键随时唤起

### 🍅 番茄钟

内建 Pomodoro 计时器，专注工作 25 分钟 + 休息 5 分钟的经典循环。

---

## 技术栈

TodoFlow 采用现代化的技术选型，确保最佳性能和开发体验：

| 层级 | 技术 | 说明 |
|------|------|------|
| 桌面框架 | **Tauri v2** | Rust 原生壳，非 Electron，体积小、内存省 |
| 前端 | **React 19** + TypeScript | 类型安全，组件化开发 |
| 样式 | **Tailwind CSS v4** | 原子化 CSS，零运行时 |
| 服务端状态 | **TanStack Query v5** | 数据获取、缓存、同步 |
| 客户端状态 | **Zustand v5** | 轻量状态管理 |
| 数据库 | **SQLite** (rusqlite) | 本地持久化，WAL 模式高性能 |
| 路由 | **react-router-dom v7** | MemoryRouter 模式 |
| 拖拽 | **@dnd-kit** | 高性能拖拽排序 |
| 动画 | **motion** (framer-motion) | 流畅过渡动画 |
| 图标 | **lucide-react** | 一致的图标系统 |

---

## 下载与安装

| 安装包 | 格式 | 说明 |
|--------|------|------|
| `TodoFlow_0.3.0_x64-setup.exe` | NSIS | 标准 Windows 安装器 |
| `TodoFlow_0.3.0_x64_zh-CN.msi` | MSI | 企业环境友好，支持组策略部署 |

> 📥 **最新版本：v0.3.0**（2026-06-08）
>
> 下载地址：[https://gitcode.com/CorN0r/todo-flow/releases](https://gitcode.com/CorN0r/todo-flow/releases)

---

## 版本历史

| 版本 | 日期 | 主要更新 |
|------|------|----------|
| **v0.3.0** | 2026-06-08 | 一体式视图、便签墙展开详情、多提醒、截止日期时间、Warm/Lumina 主题、子任务卡片化、数据看板跳转 |
| v0.2.0 | 2026-06-01 | 托盘菜单、排序修复、悬浮窗重构、UI 优化 |
| v0.1.0 | 2026-05-24 | 初始版本 |

---

## 参与贡献

TodoFlow 是一个开源项目，欢迎你的参与！

- 🐛 [提交 Issue](https://gitcode.com/CorN0r/todo-flow/issues) — 报告 Bug 或提出功能建议
- 🔀 [提交 Pull Request](https://gitcode.com/CorN0r/todo-flow/pulls) — 贡献代码
- ⭐ Star 项目 — 你的支持是最大的动力

### 本地开发

```bash
# 克隆仓库
git clone https://gitcode.com/CorN0r/todo-flow.git
cd todo-flow

# 安装依赖
npm install

# 启动开发模式
npm run tauri dev

# 构建发布版本
npm run tauri build

# 运行测试
npm test
```

---

## 路线图

以下功能正在规划中：

- [ ] i18n 多语言支持（基础设施已就绪）
- [ ] 任务附件增强
- [ ] 数据云同步（可选，端到端加密）
- [ ] 更多视图模式
- [ ] API / Webhook 集成

---

<p align="center">
  <strong>TodoFlow</strong> — 让你的每一天都有条不紊 ✨
</p>
