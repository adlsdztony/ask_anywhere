use base64::{engine::general_purpose::STANDARD, Engine};
use image::ImageFormat;
use std::io::Cursor;
use xcap::Monitor;

/// Captures a screenshot of the primary monitor and returns it as a base64-encoded data URL
pub async fn capture_screenshot() -> Result<String, String> {
    // Spawn blocking task for screenshot capture
    let screenshot_data = tokio::task::spawn_blocking(|| -> Result<Vec<u8>, String> {
        // Get all monitors
        let monitors = Monitor::all().map_err(|e| format!("Failed to get monitors: {}", e))?;

        // Use the primary monitor (or first available)
        let monitor = monitors
            .into_iter()
            .next()
            .ok_or_else(|| "No monitors found".to_string())?;

        // Capture the screenshot
        let image = monitor
            .capture_image()
            .map_err(|e| format!("Failed to capture screenshot: {}", e))?;

        // Convert to PNG format in memory
        let mut buffer = Cursor::new(Vec::new());
        image
            .write_to(&mut buffer, ImageFormat::Png)
            .map_err(|e| format!("Failed to encode image: {}", e))?;

        Ok(buffer.into_inner())
    })
    .await
    .map_err(|e| format!("Screenshot task failed: {}", e))??;

    // Encode to base64
    let base64_data = STANDARD.encode(&screenshot_data);

    // Return as data URL
    Ok(format!("data:image/png;base64,{}", base64_data))
}

/// Captures a screenshot of a specific window (future enhancement)
#[allow(dead_code)]
pub async fn capture_window_screenshot(_window_id: u32) -> Result<String, String> {
    // TODO: Implement window-specific screenshot
    // This would use xcap::Window::all() and filter by window ID
    Err("Window screenshot not yet implemented".to_string())
}
