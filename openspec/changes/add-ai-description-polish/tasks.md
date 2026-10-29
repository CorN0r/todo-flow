## 1. 后端

- [x] 1.1 实现 ai/polish.rs:PolishContext(标题/描述文本/子任务摘要)、系统+用户提示组装、validate_polish_text(1..=4000 字符、非空白);上下文含图片剥离断言、提示含任务字段断言、超长/空文本拒绝测试
- [x] 1.2 实现 ai_polish_description 命令(准入:任务存在/未完成;单飞;默认模型与凭证;流式按验证状态;finish=stop 校验;purpose=polish 摘要含成功/取消/失败路径)并注册;命令层测试(准入拒绝、无默认模型、凭证缺失错误码)

## 2. 前端

- [x] 2.1 domain 契约:models/ai.ts 补 PolishProposal 类型、AiModelRepository.polishDescription;db.ts 包装;memory 替身(返回固定润色文本)
- [x] 2.2 PolishPanel:描述区"AI 润色"入口(未完成任务显示);flushSave 前置;流式进度/取消(request_id 过滤);可编辑预览;采纳=wrapPlainText 后 updateTask 仅改描述并关闭;失败/取消保留原描述;面板交互测试(生成、编辑采纳只改描述、取消、重复发起提示)

## 3. 收尾

- [x] 3.1 全量回归:npm run test / test:rust / lint(新文件零问题)/ build;真实调用冒烟(智谱默认模型润色一条真实任务)
- [x] 3.2 勾选任务、按需归档变更(spec 同步落库)

## 完成记录(2026-10-29)

- Rust ai::polish(4 测试)+ ai_polish_description 命令;与拆解共用单飞集合
- 前端 PolishPanel(4 测试)、TaskDetail 描述区入口、wrapPlainText 采纳、flushSave 复用
- 全量回归:前端 376 通过、Rust 147+9+2 通过、新文件 lint 零问题、build 通过
- 真实冒烟(tests/ai_acceptance.rs::real_polish_smoke,--ignored):智谱 glm-5.3-flash
  流式 10.5s 为空描述任务生成 81 字规范描述,finish=Stop,摘要入库,虚构任务已清理
