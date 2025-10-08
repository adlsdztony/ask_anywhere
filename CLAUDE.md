I want to develop a Windows global text-selection AI query tool using Rust, with the UI built on Tauri 2.0 (https://tauri.app/start/). It needs a configuration interface that supports any OpenAI-compatible models, allowing users to customize the base URL and API key. Users should also be able to set up predefined question templates. Additionally, users must be able to define custom hotkeys to summon a small popup window.

After selecting text, users can invoke the popup with a hotkey, which will display several predefined question templates or allow manual text input. Then users can choose a model and click a send button to query the AI model. The response should be streamed and displayed in real-time inside the popup.

This program should be high-performance, with low latency, low memory usage, high concurrency, and low resource consumption, as it is a global application.

Frontend: Tauri + React + Typescript
Backend: Rust