import { useState, useEffect } from "react";
import { loadConfig, getCapturedText } from "../api";
import { streamAiResponse } from "../services/aiClient";
import type { AppConfig } from "../types";

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
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-slate-500 animate-fade-in">Loading...</div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col animate-fade-in">
      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Selected Text */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 animate-slide-up">
          <label className="block text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">
            Selected Text
          </label>
          <div className="text-sm text-slate-700 max-h-24 overflow-y-auto whitespace-pre-wrap break-words bg-slate-50 rounded p-3">
            {selectedText || (
              <span className="text-slate-400 italic">No text selected</span>
            )}
          </div>
        </div>

        {/* Template Buttons */}
        <div
          className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 animate-slide-up"
          style={{ animationDelay: "0.05s" }}
        >
          <label className="block text-xs font-semibold text-slate-600 mb-3 uppercase tracking-wide">
            Quick Actions
          </label>
          <div className="flex flex-wrap gap-2">
            {config.templates.map((template) => (
              <button
                key={template.id}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  selectedTemplate === template.id
                    ? "bg-primary-500 text-white shadow-md scale-105"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200 hover:shadow"
                } disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100`}
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

        {/* Custom Prompt */}
        <div
          className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 animate-slide-up"
          style={{ animationDelay: "0.1s" }}
        >
          <label className="block text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">
            Custom Prompt
          </label>
          <textarea
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none disabled:bg-slate-100 disabled:cursor-not-allowed transition-all"
            value={customPrompt}
            onChange={(e) => {
              setCustomPrompt(e.target.value);
              setSelectedTemplate("");
            }}
            placeholder="Or type your custom prompt here..."
            disabled={isStreaming}
            rows={3}
          />
        </div>

        {/* Model Selection */}
        <div
          className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 animate-slide-up"
          style={{ animationDelay: "0.15s" }}
        >
          <label className="block text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">
            AI Model
          </label>
          <select
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-slate-100 disabled:cursor-not-allowed bg-white cursor-pointer transition-all"
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

        {/* Send Button */}
        <button
          className="w-full py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-md animate-slide-up"
          style={{ animationDelay: "0.2s" }}
          onClick={handleSend}
          disabled={isStreaming || !selectedText}
        >
          {isStreaming ? (
            <span className="flex items-center justify-center gap-2">
              <svg
                className="animate-spin h-5 w-5"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Streaming...
            </span>
          ) : (
            "Send Query"
          )}
        </button>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 animate-slide-up">
            <div className="flex gap-2">
              <svg
                className="w-5 h-5 text-red-500 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <div className="text-sm text-red-700">{error}</div>
            </div>
          </div>
        )}

        {/* Response */}
        {response && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 animate-slide-up">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                AI Response
              </label>
              <button
                className="px-3 py-1.5 bg-slate-600 hover:bg-slate-700 text-white text-xs font-medium rounded-md transition-all duration-200 shadow-sm hover:shadow"
                onClick={handleCopyResponse}
              >
                Copy
              </button>
            </div>
            <div className="text-sm text-slate-700 leading-relaxed max-h-72 overflow-y-auto whitespace-pre-wrap break-words bg-slate-50 rounded p-3">
              {response}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
