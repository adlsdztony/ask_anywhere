use anyhow::{Context, Result};
use futures::stream::Stream;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::pin::Pin;

#[derive(Debug, Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<Message>,
    stream: bool,
}

#[derive(Debug, Serialize)]
struct Message {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct StreamResponse {
    choices: Vec<Choice>,
}

#[derive(Debug, Deserialize)]
struct Choice {
    delta: Delta,
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Delta {
    content: Option<String>,
}

pub struct AiClient {
    client: Client,
}

impl AiClient {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(60))
                .build()
                .expect("Failed to create HTTP client"),
        }
    }

    pub async fn stream_chat(
        &self,
        base_url: &str,
        api_key: &str,
        model_name: &str,
        user_message: &str,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<String>> + Send>>> {
        let request = ChatRequest {
            model: model_name.to_string(),
            messages: vec![Message {
                role: "user".to_string(),
                content: user_message.to_string(),
            }],
            stream: true,
        };

        let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await
            .context("Failed to send request")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("API request failed with status {}: {}", status, error_text);
        }

        let stream = response.bytes_stream();
        let mapped_stream = futures::stream::unfold(
            (stream, Vec::new()),
            |(mut stream, mut buffer)| async move {
                use futures::StreamExt;

                loop {
                    match stream.next().await {
                        Some(Ok(chunk)) => {
                            buffer.extend_from_slice(&chunk);

                            // Process complete lines
                            let mut last_newline = 0;
                            for (i, &byte) in buffer.iter().enumerate() {
                                if byte == b'\n' {
                                    let line = &buffer[last_newline..i];
                                    last_newline = i + 1;

                                    if let Some(content) = parse_sse_line(line) {
                                        buffer.drain(..last_newline);
                                        return Some((Ok(content), (stream, buffer)));
                                    }
                                }
                            }

                            // Remove processed data
                            if last_newline > 0 {
                                buffer.drain(..last_newline);
                            }
                        }
                        Some(Err(e)) => {
                            return Some((
                                Err(anyhow::anyhow!("Stream error: {}", e)),
                                (stream, buffer),
                            ));
                        }
                        None => return None,
                    }
                }
            },
        );

        Ok(Box::pin(mapped_stream))
    }
}

fn parse_sse_line(line: &[u8]) -> Option<String> {
    let line_str = std::str::from_utf8(line).ok()?;

    if line_str.starts_with("data: ") {
        let json_str = line_str.strip_prefix("data: ")?.trim();

        // Check for [DONE] marker
        if json_str == "[DONE]" {
            return None;
        }

        // Parse JSON
        if let Ok(response) = serde_json::from_str::<StreamResponse>(json_str) {
            if let Some(choice) = response.choices.first() {
                if let Some(content) = &choice.delta.content {
                    return Some(content.clone());
                }
            }
        }
    }

    None
}
