import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  loadConfig,
  getCapturedText,
  resizePopupWindow,
  hidePopupWindow,
  setPopupPinned,
  isPopupPinned,
} from "../api";
import { streamAiResponse } from "../services/aiClient";
import type { AppConfig } from "../types";
import "./PopupWindow.css";

export default function PopupWindow() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [copyButtonText, setCopyButtonText] = useState("Copy");
  const [isPinned, setIsPinned] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Window size constants
  const COMPACT_WIDTH = 500;
  const COMPACT_HEIGHT = 200;
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
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        !inputRef.current?.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Global ESC key handler to close popup window
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // If suggestions are open, close them first
        if (showSuggestions) {
          setShowSuggestions(false);
        } else if (isDropdownOpen) {
          // If dropdown is open, close it
          setIsDropdownOpen(false);
        } else {
          // Otherwise close the popup window
          hidePopupWindow();
        }
      }
    };

    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, [showSuggestions, isDropdownOpen]);

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

      // Load pinned state
      const pinned = await isPopupPinned();
      setIsPinned(pinned);

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
      // Use the provided prompt override (from suggestion click)
      finalPrompt = `${promptOverride}\n\n${selectedText}`;
    } else {
      // Check if input starts with "/" to use template
      const trimmedPrompt = customPrompt.trim();
      if (trimmedPrompt.startsWith("/")) {
        const commandName = trimmedPrompt.slice(1).split(" ")[0];
        const template = config.templates.find(
          (t) => t.name.toLowerCase() === commandName.toLowerCase(),
        );
        if (template) {
          // Extract any additional text after the command
          const additionalText = trimmedPrompt
            .slice(commandName.length + 1)
            .trim();
          finalPrompt = `${template.prompt}\n\n${selectedText}${additionalText ? "\n\n" + additionalText : ""}`;
        } else {
          setError(`Template "${commandName}" not found.`);
          return;
        }
      } else if (trimmedPrompt) {
        finalPrompt = `${trimmedPrompt}\n\n${selectedText}`;
      } else {
        setError("Please enter a prompt or use a template command.");
        return;
      }
    }

    setIsStreaming(true);
    setResponse("");
    setError(null);
    setShowSuggestions(false);

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

  const handleSuggestionClick = (templateName: string) => {
    if (isStreaming) return;

    const template = config?.templates.find((t) => t.name === templateName);
    if (template) {
      setCustomPrompt(`/${templateName}`);
      setShowSuggestions(false);
      handleSend(template.prompt);
    }
  };

  const getFilteredTemplates = () => {
    if (!config) return [];

    const input = customPrompt.toLowerCase();
    if (!input.startsWith("/")) return [];

    const searchTerm = input.slice(1);
    if (searchTerm === "") return config.templates;

    return config.templates.filter((t) =>
      t.name.toLowerCase().startsWith(searchTerm),
    );
  };

  const handleInputChange = (value: string) => {
    setCustomPrompt(value);

    if (value.startsWith("/")) {
      setShowSuggestions(true);
      setSuggestionIndex(0);
    } else {
      setShowSuggestions(false);
    }
  };

  const handleSlashButtonClick = () => {
    if (isStreaming) return;

    if (!customPrompt.startsWith("/")) {
      setCustomPrompt("/");
      setShowSuggestions(true);
      setSuggestionIndex(0);
    } else {
      setShowSuggestions(!showSuggestions);
    }

    // Focus input after clicking
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const filteredTemplates = getFilteredTemplates();

    if (showSuggestions && filteredTemplates.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSuggestionIndex((prev) => {
          const newIndex =
            prev < filteredTemplates.length - 1 ? prev + 1 : prev;
          // Scroll to the selected suggestion
          setTimeout(() => {
            const suggestionElement = suggestionsRef.current?.children[
              newIndex
            ] as HTMLElement;
            suggestionElement?.scrollIntoView({
              block: "nearest",
              behavior: "smooth",
            });
          }, 0);
          return newIndex;
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSuggestionIndex((prev) => {
          const newIndex = prev > 0 ? prev - 1 : 0;
          // Scroll to the selected suggestion
          setTimeout(() => {
            const suggestionElement = suggestionsRef.current?.children[
              newIndex
            ] as HTMLElement;
            suggestionElement?.scrollIntoView({
              block: "nearest",
              behavior: "smooth",
            });
          }, 0);
          return newIndex;
        });
      } else if (e.key === "Tab") {
        e.preventDefault();
        const selected = filteredTemplates[suggestionIndex];
        if (selected) {
          setCustomPrompt(`/${selected.name}`);
          setShowSuggestions(false);
        }
      } else if (e.key === "Escape") {
        setShowSuggestions(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (!isStreaming && customPrompt.trim()) {
          handleSend();
        }
      }
    } else if (e.key === "Enter" && !isStreaming && customPrompt.trim()) {
      handleSend();
    }
  };

  const handleCopyResponse = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (response) {
      try {
        await navigator.clipboard.writeText(response);
        setCopyButtonText("Copied!");
        setTimeout(() => {
          setCopyButtonText("Copy");
        }, 1500);
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    }
  };

  const handlePinClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      const newPinnedState = !isPinned;
      setIsPinned(newPinnedState);
      await setPopupPinned(newPinnedState);
    } catch (err) {
      console.error("Failed to toggle pin:", err);
    }
  };

  const handlePinDragStart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Check if it's a left click (button 0)
    if (e.button !== 0) return;

    // Temporarily pin the window to prevent it from closing during drag
    const wasPinned = isPinned;
    if (!wasPinned) {
      await setPopupPinned(true);
    }

    try {
      const window = getCurrentWindow();
      await window.startDragging();
    } catch (err) {
      console.error("Failed to start dragging:", err);
    } finally {
      // Restore original pin state after drag
      if (!wasPinned) {
        await setPopupPinned(false);
      }
    }
  };

  if (!config) {
    return <div className="popup-window loading">Loading...</div>;
  }

  return (
    <div className="popup-window">
      <div
        className={`popup-content ${showSuggestions ? "with-suggestions" : ""}`}
      >
        <div className="input-container">
          <button
            className="slash-button"
            onClick={handleSlashButtonClick}
            disabled={isStreaming}
            type="button"
            title="Show template commands"
          >
            /
          </button>
          <input
            ref={inputRef}
            type="text"
            className="custom-prompt"
            value={customPrompt}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything or type / for templates..."
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
          <button
            className="drag-handle"
            onMouseDown={handlePinDragStart}
            title="Drag to move window"
            type="button"
          >
            ⋮⋮
          </button>
          <button
            className={`pin-button ${isPinned ? "pinned" : ""}`}
            onClick={handlePinClick}
            title={isPinned ? "Click to unpin" : "Click to pin"}
            type="button"
          >
            {isPinned ? "📌" : "📍"}
          </button>
        </div>

        {showSuggestions && getFilteredTemplates().length > 0 && (
          <div className="suggestions-menu" ref={suggestionsRef}>
            {getFilteredTemplates().map((template, index) => (
              <div
                key={template.id}
                className={`suggestion-item ${index === suggestionIndex ? "highlighted" : ""}`}
                onClick={() => handleSuggestionClick(template.name)}
                onMouseEnter={() => setSuggestionIndex(index)}
              >
                <span className="suggestion-name">/{template.name}</span>
                <span className="suggestion-desc">
                  {template.prompt.slice(0, 60)}
                  {template.prompt.length > 60 ? "..." : ""}
                </span>
              </div>
            ))}
          </div>
        )}

        {error && <div className="error-message">{error}</div>}

        {response && (
          <div className="response-section">
            <div className="response-text markdown-content">
              <button className="copy-button" onClick={handleCopyResponse}>
                {copyButtonText}
              </button>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {response}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
