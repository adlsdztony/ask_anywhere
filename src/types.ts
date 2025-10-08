export interface AppConfig {
  models: ModelConfig[];
  templates: QuestionTemplate[];
  hotkeys: HotkeyConfig;
  selected_model_index: number;
}

export interface ModelConfig {
  name: string;
  base_url: string;
  api_key: string;
  model_name: string;
}

export interface QuestionTemplate {
  id: string;
  name: string;
  prompt: string;
}

export interface HotkeyConfig {
  popup_hotkey: string;
}
