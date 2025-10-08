import OpenAI from 'openai';

export interface StreamCallbacks {
  onChunk: (content: string) => void;
  onError: (error: string) => void;
  onDone: () => void;
}

export async function streamAiResponse(
  baseUrl: string,
  apiKey: string,
  modelName: string,
  prompt: string,
  callbacks: StreamCallbacks
): Promise<void> {
  const { onChunk, onError, onDone } = callbacks;

  try {
    // Create OpenAI client with custom base URL
    const client = new OpenAI({
      apiKey,
      baseURL: baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl,
      dangerouslyAllowBrowser: true, // Required for browser usage
    });

    // Create streaming chat completion
    const stream = await client.chat.completions.create({
      model: modelName,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      stream: true,
    });

    // Process the stream
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        onChunk(content);
      }
    }

    // Stream completed successfully
    onDone();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    onError(errorMessage);
  }
}
