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

export async function setPopupPinned(pinned: boolean): Promise<void> {
  await invoke("set_popup_pinned", { pinned });
}

export async function isPopupPinned(): Promise<boolean> {
  return await invoke<boolean>("is_popup_pinned");
}

export async function replaceTextInSource(text: string): Promise<void> {
  await invoke("replace_text_in_source", { text });
}

// Screenshot API functions
export async function takeScreenshot(): Promise<string> {
  return await invoke<string>("take_screenshot");
}

export async function getScreenshots(): Promise<string[]> {
  return await invoke<string[]>("get_screenshots");
}

export async function clearScreenshots(): Promise<void> {
  await invoke("clear_screenshots");
}

export async function removeScreenshot(index: number): Promise<void> {
  await invoke("remove_screenshot", { index });
}

export async function captureScreenshotRegion(
  x: number,
  y: number,
  width: number,
  height: number,
): Promise<string> {
  return await invoke<string>("capture_screenshot_region", {
    x,
    y,
    width,
    height,
  });
}

export async function showScreenshotSelector(): Promise<void> {
  await invoke("show_screenshot_selector");
}

export async function exportConfig(): Promise<string> {
  return await invoke<string>("export_config");
}

export async function importConfig(configJson: string): Promise<void> {
  await invoke("import_config", { configJson });
}
