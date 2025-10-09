import { invoke, Channel } from "@tauri-apps/api/core";

export interface StreamCallbacks {
  onChunk: (content: string) => void;
  onError: (error: string) => void;
  onDone: () => void;
}

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export async function streamAiResponse(
  baseUrl: string,
  apiKey: string,
  modelName: string,
  messages: Message[],
  callbacks: StreamCallbacks,
): Promise<void> {
  const { onChunk, onError, onDone } = callbacks;

  try {
    // Create a channel to receive streaming chunks from Rust
    const channel = new Channel<string>();
    channel.onmessage = (chunk: string) => {
      if (chunk) {
        onChunk(chunk);
      }
    };

    // Invoke the Rust command with the channel
    await invoke("stream_ai_response", {
      baseUrl,
      apiKey,
      modelName,
      messages,
      channel,
    });

    // Stream completed successfully
    onDone();
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    onError(errorMessage);
  }
}
