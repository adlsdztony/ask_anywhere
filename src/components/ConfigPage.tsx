import { useState, useEffect } from "react";
import { loadConfig, saveConfig } from "../api";
import type { AppConfig, ModelConfig, QuestionTemplate } from "../types";
import "./ConfigPage.css";

export default function ConfigPage() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "models" | "templates" | "hotkeys" | "appearance"
  >("models");

  useEffect(() => {
    loadConfiguration();
  }, []);

  const loadConfiguration = async () => {
    try {
      const loadedConfig = await loadConfig();
      setConfig(loadedConfig);
    } catch (error) {
      console.error("Failed to load config:", error);
      alert("Failed to load configuration");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;

    setSaving(true);
    try {
      await saveConfig(config);
      alert("Configuration saved successfully!");
    } catch (error) {
      console.error("Failed to save config:", error);
      alert("Failed to save configuration");
    } finally {
      setSaving(false);
    }
  };

  const addModel = () => {
    if (!config) return;
    const newModel: ModelConfig = {
      name: "New Model",
      base_url: "https://api.openai.com/v1",
      api_key: "",
      model_name: "gpt-3.5-turbo",
    };
    setConfig({ ...config, models: [...config.models, newModel] });
  };

  const updateModel = (
    index: number,
    field: keyof ModelConfig,
    value: string,
  ) => {
    if (!config) return;
    const newModels = [...config.models];
    newModels[index] = { ...newModels[index], [field]: value };
    setConfig({ ...config, models: newModels });
  };

  const removeModel = (index: number) => {
    if (!config || config.models.length <= 1) {
      alert("You must have at least one model configured");
      return;
    }
    const newModels = config.models.filter((_, i) => i !== index);
    setConfig({ ...config, models: newModels });
  };

  const addTemplate = () => {
    if (!config) return;
    const newTemplate: QuestionTemplate = {
      id: `template_${Date.now()}`,
      name: "New Template",
      prompt: "Your prompt here...",
      action: "none",
      hotkey: null,
      background_mode: false,
    };
    setConfig({ ...config, templates: [...config.templates, newTemplate] });
  };

  const updateTemplate = (
    index: number,
    field: keyof QuestionTemplate,
    value: string | null | boolean,
  ) => {
    if (!config) return;
    const newTemplates = [...config.templates];
    newTemplates[index] = { ...newTemplates[index], [field]: value };
    setConfig({ ...config, templates: newTemplates });
  };

  const removeTemplate = (index: number) => {
    if (!config) return;
    const newTemplates = config.templates.filter((_, i) => i !== index);
    setConfig({ ...config, templates: newTemplates });
  };

  if (loading) {
    return <div className="loading">Loading configuration...</div>;
  }

  if (!config) {
    return <div className="error">Failed to load configuration</div>;
  }

  return (
    <div className="config-page">
      <header className="header">
        <h1>Ask Anywhere - Settings</h1>
        <button onClick={handleSave} disabled={saving} className="save-button">
          {saving ? "Saving..." : "Save Configuration"}
        </button>
      </header>

      <div className="tabs">
        <button
          className={activeTab === "models" ? "tab active" : "tab"}
          onClick={() => setActiveTab("models")}
        >
          Models
        </button>
        <button
          className={activeTab === "templates" ? "tab active" : "tab"}
          onClick={() => setActiveTab("templates")}
        >
          Templates
        </button>
        <button
          className={activeTab === "hotkeys" ? "tab active" : "tab"}
          onClick={() => setActiveTab("hotkeys")}
        >
          Hotkeys
        </button>
        <button
          className={activeTab === "appearance" ? "tab active" : "tab"}
          onClick={() => setActiveTab("appearance")}
        >
          Appearance
        </button>
      </div>

      <div className="content">
        {activeTab === "models" && (
          <div className="models-section">
            <div className="section-header">
              <h2>Model Configuration</h2>
              <button onClick={addModel} className="add-button">
                Add Model
              </button>
            </div>

            <div className="model-select">
              <label>Selected Model:</label>
              <select
                value={config.selected_model_index}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    selected_model_index: Number(e.target.value),
                  })
                }
              >
                {config.models.map((model, index) => (
                  <option key={index} value={index}>
                    {model.name}
                  </option>
                ))}
              </select>
            </div>

            {config.models.map((model, index) => (
              <div key={index} className="model-card">
                <div className="card-header">
                  <h3>Model {index + 1}</h3>
                  {config.models.length > 1 && (
                    <button
                      onClick={() => removeModel(index)}
                      className="remove-button"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="form-group">
                  <label>Name:</label>
                  <input
                    type="text"
                    value={model.name}
                    onChange={(e) => updateModel(index, "name", e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Base URL:</label>
                  <input
                    type="text"
                    value={model.base_url}
                    onChange={(e) =>
                      updateModel(index, "base_url", e.target.value)
                    }
                    placeholder="https://api.openai.com/v1"
                  />
                </div>
                <div className="form-group">
                  <label>API Key:</label>
                  <input
                    type="password"
                    value={model.api_key}
                    onChange={(e) =>
                      updateModel(index, "api_key", e.target.value)
                    }
                    placeholder="sk-..."
                  />
                </div>
                <div className="form-group">
                  <label>Model Name:</label>
                  <input
                    type="text"
                    value={model.model_name}
                    onChange={(e) =>
                      updateModel(index, "model_name", e.target.value)
                    }
                    placeholder="gpt-3.5-turbo"
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "templates" && (
          <div className="templates-section">
            <div className="section-header">
              <h2>Question Templates</h2>
              <button onClick={addTemplate} className="add-button">
                Add Template
              </button>
            </div>

            {config.templates.map((template, index) => (
              <div key={template.id} className="template-card">
                <div className="card-header">
                  <h3>{template.name || "Unnamed Template"}</h3>
                  <button
                    onClick={() => removeTemplate(index)}
                    className="remove-button"
                  >
                    Remove
                  </button>
                </div>
                <div className="form-group">
                  <label>Name:</label>
                  <input
                    type="text"
                    value={template.name}
                    onChange={(e) =>
                      updateTemplate(index, "name", e.target.value)
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Prompt:</label>
                  <textarea
                    value={template.prompt}
                    onChange={(e) =>
                      updateTemplate(index, "prompt", e.target.value)
                    }
                    rows={3}
                  />
                </div>
                <div className="form-group">
                  <label>Action after completion:</label>
                  <select
                    value={template.action}
                    onChange={(e) =>
                      updateTemplate(
                        index,
                        "action",
                        e.target.value as "none" | "copy" | "replace",
                      )
                    }
                  >
                    <option value="none">None - Keep popup open</option>
                    <option value="copy">Copy - Copy response to clipboard</option>
                    <option value="replace">
                      Replace - Replace selected text with response
                    </option>
                  </select>
                  <p className="help-text">
                    Choose what happens automatically when the AI finishes
                    responding.
                  </p>
                </div>
                <div className="form-group">
                  <label>Hotkey (optional):</label>
                  <input
                    type="text"
                    value={template.hotkey || ""}
                    onChange={(e) =>
                      updateTemplate(index, "hotkey", e.target.value || null)
                    }
                    placeholder="e.g., Alt+T, Ctrl+Shift+E"
                  />
                  <p className="help-text">
                    Set a custom hotkey to trigger this template directly.
                    Examples: Alt+T, Ctrl+Shift+E, CommandOrControl+Q
                    <br />
                    Hotkeys will be automatically registered when you save the
                    configuration.
                  </p>
                </div>
                <div className="form-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={template.background_mode || false}
                      onChange={(e) =>
                        updateTemplate(
                          index,
                          "background_mode",
                          e.target.checked,
                        )
                      }
                    />
                    <span>Run in background (no popup window)</span>
                  </label>
                  <p className="help-text">
                    When enabled, pressing the hotkey will execute the template in
                    the background without showing the popup window. The result
                    will automatically perform the configured action (copy/replace).
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "hotkeys" && (
          <div className="hotkeys-section">
            <h2>Hotkey Configuration</h2>
            <div className="form-group">
              <label>Popup Hotkey:</label>
              <input
                type="text"
                value={config.hotkeys.popup_hotkey}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    hotkeys: {
                      ...config.hotkeys,
                      popup_hotkey: e.target.value,
                    },
                  })
                }
                placeholder="CommandOrControl+Shift+Space"
              />
              <p className="help-text">
                Examples: CommandOrControl+Shift+Space, Alt+Q, Ctrl+Shift+A
                <br />
                Hotkeys will be automatically registered when you save the
                configuration.
              </p>
            </div>
          </div>
        )}

        {activeTab === "appearance" && (
          <div className="appearance-section">
            <h2>Appearance Settings</h2>
            <div className="form-group">
              <label>Popup Width (px):</label>
              <input
                type="number"
                min="300"
                max="1200"
                value={config.popup_width}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    popup_width: Number(e.target.value),
                  })
                }
              />
              <p className="help-text">
                Set the initial width of the popup window (300-1200px). Default:
                500px
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
