import { useState, useEffect } from "react";
import { loadConfig, getCapturedText } from "../api";
import { streamAiResponse } from "../services/aiClient";
import type { AppConfig } from "../types";
import "./PopupWindow.css";

export default function PopupWindow() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [response, setResponse] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initializePopup();
  }, []);

  const initializePopup = async () => {
    try {
      // Load config
      const loadedConfig = await loadConfig();
      setConfig(loadedConfig);

      // Get captured text from state (already captured by hotkey handler)
      const capturedText = await getCapturedText();
      if (capturedText) {
        setSelectedText(capturedText);
      }
    } catch (err) {
      console.error("Failed to initialize popup:", err);
      setError("Failed to initialize. Please try again.");
    }
  };

  const handleSend = async () => {
    if (!config) return;

    const selectedModel = config.models[config.selected_model_index];
    if (!selectedModel.api_key) {
      setError("Please configure an API key in settings first.");
      return;
    }

    // Determine the prompt to use
    let finalPrompt = "";
    if (selectedTemplate) {
      const template = config.templates.find((t) => t.id === selectedTemplate);
      if (template) {
        finalPrompt = `${template.prompt}\n\n${selectedText}`;
      }
    } else if (customPrompt.trim()) {
      finalPrompt = `${customPrompt}\n\n${selectedText}`;
    } else {
      setError("Please select a template or enter a custom prompt.");
      return;
    }

    setIsStreaming(true);
    setResponse("");
    setError(null);

    try {
      await streamAiResponse(
        selectedModel.base_url,
        selectedModel.api_key,
        selectedModel.model_name,
        finalPrompt,
        {
          onChunk: (chunk) => {
            setResponse((prev) => prev + chunk);
          },
          onError: (err) => {
            setError(err);
            setIsStreaming(false);
          },
          onDone: () => {
            setIsStreaming(false);
          },
        },
      );
    } catch (err) {
      console.error("Stream error:", err);
      setError(err instanceof Error ? err.message : "Failed to get response");
      setIsStreaming(false);
    }
  };

  const handleCopyResponse = async () => {
    if (response) {
      try {
        await navigator.clipboard.writeText(response);
        alert("Response copied to clipboard!");
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    }
  };

  if (!config) {
    return <div className="popup-window loading">Loading...</div>;
  }

  return (
    <div className="popup-window">
      <div className="popup-content">
        <div className="section">
          <label>Choose Action:</label>
          <div className="template-buttons">
            {config.templates.map((template) => (
              <button
                key={template.id}
                className={`template-button ${selectedTemplate === template.id ? "active" : ""}`}
                onClick={() => {
                  setSelectedTemplate(template.id);
                  setCustomPrompt("");
                }}
                disabled={isStreaming}
              >
                {template.name}
              </button>
            ))}
          </div>
        </div>

        <div className="section">
          <label>Or Custom Prompt:</label>
          <textarea
            className="custom-prompt"
            value={customPrompt}
            onChange={(e) => {
              setCustomPrompt(e.target.value);
              setSelectedTemplate("");
            }}
            placeholder="Enter your custom prompt..."
            disabled={isStreaming}
            rows={3}
          />
        </div>

        <div className="section">
          <label>Model:</label>
          <select
            className="model-select"
            value={config.selected_model_index}
            onChange={(e) => {
              const newConfig = {
                ...config,
                selected_model_index: Number(e.target.value),
              };
              setConfig(newConfig);
            }}
            disabled={isStreaming}
          >
            {config.models.map((model, index) => (
              <option key={index} value={index}>
                {model.name}
              </option>
            ))}
          </select>
        </div>

        <button
          className="send-button"
          onClick={handleSend}
          disabled={isStreaming || !selectedText}
        >
          {isStreaming ? "Streaming..." : "Send"}
        </button>

        {error && <div className="error-message">{error}</div>}

        {response && (
          <div className="section response-section">
            <div className="response-header">
              <label>Response:</label>
              <button className="copy-button" onClick={handleCopyResponse}>
                Copy
              </button>
            </div>
            <div className="response-text">{response}</div>
          </div>
        )}
      </div>
    </div>
  );
}
