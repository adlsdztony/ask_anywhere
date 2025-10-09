export interface AppConfig {
  models: ModelConfig[];
  templates: QuestionTemplate[];
  hotkeys: HotkeyConfig;
  selected_model_index: number;
  popup_width: number;
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
  action: "none" | "copy" | "replace";
  hotkey?: string | null;
  background_mode?: boolean;
}

export interface HotkeyConfig {
  popup_hotkey: string;
}
