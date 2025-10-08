import { useState, useEffect } from "react";
import { loadConfig, saveConfig } from "../api";
import type { AppConfig, ModelConfig, QuestionTemplate } from "../types";

export default function ConfigPage() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "models" | "templates" | "hotkeys"
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
    };
    setConfig({ ...config, templates: [...config.templates, newTemplate] });
  };

  const updateTemplate = (
    index: number,
    field: keyof QuestionTemplate,
    value: string,
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
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="text-slate-500 animate-fade-in">
          Loading configuration...
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="text-red-500 animate-fade-in">
          Failed to load configuration
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between shadow-sm">
        <h1 className="text-2xl font-bold text-slate-800">Ask Anywhere</h1>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-md"
        >
          {saving ? "Saving..." : "Save Configuration"}
        </button>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200 px-8 flex gap-1">
        <button
          className={`px-6 py-3 font-medium text-sm transition-all duration-200 border-b-2 ${
            activeTab === "models"
              ? "text-primary-600 border-primary-600"
              : "text-slate-600 border-transparent hover:text-primary-500"
          }`}
          onClick={() => setActiveTab("models")}
        >
          Models
        </button>
        <button
          className={`px-6 py-3 font-medium text-sm transition-all duration-200 border-b-2 ${
            activeTab === "templates"
              ? "text-primary-600 border-primary-600"
              : "text-slate-600 border-transparent hover:text-primary-500"
          }`}
          onClick={() => setActiveTab("templates")}
        >
          Templates
        </button>
        <button
          className={`px-6 py-3 font-medium text-sm transition-all duration-200 border-b-2 ${
            activeTab === "hotkeys"
              ? "text-primary-600 border-primary-600"
              : "text-slate-600 border-transparent hover:text-primary-500"
          }`}
          onClick={() => setActiveTab("hotkeys")}
        >
          Hotkeys
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto">
          {activeTab === "models" && (
            <div className="space-y-6 animate-fade-in">
              {/* Section Header */}
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-800">
                  Model Configuration
                </h2>
                <button
                  onClick={addModel}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg shadow-md hover:shadow-lg transition-all duration-200"
                >
                  + Add Model
                </button>
              </div>

              {/* Default Model Selection */}
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
                <label className="block text-sm font-semibold text-slate-700 mb-3">
                  Default Model
                </label>
                <select
                  className="w-full px-4 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white cursor-pointer"
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

              {/* Model Cards */}
              {config.models.map((model, index) => (
                <div
                  key={index}
                  className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 space-y-4"
                >
                  <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                    <h3 className="text-base font-semibold text-slate-700">
                      Model {index + 1}
                    </h3>
                    {config.models.length > 1 && (
                      <button
                        onClick={() => removeModel(index)}
                        className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-md transition-all duration-200"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Name
                    </label>
                    <input
                      type="text"
                      className="w-full px-4 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      value={model.name}
                      onChange={(e) =>
                        updateModel(index, "name", e.target.value)
                      }
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Base URL
                    </label>
                    <input
                      type="text"
                      className="w-full px-4 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      value={model.base_url}
                      onChange={(e) =>
                        updateModel(index, "base_url", e.target.value)
                      }
                      placeholder="https://api.openai.com/v1"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      API Key
                    </label>
                    <input
                      type="password"
                      className="w-full px-4 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      value={model.api_key}
                      onChange={(e) =>
                        updateModel(index, "api_key", e.target.value)
                      }
                      placeholder="sk-..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Model Name
                    </label>
                    <input
                      type="text"
                      className="w-full px-4 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
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
            <div className="space-y-6 animate-fade-in">
              {/* Section Header */}
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-800">
                  Question Templates
                </h2>
                <button
                  onClick={addTemplate}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg shadow-md hover:shadow-lg transition-all duration-200"
                >
                  + Add Template
                </button>
              </div>

              {/* Template Cards */}
              {config.templates.map((template, index) => (
                <div
                  key={template.id}
                  className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 space-y-4"
                >
                  <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                    <h3 className="text-base font-semibold text-slate-700">
                      {template.name || "Unnamed Template"}
                    </h3>
                    <button
                      onClick={() => removeTemplate(index)}
                      className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-md transition-all duration-200"
                    >
                      Remove
                    </button>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Template Name
                    </label>
                    <input
                      type="text"
                      className="w-full px-4 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      value={template.name}
                      onChange={(e) =>
                        updateTemplate(index, "name", e.target.value)
                      }
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Prompt
                    </label>
                    <textarea
                      className="w-full px-4 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-vertical"
                      value={template.prompt}
                      onChange={(e) =>
                        updateTemplate(index, "prompt", e.target.value)
                      }
                      rows={3}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "hotkeys" && (
            <div className="space-y-6 animate-fade-in">
              {/* Section Header */}
              <h2 className="text-xl font-bold text-slate-800">
                Hotkey Configuration
              </h2>

              {/* Hotkey Card */}
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Popup Hotkey
                  </label>
                  <input
                    type="text"
                    className="w-full px-4 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
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
                  <div className="mt-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm text-blue-800 leading-relaxed">
                      <strong>Examples:</strong> CommandOrControl+Shift+Space,
                      Alt+Q, Ctrl+Shift+A
                      <br />
                      <strong>Note:</strong> You need to restart the app for
                      hotkey changes to take effect.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
