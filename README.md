# Ask Anywhere

A high-performance Windows global text-selection AI query tool built with Tauri 2.0, React, TypeScript, and Rust.

## Features

- 🚀 **Global Hotkey Support**: Quickly summon the AI assistant from anywhere in Windows
- 📋 **Smart Clipboard Integration**: Automatically captures selected text when invoked
- 🤖 **OpenAI-Compatible API Support**: Works with OpenAI, OpenRouter, local LLMs, and any OpenAI-compatible endpoints
- 💬 **Real-time Streaming Responses**: Get AI responses as they're generated (with full streaming support)
- 📝 **Customizable Question Templates**: Pre-define common prompts for quick access
- 🔧 **Multi-Model Support**: Configure and switch between multiple AI models
- 🎯 **System Tray Integration**: Minimize to system tray and run in background
- ⚡ **High Performance**: Built with Rust for low latency and minimal resource usage

## Architecture

- **Frontend**: Tauri 2.0 + React + TypeScript + Vite
- **Backend**: Rust with Tokio async runtime
- **Key Technologies**:
  - `tauri-plugin-global-shortcut`: Global hotkey registration
  - `tauri-plugin-clipboard-manager`: Clipboard access
  - `tauri-plugin-store`: Persistent configuration storage
  - `reqwest`: Async HTTP client with streaming support

## Getting Started

### Prerequisites

- Node.js (v16 or later)
- Rust (latest stable)
- Windows 10/11

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd ask_anywhere
```

2. Install dependencies:
```bash
npm install
```

3. Run in development mode:
```bash
npm run tauri dev
```

4. Build for production:
```bash
npm run tauri build
```

The built application will be in `src-tauri/target/release/`.

## Usage

### Initial Setup

1. Launch the application
2. The Settings window will open automatically
3. Configure at least one AI model:
   - **Name**: A friendly name for the model
   - **Base URL**: The API endpoint (e.g., `https://api.openai.com/v1`)
   - **API Key**: Your API key for the service
   - **Model Name**: The model identifier (e.g., `gpt-3.5-turbo`)

### Configuring Templates

Go to the **Templates** tab to create pre-defined question templates:
- **Translate to English**: Quickly translate selected text
- **Explain**: Get explanations for complex topics
- **Summarize**: Get concise summaries
- Add your own custom templates!

### Setting Up Hotkeys

In the **Hotkeys** tab, configure your global shortcut:
- Default: `CommandOrControl+Shift+Space`
- Examples: `Alt+Q`, `Ctrl+Shift+A`
- **Note**: You must restart the app for hotkey changes to take effect

### Using the Popup

1. Select any text in any application
2. Press your configured hotkey (default: `Ctrl+Shift+Space`)
3. The popup window appears with your selected text
4. Choose a template or enter a custom prompt
5. Select a model (if you have multiple configured)
6. Click **Send**
7. Watch the AI response stream in real-time
8. Copy the response to clipboard if needed

### System Tray

The application minimizes to the system tray when you close the main window:
- **Click the tray icon**: Restore the settings window
- **Right-click the tray icon**: Access menu options
  - **Show Settings**: Open the configuration window
  - **Quit**: Exit the application completely

The application continues running in the background, ready to respond to your global hotkey even when the main window is hidden.

## Configuration File

Configuration is stored in a JSON file managed by `tauri-plugin-store`. The default location is in your app data directory:
- Windows: `%APPDATA%/com.adlsdztony.ask-anywhere/`

## Performance Optimizations

- **Async Streaming**: Uses Tokio for efficient async operations
- **Minimal Memory Footprint**: Rust backend keeps memory usage low
- **Fast Startup**: Optimized for quick hotkey response
- **Low Latency**: Direct API communication with no intermediary services

## API Compatibility

This tool works with any OpenAI-compatible API, including:
- OpenAI (GPT-3.5, GPT-4, etc.)
- Azure OpenAI
- OpenRouter
- Local LLMs (Ollama, LM Studio, etc.)
- Anthropic Claude (via compatibility layers)
- Any custom OpenAI-compatible endpoint

## Project Structure

```
ask_anywhere/
├── src/                      # React frontend
│   ├── components/          # React components
│   │   ├── ConfigPage.tsx   # Settings UI
│   │   └── PopupWindow.tsx  # Popup interface
│   ├── types.ts             # TypeScript definitions
│   ├── api.ts               # Tauri command wrappers
│   └── main.tsx             # Main entry point
├── src-tauri/               # Rust backend
│   ├── src/
│   │   ├── config.rs        # Configuration structs
│   │   ├── ai_client.rs     # AI streaming client
│   │   ├── clipboard.rs     # Clipboard utilities
│   │   └── lib.rs           # Main Tauri application
│   └── Cargo.toml           # Rust dependencies
├── index.html               # Main window HTML
├── popup.html               # Popup window HTML
└── vite.config.ts           # Vite configuration
```

## Development

### Adding New Templates

Templates are stored in the configuration. You can add them via the UI or by editing the config directly.

### Adding New Commands

1. Define the command in `src-tauri/src/lib.rs`
2. Add it to `invoke_handler!` macro
3. Create wrapper functions in `src/api.ts`
4. Use in React components

### Debugging

- Frontend: Open DevTools in the Tauri window (F12)
- Backend: Check `cargo run` output or use `println!` debugging

## Security

- API keys are stored locally and never transmitted except to configured endpoints
- All API communications use HTTPS
- Configuration is stored in the user's app data directory

## Known Limitations

- Windows only (currently)
- Global hotkeys cannot be changed without restarting the app
- Single popup window (cannot have multiple instances open)

## Future Enhancements

- [ ] Multi-platform support (macOS, Linux)
- [ ] Hot-reload hotkey configuration
- [ ] History of queries and responses
- [ ] Markdown rendering in response
- [ ] Custom CSS themes
- [ ] Auto-updater
- [ ] System tray integration
- [ ] Multiple popup windows

## License

[Your License Here]

## Contributing

Contributions are welcome! Please open an issue or pull request.

## Credits

Built with:
- [Tauri](https://tauri.app/)
- [React](https://react.dev/)
- [Rust](https://www.rust-lang.org/)
- [Tokio](https://tokio.rs/)
- [Reqwest](https://github.com/seanmonstar/reqwest)
