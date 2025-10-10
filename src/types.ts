export interface AppConfig {
  models: ModelConfig[];
  templates: QuestionTemplate[];
  hotkeys: HotkeyConfig;
  selected_model_index: number;
  popup_width: number;
  max_popup_height: number;
}

export interface ModelConfig {
  name: string;
  base_url: string;
  api_key: string;
  model_name: string;
  supports_vision?: boolean;
}

export interface QuestionTemplate {
  id: string;
  name: string;
  prompt: string;
  action: "none" | "copy" | "replace";
  hotkey?: string | null;
  background_mode?: boolean;
}

export interface HotkeyConfig {
  popup_hotkey: string;
  screenshot_hotkey?: string;
}
