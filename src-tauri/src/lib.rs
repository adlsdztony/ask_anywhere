mod ai_client;
mod clipboard;
mod config;

use ai_client::AiClient;
use config::AppConfig;
use futures::StreamExt;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State, Window};
use tauri_plugin_store::StoreExt;
use tokio::sync::Mutex;

// Global state
struct AppState {
    ai_client: AiClient,
}

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
async fn stream_ai_response(
    state: State<'_, Arc<Mutex<AppState>>>,
    window: Window,
    base_url: String,
    api_key: String,
    model_name: String,
    prompt: String,
) -> Result<(), String> {
    let state = state.lock().await;

    let mut stream = state
        .ai_client
        .stream_chat(&base_url, &api_key, &model_name, &prompt)
        .await
        .map_err(|e| e.to_string())?;

    // Drop the lock before streaming
    drop(state);

    while let Some(result) = stream.next().await {
        match result {
            Ok(content) => {
                window
                    .emit("ai-stream-chunk", content)
                    .map_err(|e| e.to_string())?;
            }
            Err(e) => {
                window
                    .emit("ai-stream-error", e.to_string())
                    .map_err(|e| e.to_string())?;
                return Err(e.to_string());
            }
        }
    }

    window
        .emit("ai-stream-done", ())
        .map_err(|e| e.to_string())?;

    Ok(())
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
        .decorations(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .build()
        .map_err(|e| e.to_string())?;

        popup.show().map_err(|e| e.to_string())?;
        popup.set_focus().map_err(|e| e.to_string())?;
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
            // Initialize app state
            let state = Arc::new(Mutex::new(AppState {
                ai_client: AiClient::new(),
            }));
            app.manage(state);

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
            stream_ai_response,
            show_popup_window,
            hide_popup_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
