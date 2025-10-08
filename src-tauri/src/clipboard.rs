use anyhow::Result;

/// Captures currently selected text using the selection crate
/// This uses UI Automation API on Windows with clipboard as fallback
pub async fn capture_selected_text() -> Result<String> {
    // Run in blocking task since selection::get_text() is synchronous
    let text = tokio::task::spawn_blocking(|| selection::get_text()).await?;

    Ok(text)
}
