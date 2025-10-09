use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub models: Vec<ModelConfig>,
    pub templates: Vec<QuestionTemplate>,
    pub hotkeys: HotkeyConfig,
    pub selected_model_index: usize,
    #[serde(default)]
    pub autostart: bool,
    #[serde(default = "default_popup_width")]
    pub popup_width: f64,
}

fn default_popup_width() -> f64 {
    500.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelConfig {
    pub name: String,
    pub base_url: String,
    pub api_key: String,
    pub model_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestionTemplate {
    pub id: String,
    pub name: String,
    pub prompt: String,
    #[serde(default = "default_template_action")]
    pub action: String,
    #[serde(default)]
    pub hotkey: Option<String>,
}

fn default_template_action() -> String {
    "none".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HotkeyConfig {
    pub popup_hotkey: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            models: vec![ModelConfig {
                name: "Default OpenAI".to_string(),
                base_url: "https://api.openai.com/v1".to_string(),
                api_key: String::new(),
                model_name: "gpt-4.1".to_string(),
            }],
            templates: vec![
                QuestionTemplate {
                    id: "translate".to_string(),
                    name: "Translate to English".to_string(),
                    prompt: "Translate the following text to English:".to_string(),
                    action: "replace".to_string(),
                    hotkey: None,
                },
                QuestionTemplate {
                    id: "explain".to_string(),
                    name: "Explain".to_string(),
                    prompt: "Explain the following:".to_string(),
                    action: "none".to_string(),
                    hotkey: None,
                },
                QuestionTemplate {
                    id: "summarize".to_string(),
                    name: "Summarize".to_string(),
                    prompt: "Summarize the following text:".to_string(),
                    action: "copy".to_string(),
                    hotkey: None,
                },
            ],
            hotkeys: HotkeyConfig {
                popup_hotkey: "Alt+S".to_string(),
            },
            selected_model_index: 0,
            autostart: false,
            popup_width: 500.0,
        }
    }
}

impl Default for ModelConfig {
    fn default() -> Self {
        Self {
            name: "New Model".to_string(),
            base_url: "https://api.openai.com/v1".to_string(),
            api_key: String::new(),
            model_name: "gpt-4.1".to_string(),
        }
    }
}
