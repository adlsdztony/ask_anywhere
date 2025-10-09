import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { loadConfig, getCapturedText, resizePopupWindow } from "../api";
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
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Window size constants
  const COMPACT_WIDTH = 500;
  const COMPACT_HEIGHT = 130;
  const EXPANDED_WIDTH = 500;
  const EXPANDED_HEIGHT = 600;

  useEffect(() => {
    initializePopup();
  }, []);

  // Resize window when response state changes
  useEffect(() => {
    const handleResize = async () => {
      try {
        if (response) {
          // Expand window when response is available
          await resizePopupWindow(EXPANDED_WIDTH, EXPANDED_HEIGHT);
        } else {
          // Compact window when no response
          await resizePopupWindow(COMPACT_WIDTH, COMPACT_HEIGHT);
        }
      } catch (err) {
        console.error("Failed to resize window:", err);
      }
    };

    handleResize();
  }, [response]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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

      // Auto-focus input field after a short delay
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
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
        <div className="input-container">
          <input
            ref={inputRef}
            type="text"
            className="custom-prompt"
            value={customPrompt}
            onChange={(e) => {
              setCustomPrompt(e.target.value);
              setSelectedTemplate("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isStreaming && customPrompt.trim()) {
                handleSend();
              }
            }}
            placeholder="Ask anything..."
            disabled={isStreaming}
          />
          <div className="custom-dropdown" ref={dropdownRef}>
            <button
              className="model-select"
              onClick={() => !isStreaming && setIsDropdownOpen(!isDropdownOpen)}
              disabled={isStreaming}
              type="button"
            >
              {config.models[config.selected_model_index]?.name ||
                "Select Model"}
            </button>
            {isDropdownOpen && (
              <div className="dropdown-menu">
                {config.models.map((model, index) => (
                  <div
                    key={index}
                    className={`dropdown-item ${index === config.selected_model_index ? "active" : ""}`}
                    onClick={() => {
                      const newConfig = {
                        ...config,
                        selected_model_index: index,
                      };
                      setConfig(newConfig);
                      setIsDropdownOpen(false);
                    }}
                  >
                    {model.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

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

        {error && <div className="error-message">{error}</div>}

        {response && (
          <div className="response-section">
            <div className="response-text markdown-content">
              <button className="copy-button" onClick={handleCopyResponse}>
                Copy
              </button>
              <ReactMarkdown>{response}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
