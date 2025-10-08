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
            (stream, Vec::new(), false),
            |(mut stream, mut buffer, mut done)| async move {
                use futures::StreamExt;

                loop {
                    match stream.next().await {
                        Some(Ok(chunk)) => {
                            buffer.extend_from_slice(&chunk);

                            // Process complete lines
                            let mut lines_to_process = Vec::new();
                            let mut last_newline = 0;

                            for (i, &byte) in buffer.iter().enumerate() {
                                if byte == b'\n' {
                                    let line = &buffer[last_newline..i];
                                    lines_to_process.push(line.to_vec());
                                    last_newline = i + 1;
                                }
                            }

                            // Remove processed data
                            if last_newline > 0 {
                                buffer.drain(..last_newline);
                            }

                            // Process all complete lines
                            for line in lines_to_process {
                                match parse_sse_line(&line) {
                                    ParseResult::Content(content) => {
                                        return Some((Ok(content), (stream, buffer, done)));
                                    }
                                    ParseResult::Done => {
                                        done = true;
                                    }
                                    ParseResult::Skip => {
                                        // Continue processing next line
                                        continue;
                                    }
                                }
                            }

                            // If we've seen [DONE] and no more data, end stream
                            if done {
                                return None;
                            }
                        }
                        Some(Err(e)) => {
                            return Some((
                                Err(anyhow::anyhow!("Stream error: {}", e)),
                                (stream, buffer, done),
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

enum ParseResult {
    Content(String),
    Done,
    Skip,
}

fn parse_sse_line(line: &[u8]) -> ParseResult {
    let line_str = match std::str::from_utf8(line) {
        Ok(s) => s,
        Err(_) => return ParseResult::Skip,
    };

    if line_str.starts_with("data: ") {
        let json_str = match line_str.strip_prefix("data: ") {
            Some(s) => s.trim(),
            None => return ParseResult::Skip,
        };

        // Check for [DONE] marker
        if json_str == "[DONE]" {
            return ParseResult::Done;
        }

        // Parse JSON
        if let Ok(response) = serde_json::from_str::<StreamResponse>(json_str) {
            if let Some(choice) = response.choices.first() {
                if let Some(content) = &choice.delta.content {
                    if !content.is_empty() {
                        return ParseResult::Content(content.clone());
                    }
                }
            }
        }
    }

    ParseResult::Skip
}
