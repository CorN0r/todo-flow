use serde::Serialize;

/// 服务预设:仅预填地址与协议选项,不硬编码模型清单。
/// 预设状态为"文档适配"——未做真实调用验收前不得标记为已验证。
#[derive(Debug, Clone, Serialize)]
pub struct ProviderPreset {
    pub id: &'static str,
    pub name: &'static str,
    pub protocol: &'static str,
    pub base_url: &'static str,
    pub note: &'static str,
}

pub const PRESETS: &[ProviderPreset] = &[
    ProviderPreset {
        id: "zhipu",
        name: "智谱 GLM(Coding 套餐)",
        protocol: "openai_chat",
        base_url: "https://open.bigmodel.cn/api/coding/paas/v4",
        note: "OpenAI 兼容 Chat Completions;Coding 套餐专用地址,Key 在 BigModel 套餐页创建",
    },
    ProviderPreset {
        id: "openai",
        name: "OpenAI",
        protocol: "openai_chat",
        base_url: "https://api.openai.com/v1",
        note: "官方文档地址,兼容 Chat Completions",
    },
    ProviderPreset {
        id: "deepseek",
        name: "DeepSeek",
        protocol: "openai_chat",
        base_url: "https://api.deepseek.com/v1",
        note: "官方提供 OpenAI 兼容格式",
    },
    ProviderPreset {
        id: "gemini",
        name: "Gemini",
        protocol: "openai_chat",
        base_url: "https://generativelanguage.googleapis.com/v1beta/openai",
        note: "官方 OpenAI 兼容入口;部分能力有专用参数",
    },
    ProviderPreset {
        id: "custom",
        name: "自定义兼容服务",
        protocol: "openai_chat",
        base_url: "",
        note: "填写任意 OpenAI 兼容服务的基础地址",
    },
];

pub fn preset_by_id(id: &str) -> Option<&'static ProviderPreset> {
    PRESETS.iter().find(|p| p.id == id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn presets_cover_first_batch_and_custom() {
        let ids: Vec<_> = PRESETS.iter().map(|p| p.id).collect();
        assert_eq!(ids, vec!["zhipu", "openai", "deepseek", "gemini", "custom"]);
        // 自定义预设不预填地址,其余必须预填 https 地址
        for p in PRESETS {
            if p.id == "custom" {
                assert_eq!(p.base_url, "");
            } else {
                assert!(p.base_url.starts_with("https://"), "{} base_url", p.id);
            }
        }
    }

    #[test]
    fn lookup_by_id() {
        assert_eq!(preset_by_id("deepseek").unwrap().name, "DeepSeek");
        assert_eq!(preset_by_id("zhipu").unwrap().base_url, "https://open.bigmodel.cn/api/coding/paas/v4");
        assert!(preset_by_id("nope").is_none());
    }
}
