# 贡献指南

感谢你对 TodoFlow 的关注！欢迎提交 Issue 和 Pull Request。

## 开发环境

- Node.js 18+
- Rust 1.80+
- Windows 10 / 11

## 本地运行

```bash
npm install          # 安装前端依赖
npm run tauri dev    # 启动 Tauri 开发模式
npm test             # 运行测试
```

## 提交规范

- 提交信息使用中文
- 一个提交只做一件事
- 功能变更需要同步更新测试

## 代码风格

- 遵循项目已有的代码风格
- UI 文案使用简体中文
- 组件命名使用 PascalCase
- 文件名使用 PascalCase（组件）或 camelCase（hooks/utils）

## Pull Request 流程

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/xxx`)
3. 提交你的修改 (`git commit -m '添加某个功能'`)
4. 推送到远程分支 (`git push origin feature/xxx`)
5. 创建 Pull Request
