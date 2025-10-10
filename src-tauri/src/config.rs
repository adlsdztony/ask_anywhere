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
    #[serde(default)]
    pub supports_vision: bool,
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
    #[serde(default)]
    pub background_mode: bool,
}

fn default_template_action() -> String {
    "none".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HotkeyConfig {
    pub popup_hotkey: String,
    #[serde(default = "default_screenshot_hotkey")]
    pub screenshot_hotkey: String,
}

fn default_screenshot_hotkey() -> String {
    "Alt+Shift+S".to_string()
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            models: vec![ModelConfig {
                name: "Default OpenAI".to_string(),
                base_url: "https://api.openai.com/v1".to_string(),
                api_key: String::new(),
                model_name: "gpt-4.1".to_string(),
                supports_vision: false,
            }],
            templates: vec![
                QuestionTemplate {
                    id: "background_translate".to_string(),
                    name: "Background Translation".to_string(),
                    prompt: "If the selected text is mostly Chinese, translate it into English; if it is mostly English or other languages, translate it into Chinese. Please only provide the translated text.".to_string(),
                    action: "replace".to_string(),
                    hotkey: Some("Alt+Shift+Q".to_string()),
                    background_mode: true,
                },
                QuestionTemplate {
                    id: "translate".to_string(),
                    name: "Translate".to_string(),
                    prompt: "If the selected text is mostly Chinese, translate it into English; if it is mostly English or other languages, translate it into Chinese. Please only provide the translated text.".to_string(),
                    action: "none".to_string(),
                    hotkey: Some("Alt+Q".to_string()),
                    background_mode: false,
                },
                QuestionTemplate {
                    id: "summarize".to_string(),
                    name: "Summarize".to_string(),
                    prompt: "Summarize the following text:".to_string(),
                    action: "copy".to_string(),
                    hotkey: None,
                    background_mode: false,
                },
            ],
            hotkeys: HotkeyConfig {
                popup_hotkey: "Alt+S".to_string(),
                screenshot_hotkey: "Alt+Shift+S".to_string(),
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
            supports_vision: false,
        }
    }
}
