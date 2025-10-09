mod clipboard;
mod config;

use config::AppConfig;
use std::sync::Arc;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, State, WindowEvent};
use tauri_plugin_store::StoreExt;
use tokio::sync::Mutex;

// Captured text state
struct CapturedText(Arc<Mutex<String>>);

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

    // Popup window size (compact initial size)
    const POPUP_WIDTH: f64 = 500.0;
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
        if popup_x + (POPUP_WIDTH * scale_factor) as i32
            > monitor_position.x + monitor_size.width as i32
        {
            // Move to left of cursor
            popup_x = cursor_x - OFFSET - (POPUP_WIDTH * scale_factor) as i32;
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
        .inner_size(POPUP_WIDTH, POPUP_HEIGHT)
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
        if popup_x + (POPUP_WIDTH * scale_factor) as i32
            > monitor_position.x + monitor_size.width as i32
        {
            // Move to left of cursor
            popup_x = cursor_x - OFFSET - (POPUP_WIDTH * scale_factor) as i32;
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
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;

            let popup_for_event = popup_clone.clone();
            popup_clone.on_window_event(move |event| {
                if let WindowEvent::Focused(focused) = event {
                    if !focused {
                        let _ = popup_for_event.close();
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

            // Setup system tray
            let show = MenuItem::with_id(app, "show", "Show Settings", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
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

                // Register the shortcut handler
                match app.global_shortcut().on_shortcut(
                    shortcut.clone(),
                    move |_app, _shortcut, event| {
                        if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                            let app = app_handle.clone();
                            tauri::async_runtime::spawn(async move {
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
