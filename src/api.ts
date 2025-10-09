import { invoke } from "@tauri-apps/api/core";
import type { AppConfig } from "./types";

export async function loadConfig(): Promise<AppConfig> {
  return await invoke<AppConfig>("load_config");
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await invoke("save_config", { config });
}

export async function showPopupWindow(): Promise<void> {
  await invoke("show_popup_window");
}

export async function hidePopupWindow(): Promise<void> {
  await invoke("hide_popup_window");
}

export async function getCapturedText(): Promise<string> {
  return await invoke<string>("get_captured_text");
}

export async function resizePopupWindow(
  width: number,
  height: number,
): Promise<void> {
  await invoke("resize_popup_window", { width, height });
}
