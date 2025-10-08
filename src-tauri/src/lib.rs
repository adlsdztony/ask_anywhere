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

#[tauri::command]
async fn show_popup_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("popup") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    } else {
        // Create popup window if it doesn't exist
        let popup = tauri::WebviewWindowBuilder::new(
            &app,
            "popup",
            tauri::WebviewUrl::App("popup.html".into()),
        )
        .title("Ask Anywhere")
        .inner_size(500.0, 600.0)
        .resizable(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .transparent(true)
        .theme(None) // Follow system theme
        .build()
        .map_err(|e| e.to_string())?;

        popup.show().map_err(|e| e.to_string())?;
        popup.set_focus().map_err(|e| e.to_string())?;

        // Close popup window when it loses focus
        let popup_clone = popup.clone();
        popup.on_window_event(move |event| {
            if let WindowEvent::Focused(focused) = event {
                if !focused {
                    let _ = popup_clone.close();
                }
            }
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
