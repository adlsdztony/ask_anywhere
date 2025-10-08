import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AppConfig } from "./types";

export async function loadConfig(): Promise<AppConfig> {
  return await invoke<AppConfig>("load_config");
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await invoke("save_config", { config });
}

export async function streamAiResponse(
  baseUrl: string,
  apiKey: string,
  modelName: string,
  prompt: string,
  onChunk: (content: string) => void,
  onError: (error: string) => void,
  onDone: () => void,
): Promise<void> {
  // Listen for events
  const chunkUnlisten = await listen<string>("ai-stream-chunk", (event) => {
    onChunk(event.payload);
  });

  const errorUnlisten = await listen<string>("ai-stream-error", (event) => {
    onError(event.payload);
  });

  const doneUnlisten = await listen("ai-stream-done", () => {
    onDone();
    // Clean up listeners
    chunkUnlisten();
    errorUnlisten();
    doneUnlisten();
  });

  // Start streaming
  try {
    await invoke("stream_ai_response", {
      baseUrl,
      apiKey,
      modelName,
      prompt,
    });
  } catch (error) {
    // Clean up listeners on error
    chunkUnlisten();
    errorUnlisten();
    doneUnlisten();
    throw error;
  }
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
