mod clipboard;
mod config;

use auto_launch::AutoLaunch;
use config::AppConfig;
use enigo::Direction::{Click, Press, Release};
use enigo::{Enigo, Key, Keyboard, Settings};
use futures::StreamExt;
use std::sync::Arc;
use tauri::ipc::Channel;
use tauri::menu::{CheckMenuItem, Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};
use tauri_plugin_store::StoreExt;
use tokio::sync::Mutex;

// Captured text state
struct CapturedText(Arc<Mutex<String>>);

// Popup pinned state
struct PopupPinned(Arc<Mutex<bool>>);

// Tauri commands

#[tauri::command]
async fn load_config(app: AppHandle) -> Result<AppConfig, String> {
    let store = app.store("config.json").map_err(|e| e.to_string())?;

    match store.get("app_config") {
        Some(value) => serde_json::from_value(value.clone()).map_err(|e| e.to_string()),
        None => {
            // Return default config
            let default_config = AppConfig::default();

            // Save default config
            store.set(
                "app_config".to_string(),
                serde_json::to_value(&default_config).unwrap(),
            );
            store.save().map_err(|e| e.to_string())?;

            Ok(default_config)
        }
    }
}

#[tauri::command]
async fn save_config(app: AppHandle, config: AppConfig) -> Result<(), String> {
    let store = app.store("config.json").map_err(|e| e.to_string())?;

    store.set(
        "app_config".to_string(),
        serde_json::to_value(&config).map_err(|e| e.to_string())?,
    );

    store.save().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn get_captured_text(state: State<'_, CapturedText>) -> Result<String, String> {
    let text = state.0.lock().await;
    Ok(text.clone())
}

// Helper function to create AutoLaunch instance
fn create_auto_launch() -> Result<AutoLaunch, String> {
    let app_name = "AskAnywhere";
    let app_path = std::env::current_exe().map_err(|e| e.to_string())?;

    Ok(AutoLaunch::new(
        app_name,
        &app_path.to_string_lossy(),
        &[] as &[&str],
    ))
}

#[tauri::command]
async fn toggle_autostart(app: AppHandle, enabled: bool) -> Result<(), String> {
    let auto_launch = create_auto_launch()?;

    if enabled {
        auto_launch
            .enable()
            .map_err(|e| format!("Failed to enable autostart: {:?}", e))?;
    } else {
        auto_launch
            .disable()
            .map_err(|e| format!("Failed to disable autostart: {:?}", e))?;
    }

    // Update config
    let mut config = load_config(app.clone()).await?;
    config.autostart = enabled;
    save_config(app, config).await?;

    Ok(())
}

// Streaming AI response command
#[tauri::command]
async fn stream_ai_response(
    base_url: String,
    api_key: String,
    model_name: String,
    messages: Vec<serde_json::Value>,
    channel: Channel<String>,
) -> Result<(), String> {
    use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
    use serde_json::json;

    // Build the full URL
    let url = if base_url.ends_with('/') {
        format!("{}chat/completions", base_url)
    } else {
        format!("{}/chat/completions", base_url)
    };

    // Build headers
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&format!("Bearer {}", api_key)).map_err(|e| e.to_string())?,
    );

    // Build request body
    let body = json!({
        "model": model_name,
        "messages": messages,
        "stream": true
    });

    // Create client
    let client = reqwest::Client::new();

    // Send request
    let response = client
        .post(&url)
        .headers(headers)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    // Check status
    if !response.status().is_success() {
        let status = response.status();
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("API error ({}): {}", status, error_text));
    }

    // Stream the response
    let mut stream = response.bytes_stream();

    let mut buffer = String::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Stream error: {}", e))?;
        let chunk_str = String::from_utf8_lossy(&chunk);

        buffer.push_str(&chunk_str);

        // Process SSE format (data: {...}\n\n)
        while let Some(data_start) = buffer.find("data: ") {
            let data_content_start = data_start + 6;

            if let Some(line_end_pos) = buffer[data_content_start..].find('\n') {
                let json_str = buffer[data_content_start..data_content_start + line_end_pos]
                    .trim()
                    .to_string();
                let remaining = buffer[data_content_start + line_end_pos + 1..].to_string();
                buffer = remaining;

                // Check for [DONE] marker
                if json_str == "[DONE]" {
                    channel.send("".to_string()).map_err(|e| e.to_string())?;
                    break;
                }

                // Parse and extract content
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&json_str) {
                    if let Some(content) = parsed["choices"][0]["delta"]["content"].as_str() {
                        channel
                            .send(content.to_string())
                            .map_err(|e| e.to_string())?;
                    }
                }
            } else {
                // Not enough data yet, keep in buffer
                break;
            }
        }
    }

    Ok(())
}

fn get_cursor_position() -> Result<(i32, i32), String> {
    use mouse_position::mouse_position::Mouse;

    match Mouse::get_mouse_position() {
        Mouse::Position { x, y } => Ok((x, y)),
        Mouse::Error => Err("Failed to get mouse position".to_string()),
    }
}

#[tauri::command]
async fn show_popup_window(app: AppHandle) -> Result<(), String> {
    // Get cursor position in physical pixels
    let (cursor_x, cursor_y) = get_cursor_position()?;

    // Load config to get popup width
    let config = load_config(app.clone()).await?;
    let popup_width = config.popup_width;

    // Popup window size (compact initial size)
    const POPUP_HEIGHT: f64 = 200.0; // Smaller initial height
    const OFFSET: i32 = 20;

    if let Some(window) = app.get_webview_window("popup") {
        // Get the current monitor to determine scale factor and bounds
        let monitor = window
            .current_monitor()
            .map_err(|e| e.to_string())?
            .ok_or("Failed to get current monitor")?;

        let scale_factor = monitor.scale_factor();
        let monitor_size = monitor.size();
        let monitor_position = monitor.position();

        // Calculate popup position with boundary detection
        let mut popup_x = cursor_x + OFFSET;
        let mut popup_y = cursor_y + OFFSET;

        // Check if popup would exceed right boundary
        if popup_x + (popup_width * scale_factor) as i32
            > monitor_position.x + monitor_size.width as i32
        {
            // Move to left of cursor
            popup_x = cursor_x - OFFSET - (popup_width * scale_factor) as i32;
        }

        // Check if popup would exceed bottom boundary
        if popup_y + (POPUP_HEIGHT * scale_factor) as i32
            > monitor_position.y + monitor_size.height as i32
        {
            // Move above cursor
            popup_y = cursor_y - OFFSET - (POPUP_HEIGHT * scale_factor) as i32;
        }

        // Ensure popup doesn't go off-screen to the left or top
        if popup_x < monitor_position.x {
            popup_x = monitor_position.x;
        }
        if popup_y < monitor_position.y {
            popup_y = monitor_position.y;
        }

        // Convert physical pixels to logical pixels
        let logical_x = (popup_x as f64) / scale_factor;
        let logical_y = (popup_y as f64) / scale_factor;

        // Position the existing window near the cursor using logical position
        window
            .set_position(tauri::Position::Logical(tauri::LogicalPosition {
                x: logical_x,
                y: logical_y,
            }))
            .map_err(|e| e.to_string())?;

        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    } else {
        // Create popup window first to get monitor info
        let popup = tauri::WebviewWindowBuilder::new(
            &app,
            "popup",
            tauri::WebviewUrl::App("popup.html".into()),
        )
        .title("Ask Anywhere")
        .inner_size(popup_width, POPUP_HEIGHT)
        .resizable(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .transparent(true)
        .shadow(false) // Remove window shadow
        .theme(None) // Follow system theme
        .visible(false) // Create hidden first
        .build()
        .map_err(|e| e.to_string())?;

        // Get the monitor containing the cursor
        let monitor = popup
            .current_monitor()
            .map_err(|e| e.to_string())?
            .ok_or("Failed to get current monitor")?;

        let scale_factor = monitor.scale_factor();
        let monitor_size = monitor.size();
        let monitor_position = monitor.position();

        // Calculate popup position with boundary detection
        let mut popup_x = cursor_x + OFFSET;
        let mut popup_y = cursor_y + OFFSET;

        // Check if popup would exceed right boundary
        if popup_x + (popup_width * scale_factor) as i32
            > monitor_position.x + monitor_size.width as i32
        {
            // Move to left of cursor
            popup_x = cursor_x - OFFSET - (popup_width * scale_factor) as i32;
        }

        // Check if popup would exceed bottom boundary
        if popup_y + (POPUP_HEIGHT * scale_factor) as i32
            > monitor_position.y + monitor_size.height as i32
        {
            // Move above cursor
            popup_y = cursor_y - OFFSET - (POPUP_HEIGHT * scale_factor) as i32;
        }

        // Ensure popup doesn't go off-screen to the left or top
        if popup_x < monitor_position.x {
            popup_x = monitor_position.x;
        }
        if popup_y < monitor_position.y {
            popup_y = monitor_position.y;
        }

        // Convert physical pixels to logical pixels
        let logical_x = (popup_x as f64) / scale_factor;
        let logical_y = (popup_y as f64) / scale_factor;

        // Set position using logical coordinates
        popup
            .set_position(tauri::Position::Logical(tauri::LogicalPosition {
                x: logical_x,
                y: logical_y,
            }))
            .map_err(|e| e.to_string())?;

        popup.show().map_err(|e| e.to_string())?;
        popup.set_focus().map_err(|e| e.to_string())?;

        // Delay setting up the focus loss handler to avoid immediate close
        let popup_clone = popup.clone();
        let app_clone = app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;

            let app_for_event = app_clone.clone();
            let popup_for_clone = popup_clone.clone();
            popup_clone.on_window_event(move |event| {
                if let WindowEvent::Focused(focused) = event {
                    if !focused {
                        // Check if popup is pinned before closing
                        let pinned_state: tauri::State<PopupPinned> = app_for_event.state();
                        let popup_to_close = popup_for_clone.clone();
                        let pinned_arc = pinned_state.0.clone();

                        tauri::async_runtime::spawn(async move {
                            let is_pinned = pinned_arc.lock().await;
                            if !*is_pinned {
                                let _ = popup_to_close.close();
                            }
                        });
                    }
                }
            });
        });
    }

    Ok(())
}

#[tauri::command]
async fn hide_popup_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("popup") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn set_popup_pinned(state: State<'_, PopupPinned>, pinned: bool) -> Result<(), String> {
    let mut is_pinned = state.0.lock().await;
    *is_pinned = pinned;
    Ok(())
}

#[tauri::command]
async fn is_popup_pinned(state: State<'_, PopupPinned>) -> Result<bool, String> {
    let is_pinned = state.0.lock().await;
    Ok(*is_pinned)
}

#[tauri::command]
fn replace_text_in_source(app: AppHandle, text: String) {
    // Spawn a background task that doesn't block or return
    tauri::async_runtime::spawn(async move {
        use tauri_plugin_clipboard_manager::ClipboardExt;

        // Save current clipboard content first (before hiding window)
        let original_clipboard = app.clipboard().read_text().ok();

        // Write the new text to clipboard
        if let Err(e) = app.clipboard().write_text(text) {
            eprintln!("Failed to write to clipboard: {}", e);
            return;
        }

        // Small delay to ensure clipboard is updated
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        // Hide the popup window to return focus to the original application
        if let Some(popup) = app.get_webview_window("popup") {
            let _ = popup.hide();
        }

        // Wait for window to hide and focus to return
        tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;

        // Simulate Ctrl+V to paste
        let paste_result = tokio::task::spawn_blocking(|| -> Result<(), String> {
            let mut enigo = Enigo::new(&Settings::default())
                .map_err(|e| format!("Failed to initialize enigo: {:?}", e))?;

            // Simulate Ctrl+V
            enigo
                .key(Key::Control, Press)
                .map_err(|e| format!("Failed to press Ctrl: {:?}", e))?;
            enigo
                .key(Key::Unicode('v'), Click)
                .map_err(|e| format!("Failed to press V: {:?}", e))?;
            enigo
                .key(Key::Control, Release)
                .map_err(|e| format!("Failed to release Ctrl: {:?}", e))?;

            Ok(())
        })
        .await;

        if let Err(e) = paste_result {
            eprintln!("Keyboard simulation failed: {:?}", e);
            return;
        }

        // Wait a bit before restoring clipboard
        tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;

        // Restore original clipboard
        if let Some(original) = original_clipboard {
            let _ = app.clipboard().write_text(original);
        }
    });
}

#[tauri::command]
async fn resize_popup_window(app: AppHandle, width: f64, height: f64) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("popup") {
        // Get current position and monitor info
        let current_pos = window.outer_position().map_err(|e| e.to_string())?;

        let monitor = window
            .current_monitor()
            .map_err(|e| e.to_string())?
            .ok_or("Failed to get current monitor")?;

        let scale_factor = monitor.scale_factor();
        let monitor_size = monitor.size();
        let monitor_position = monitor.position();

        // Set new size
        window
            .set_size(tauri::Size::Logical(tauri::LogicalSize { width, height }))
            .map_err(|e| e.to_string())?;

        // Adjust position to prevent content from going off-screen
        // Convert current position to logical coordinates
        let current_x = (current_pos.x as f64) / scale_factor;
        let current_y = (current_pos.y as f64) / scale_factor;

        let mut new_x = current_x;
        let mut new_y = current_y;

        // Check if window would exceed bottom boundary with new height
        let new_bottom = current_y + height;
        let monitor_bottom =
            ((monitor_position.y + monitor_size.height as i32) as f64) / scale_factor;

        if new_bottom > monitor_bottom {
            // Move window up to keep bottom edge visible
            new_y = monitor_bottom - height;
        }

        // Check if window would exceed right boundary
        let new_right = current_x + width;
        let monitor_right =
            ((monitor_position.x + monitor_size.width as i32) as f64) / scale_factor;

        if new_right > monitor_right {
            new_x = monitor_right - width;
        }

        // Ensure window doesn't go off-screen to the left or top
        let monitor_left = (monitor_position.x as f64) / scale_factor;
        let monitor_top = (monitor_position.y as f64) / scale_factor;

        if new_x < monitor_left {
            new_x = monitor_left;
        }
        if new_y < monitor_top {
            new_y = monitor_top;
        }

        // Update position if it changed
        if new_x != current_x || new_y != current_y {
            window
                .set_position(tauri::Position::Logical(tauri::LogicalPosition {
                    x: new_x,
                    y: new_y,
                }))
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Initialize captured text state
            app.manage(CapturedText(Arc::new(Mutex::new(String::new()))));
            // Initialize popup pinned state
            app.manage(PopupPinned(Arc::new(Mutex::new(false))));

            // Load config to get autostart state
            let store = app.store("config.json")?;
            let config: AppConfig = match store.get("app_config") {
                Some(value) => serde_json::from_value(value.clone())?,
                None => AppConfig::default(),
            };

            // Setup system tray with autostart checkbox
            let autostart_item = CheckMenuItem::with_id(app, "autostart", "Autostart", true, config.autostart, None::<&str>)?;
            let restart = MenuItem::with_id(app, "restart", "Restart", true, None::<&str>)?;
            let exit = MenuItem::with_id(app, "exit", "Exit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&autostart_item, &restart, &exit])?;

            let _tray = TrayIconBuilder::with_id("tray")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "autostart" => {
                        // Toggle autostart in a new task
                        let app_clone = app.clone();
                        tauri::async_runtime::spawn(async move {
                            // Load current config to get current state
                            if let Ok(config) = load_config(app_clone.clone()).await {
                                let new_state = !config.autostart;
                                if let Err(e) = toggle_autostart(app_clone, new_state).await {
                                    eprintln!("Failed to toggle autostart: {}", e);
                                }
                            }
                        });
                    }
                    "restart" => {
                        app.restart();
                    }
                    "exit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Handle window close event - minimize to tray instead of closing
            if let Some(window) = app.get_webview_window("main") {
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window_clone.hide();
                    }
                });
            }

            // Register global shortcut
            let app_handle = app.handle().clone();

            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

                // Load config to get hotkey
                let store = app.store("config.json")?;
                let config: AppConfig = match store.get("app_config") {
                    Some(value) => serde_json::from_value(value.clone())?,
                    None => AppConfig::default(),
                };

                // Parse and register hotkey
                let shortcut_str = config.hotkeys.popup_hotkey.as_str();
                let shortcut: Shortcut = shortcut_str
                    .parse()
                    .map_err(|e| format!("Failed to parse shortcut: {:?}", e))?;

                // Check if already registered and unregister first
                if app.global_shortcut().is_registered(shortcut.clone()) {
                    eprintln!("Shortcut already registered, attempting to unregister...");
                    let _ = app.global_shortcut().unregister(shortcut.clone());
                }

                // Register the popup shortcut handler
                match app.global_shortcut().on_shortcut(
                    shortcut.clone(),
                    move |_app, _shortcut, event| {
                        if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                            let app = app_handle.clone();
                            tauri::async_runtime::spawn(async move {
                                // Check if popup is already visible
                                if let Some(popup) = app.get_webview_window("popup") {
                                    if let Ok(is_visible) = popup.is_visible() {
                                        if is_visible {
                                            // Popup is already open, emit event to trigger replace
                                            let _ = popup.emit("trigger-replace", ());
                                            return;
                                        }
                                    }
                                }

                                // Popup not visible, proceed with normal flow
                                // Capture the selected text using UI Automation API
                                match clipboard::capture_selected_text().await {
                                    Ok(text) => {
                                        // Store the captured text in state
                                        let captured_state: tauri::State<CapturedText> = app.state();
                                        *captured_state.0.lock().await = text;
                                    }
                                    Err(e) => {
                                        eprintln!("Warning: Failed to capture selection: {}", e);
                                    }
                                }

                                // Show the popup window
                                let _ = show_popup_window(app).await;
                            });
                        }
                    },
                ) {
                    Ok(_) => {
                        // Successfully registered handler, now register the shortcut
                        if let Err(e) = app.global_shortcut().register(shortcut) {
                            eprintln!("Warning: Failed to register global shortcut: {}. The shortcut may not work.", e);
                            // Don't fail the app startup, just log the error
                        }
                    }
                    Err(e) => {
                        eprintln!("Warning: Failed to setup shortcut handler: {}. The shortcut may not work.", e);
                        // Don't fail the app startup, just log the error
                    }
                }

                // Register template hotkeys
                for template in config.templates.iter() {
                    if let Some(hotkey_str) = &template.hotkey {
                        if !hotkey_str.is_empty() {
                            let template_id = template.id.clone();
                            let template_prompt = template.prompt.clone();
                            let template_action = template.action.clone();
                            let app_clone = app.handle().clone();

                            if let Ok(template_shortcut) = hotkey_str.parse::<Shortcut>() {
                                // Check if already registered and unregister first
                                if app.global_shortcut().is_registered(template_shortcut.clone()) {
                                    eprintln!("Template shortcut {} already registered, skipping...", hotkey_str);
                                    continue;
                                }

                                // Register template shortcut handler
                                match app.global_shortcut().on_shortcut(
                                    template_shortcut.clone(),
                                    move |_app, _shortcut, event| {
                                        if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                                            let app = app_clone.clone();
                                            let prompt = template_prompt.clone();
                                            let action = template_action.clone();
                                            let template_id_inner = template_id.clone();

                                            tauri::async_runtime::spawn(async move {
                                                // Capture the selected text
                                                match clipboard::capture_selected_text().await {
                                                    Ok(text) => {
                                                        // Store the captured text in state
                                                        let captured_state: tauri::State<CapturedText> = app.state();
                                                        *captured_state.0.lock().await = text;
                                                    }
                                                    Err(e) => {
                                                        eprintln!("Warning: Failed to capture selection: {}", e);
                                                    }
                                                }

                                                // Show the popup window with template info
                                                if let Err(e) = show_popup_window(app.clone()).await {
                                                    eprintln!("Failed to show popup: {}", e);
                                                    return;
                                                }

                                                // Wait a bit for the window to be fully loaded
                                                tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;

                                                // Emit event to trigger template execution
                                                if let Some(popup) = app.get_webview_window("popup") {
                                                    println!("Emitting execute-template event for template: {}", template_id_inner);
                                                    if let Err(e) = popup.emit("execute-template", serde_json::json!({
                                                        "id": template_id_inner,
                                                        "prompt": prompt,
                                                        "action": action,
                                                    })) {
                                                        eprintln!("Failed to emit execute-template event: {}", e);
                                                    } else {
                                                        println!("Successfully emitted execute-template event");
                                                    }
                                                } else {
                                                    eprintln!("Popup window not found when trying to emit event");
                                                }
                                            });
                                        }
                                    },
                                ) {
                                    Ok(_) => {
                                        if let Err(e) = app.global_shortcut().register(template_shortcut) {
                                            eprintln!("Warning: Failed to register template shortcut {}: {}", hotkey_str, e);
                                        }
                                    }
                                    Err(e) => {
                                        eprintln!("Warning: Failed to setup template shortcut handler {}: {}", hotkey_str, e);
                                    }
                                }
                            } else {
                                eprintln!("Warning: Failed to parse template hotkey: {}", hotkey_str);
                            }
                        }
                    }
                }
            }

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            load_config,
            save_config,
            get_captured_text,
            show_popup_window,
            hide_popup_window,
            resize_popup_window,
            toggle_autostart,
            stream_ai_response,
            set_popup_pinned,
            is_popup_pinned,
            replace_text_in_source,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
