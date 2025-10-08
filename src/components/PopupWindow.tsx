import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
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

  const handleSend = async (promptOverride?: string) => {
    if (!config) return;

    const selectedModel = config.models[config.selected_model_index];
    if (!selectedModel.api_key) {
      setError("Please configure an API key in settings first.");
      return;
    }

    // Determine the prompt to use
    let finalPrompt = "";
    if (promptOverride !== undefined) {
      // Use the provided prompt override (from template click)
      finalPrompt = `${promptOverride}\n\n${selectedText}`;
    } else if (selectedTemplate) {
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

  const handleTemplateClick = (templateId: string) => {
    if (isStreaming) return;

    const template = config?.templates.find((t) => t.id === templateId);
    if (template) {
      setSelectedTemplate(templateId);
      setCustomPrompt("");
      handleSend(template.prompt);
    }
  };

  const handleCustomPromptKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (customPrompt.trim() && !isStreaming) {
        handleSend();
      }
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
          <div className="template-buttons">
            {config.templates.map((template) => (
              <button
                key={template.id}
                className={`template-button ${selectedTemplate === template.id ? "active" : ""}`}
                onClick={() => handleTemplateClick(template.id)}
                disabled={isStreaming}
              >
                {template.name}
              </button>
            ))}
          </div>
        </div>

        <div className="section">
          <textarea
            className="custom-prompt"
            value={customPrompt}
            onChange={(e) => {
              setCustomPrompt(e.target.value);
              setSelectedTemplate("");
            }}
            onKeyDown={handleCustomPromptKeyDown}
            placeholder="Enter your custom prompt (press Enter to send)..."
            disabled={isStreaming}
            rows={3}
          />
        </div>

        <div className="section">
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

        {error && <div className="error-message">{error}</div>}

        {response && (
          <div className="section response-section">
            <div className="response-header">
              <label>Response:</label>
              <button className="copy-button" onClick={handleCopyResponse}>
                Copy
              </button>
            </div>
            <div className="response-text markdown-content">
              <ReactMarkdown>{response}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
