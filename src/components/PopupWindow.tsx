import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import {
  loadConfig,
  getCapturedText,
  resizePopupWindow,
  hidePopupWindow,
  setPopupPinned,
  isPopupPinned,
  replaceTextInSource,
} from "../api";
import {
  streamAiResponse,
  type Message as AIMessage,
} from "../services/aiClient";
import type { AppConfig } from "../types";
import "./PopupWindow.css";

// Preprocess LaTeX delimiters from LLM output
// Converts LaTeX bracket notation to dollar signs for remark-math
function preprocessLatex(content: string): string {
  // Convert block LaTeX: \[ ... \] to $$...$$
  const blockProcessed = content.replace(
    /\\\[([\s\S]*?)\\\]/g,
    (_match, equation) => `$$${equation}$$`,
  );

  // Convert inline LaTeX: \( ... \) to $...$
  const inlineProcessed = blockProcessed.replace(
    /\\\(([\s\S]*?)\\\)/g,
    (_match, equation) => `$${equation}$`,
  );

  return inlineProcessed;
}

// CodeBlock component with copy button
function CodeBlock({ children }: { children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    // Extract text content from the code element
    const codeElement = Array.isArray(children) ? children[0] : children;
    let textContent = "";

    if (
      codeElement &&
      typeof codeElement === "object" &&
      "props" in codeElement
    ) {
      const codeProps = codeElement.props;
      if (codeProps && codeProps.children) {
        textContent = String(codeProps.children);
      }
    }

    if (textContent) {
      try {
        await navigator.clipboard.writeText(textContent);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error("Failed to copy code:", err);
      }
    }
  };

  return (
    <div className="code-block-wrapper">
      <button className="code-copy-button" onClick={handleCopy}>
        {copied ? "Copied!" : "Copy"}
      </button>
      <pre>{children}</pre>
    </div>
  );
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function PopupWindow() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentResponse, setCurrentResponse] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [isPinned, setIsPinned] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const capturedTextRef = useRef<string>("");

  // Window size - use configured width or default to 500
  const POPUP_WIDTH = config?.popup_width || 500;
  const COMPACT_HEIGHT = 200;
  const EXPANDED_HEIGHT = 600;

  // Initialize popup only once when component mounts
  useEffect(() => {
    initializePopup();
  }, []);

  // Separate effect for trigger-replace event listener
  useEffect(() => {
    // Listen for trigger-replace event from backend
    const unlistenReplace = listen("trigger-replace", () => {
      // Get the latest assistant message
      const latestAssistantMessage = messages.find(
        (m) => m.role === "assistant",
      );
      if (latestAssistantMessage) {
        // Trigger replace with the latest assistant response
        handleReplaceResponseInternal(latestAssistantMessage.content);
      }
    });

    return () => {
      unlistenReplace.then((fn) => fn());
    };
  }, [messages]);

  // Separate effect for execute-template event - only set up when config is loaded
  useEffect(() => {
    if (!config) {
      console.log(
        "Config not loaded yet, skipping execute-template listener setup",
      );
      return;
    }

    console.log("Setting up execute-template event listener");

    // Listen for execute-template event from backend (triggered by template hotkey)
    const unlistenTemplate = listen<{
      id: string;
      prompt: string;
      action: string;
    }>("execute-template", async (event) => {
      console.log("=== Received execute-template event ===");
      console.log("Event payload:", event.payload);
      const { prompt, action } = event.payload;

      // Wait to ensure popup is fully initialized and text is captured
      console.log("Waiting for popup to initialize and text to be captured...");
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Get the captured text and update both state and ref
      let capturedText = "";
      try {
        capturedText = await getCapturedText();
        console.log("Captured text:", capturedText);
        if (capturedText) {
          capturedTextRef.current = capturedText; // Store in ref immediately

          // Add captured text as a user message in history for display
          setMessages((prev) => {
            // Only add if messages is empty or doesn't already contain the captured text
            if (
              prev.length === 0 ||
              prev[prev.length - 1].content !== capturedText
            ) {
              return [{ role: "user", content: capturedText }];
            }
            return prev;
          });
        }
      } catch (err) {
        console.error("Failed to get captured text:", err);
      }

      console.log("Preparing to call handleSend");
      console.log("- Template prompt:", prompt);
      console.log("- Action:", action);
      console.log("- Captured text:", capturedText);

      // Call handleSend with captured text as parameter (bypasses state dependency)
      try {
        await handleSend(
          prompt,
          action as "none" | "copy" | "replace",
          capturedText,
        );
        console.log("handleSend completed successfully");
      } catch (err) {
        console.error("Error calling handleSend:", err);
      }
    });

    return () => {
      console.log("Cleaning up execute-template event listener");
      unlistenTemplate.then((fn) => fn());
    };
  }, [config]); // Re-register when config changes

  // Resize window when messages change
  useEffect(() => {
    const handleResize = async () => {
      try {
        if (messages.length > 0 || currentResponse) {
          // Expand window when there are messages or streaming
          await resizePopupWindow(POPUP_WIDTH, EXPANDED_HEIGHT);
        } else {
          // Compact window when no messages
          await resizePopupWindow(POPUP_WIDTH, COMPACT_HEIGHT);
        }
      } catch (err) {
        console.error("Failed to resize window:", err);
      }
    };

    handleResize();
  }, [messages.length, currentResponse, POPUP_WIDTH]);

  // Auto-scroll to top when new messages are added
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = 0;
    }
  }, [messages.length]);

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
        capturedTextRef.current = capturedText; // Store in ref for immediate access

        // Add captured text as a user message in history (but don't send to LLM)
        setMessages([{ role: "user", content: capturedText }]);
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

  const handleSend = async (
    promptOverride?: string,
    templateAction?: "none" | "copy" | "replace",
    capturedTextOverride?: string,
  ) => {
    if (!config) return;

    const selectedModel = config.models[config.selected_model_index];
    if (!selectedModel.api_key) {
      setError("Please configure an API key in settings first.");
      return;
    }

    // Determine the prompt to use and track template action
    let finalPrompt = "";
    let actionToExecute: "none" | "copy" | "replace" = "none";

    if (promptOverride !== undefined) {
      // Use the provided prompt override (from suggestion click or template hotkey)
      finalPrompt = promptOverride;
      actionToExecute = templateAction || "none";
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
          finalPrompt = additionalText
            ? `${template.prompt}\n\n${additionalText}`
            : template.prompt;
          actionToExecute = template.action;
        } else {
          setError(`Template "${commandName}" not found.`);
          return;
        }
      } else if (trimmedPrompt) {
        finalPrompt = trimmedPrompt;
      } else {
        setError("Please enter a prompt or use a template command.");
        return;
      }
    }

    setIsStreaming(true);
    setCurrentResponse("");
    setError(null);
    setShowSuggestions(false);

    // Build conversation history
    // Reverse messages array since UI displays newest first, but API needs oldest first
    const conversationMessages: AIMessage[] = [];

    // If capturedTextOverride is provided, add it as the first message
    if (capturedTextOverride) {
      conversationMessages.push({
        role: "user",
        content: capturedTextOverride,
      });
    } else {
      // Otherwise include all previous messages in correct order (oldest first)
      conversationMessages.push(...messages.slice().reverse());
    }

    // Add current user message
    conversationMessages.push({ role: "user", content: finalPrompt });

    // Debug log
    console.log("=== Sending to AI ===");
    console.log("Current messages state:", messages);
    console.log("Captured text override:", capturedTextOverride);
    console.log(
      "Conversation messages (will send to AI):",
      conversationMessages,
    );
    console.log("=====================");

    // Add user message to UI immediately
    setMessages((prev) => [{ role: "user", content: finalPrompt }, ...prev]);

    try {
      let accumulatedResponse = "";
      await streamAiResponse(
        selectedModel.base_url,
        selectedModel.api_key,
        selectedModel.model_name,
        conversationMessages,
        {
          onChunk: (chunk) => {
            accumulatedResponse += chunk;
            setCurrentResponse(accumulatedResponse);
          },
          onError: (err) => {
            setError(err);
            setIsStreaming(false);
            setCurrentResponse("");
          },
          onDone: async () => {
            // Add assistant response to messages
            setMessages((prev) => [
              { role: "assistant", content: accumulatedResponse },
              ...prev,
            ]);
            setCurrentResponse("");
            setCustomPrompt("");
            setIsStreaming(false);

            // Execute the template action if specified
            if (actionToExecute === "copy") {
              try {
                await navigator.clipboard.writeText(accumulatedResponse);
              } catch (err) {
                console.error("Failed to copy:", err);
              }
            } else if (actionToExecute === "replace") {
              handleReplaceResponseInternal(accumulatedResponse);
            }
          },
        },
      );
    } catch (err) {
      console.error("Stream error:", err);
      setError(err instanceof Error ? err.message : "Failed to get response");
      setIsStreaming(false);
      setCurrentResponse("");
    }
  };

  const handleSuggestionClick = (templateName: string) => {
    if (isStreaming) return;

    const template = config?.templates.find((t) => t.name === templateName);
    if (template) {
      setCustomPrompt(`/${templateName}`);
      setShowSuggestions(false);
      handleSend(template.prompt, template.action);
    }
  };

  const getFilteredTemplates = () => {
    if (!config) return [];

    const input = customPrompt.toLowerCase();
    if (!input.startsWith("/")) return [];

    // Filter out templates with background_mode enabled
    const visibleTemplates = config.templates.filter((t) => !t.background_mode);

    const searchTerm = input.slice(1);
    if (searchTerm === "") return visibleTemplates;

    return visibleTemplates.filter((t) =>
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
    const textToCopy =
      currentResponse || messages.find((m) => m.role === "assistant")?.content;
    if (textToCopy) {
      try {
        await navigator.clipboard.writeText(textToCopy);
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    }
  };

  const handleReplaceResponseInternal = (text?: string) => {
    const textToReplace =
      text ||
      currentResponse ||
      messages.find((m) => m.role === "assistant")?.content;
    if (textToReplace) {
      // Fire and forget - don't wait for response since window will close
      replaceTextInSource(textToReplace).catch((err) => {
        console.error("Failed to replace:", err);
      });

      // Close the window immediately after triggering replace
      setTimeout(() => {
        hidePopupWindow().catch(console.error);
      }, 50);
    }
  };

  const handleReplaceResponse = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleReplaceResponseInternal();
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

  const handleContainerMouseDown = async (e: React.MouseEvent) => {
    // Only handle dragging if clicking on the container itself, not its children
    const target = e.target as HTMLElement;

    // Check if clicked on interactive elements
    if (
      target.tagName === "INPUT" ||
      target.tagName === "BUTTON" ||
      target.closest("button") ||
      target.closest("input") ||
      target.closest(".custom-dropdown")
    ) {
      return;
    }

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
        <div className="input-container" onMouseDown={handleContainerMouseDown}>
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
            className={`pin-button ${isPinned ? "pinned" : ""}`}
            onClick={handlePinClick}
            title={isPinned ? "Unpin window" : "Pin window"}
            type="button"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {isPinned ? (
                <>
                  <line x1="12" y1="17" x2="12" y2="22" />
                  <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
                </>
              ) : (
                <>
                  <line x1="12" y1="17" x2="12" y2="22" />
                  <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
                </>
              )}
            </svg>
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

        {(messages.length > 0 || currentResponse) && (
          <div className="messages-container" ref={messagesContainerRef}>
            {/* Current streaming response (AI message at top) */}
            {currentResponse && (
              <div className="message assistant-message">
                <div className="message-content markdown-content">
                  <div className="action-buttons">
                    <button
                      className="replace-button"
                      onClick={handleReplaceResponse}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="1 4 1 10 7 10" />
                        <polyline points="23 20 23 14 17 14" />
                        <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
                      </svg>
                    </button>
                    <button
                      className="copy-button"
                      onClick={handleCopyResponse}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect
                          x="9"
                          y="9"
                          width="13"
                          height="13"
                          rx="2"
                          ry="2"
                        />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    </button>
                  </div>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                    components={{
                      pre: ({ children }) => {
                        return <CodeBlock>{children}</CodeBlock>;
                      },
                    }}
                  >
                    {preprocessLatex(currentResponse)}
                  </ReactMarkdown>
                </div>
              </div>
            )}

            {/* Message history (newest first) */}
            {messages.map((message, index) => (
              <div
                key={index}
                className={`message ${message.role === "user" ? "user-message" : "assistant-message"}`}
              >
                <div className="message-content">
                  {message.role === "assistant" ? (
                    <>
                      <div className="action-buttons">
                        <button
                          className="replace-button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleReplaceResponseInternal(message.content);
                          }}
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="1 4 1 10 7 10" />
                            <polyline points="23 20 23 14 17 14" />
                            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
                          </svg>
                        </button>
                        <button
                          className="copy-button"
                          onClick={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            try {
                              await navigator.clipboard.writeText(
                                message.content,
                              );
                            } catch (err) {
                              console.error("Failed to copy:", err);
                            }
                          }}
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <rect
                              x="9"
                              y="9"
                              width="13"
                              height="13"
                              rx="2"
                              ry="2"
                            />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                        </button>
                      </div>
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                        components={{
                          pre: ({ children }) => {
                            return <CodeBlock>{children}</CodeBlock>;
                          },
                        }}
                      >
                        {preprocessLatex(message.content)}
                      </ReactMarkdown>
                    </>
                  ) : (
                    <div className="user-message-text">{message.content}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
