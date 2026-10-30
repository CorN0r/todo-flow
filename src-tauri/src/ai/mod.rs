/// AI 模型接入模块:配置、凭证、协议适配、请求运行、验证、拆解与采纳。
/// 契约见 openspec/changes/add-ai-model-access 与 docs/AI_MODEL_ACCESS_DESIGN.md。
pub mod adapter;
pub mod apply;
pub mod breakdown;
pub mod my_day;
pub mod my_day_apply;
pub mod presets;
pub mod probe;
pub mod config_repo;
pub mod credentials;
pub mod diagnostics;
pub mod error;
pub mod gateway;
pub mod polish;
