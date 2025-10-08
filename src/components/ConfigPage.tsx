import React, { useState, useEffect } from 'react';
import { loadConfig, saveConfig } from '../api';
import type { AppConfig, ModelConfig, QuestionTemplate } from '../types';
import './ConfigPage.css';

export default function ConfigPage() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'models' | 'templates' | 'hotkeys'>('models');

  useEffect(() => {
    loadConfiguration();
  }, []);

  const loadConfiguration = async () => {
    try {
      const loadedConfig = await loadConfig();
      setConfig(loadedConfig);
    } catch (error) {
      console.error('Failed to load config:', error);
      alert('Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;

    setSaving(true);
    try {
      await saveConfig(config);
      alert('Configuration saved successfully!');
    } catch (error) {
      console.error('Failed to save config:', error);
      alert('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const addModel = () => {
    if (!config) return;
    const newModel: ModelConfig = {
      name: 'New Model',
      base_url: 'https://api.openai.com/v1',
      api_key: '',
      model_name: 'gpt-3.5-turbo',
    };
    setConfig({ ...config, models: [...config.models, newModel] });
  };

  const updateModel = (index: number, field: keyof ModelConfig, value: string) => {
    if (!config) return;
    const newModels = [...config.models];
    newModels[index] = { ...newModels[index], [field]: value };
    setConfig({ ...config, models: newModels });
  };

  const removeModel = (index: number) => {
    if (!config || config.models.length <= 1) {
      alert('You must have at least one model configured');
      return;
    }
    const newModels = config.models.filter((_, i) => i !== index);
    setConfig({ ...config, models: newModels });
  };

  const addTemplate = () => {
    if (!config) return;
    const newTemplate: QuestionTemplate = {
      id: `template_${Date.now()}`,
      name: 'New Template',
      prompt: 'Your prompt here...',
    };
    setConfig({ ...config, templates: [...config.templates, newTemplate] });
  };

  const updateTemplate = (index: number, field: keyof QuestionTemplate, value: string) => {
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
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </header>

      <div className="tabs">
        <button
          className={activeTab === 'models' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('models')}
        >
          Models
        </button>
        <button
          className={activeTab === 'templates' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('templates')}
        >
          Templates
        </button>
        <button
          className={activeTab === 'hotkeys' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('hotkeys')}
        >
          Hotkeys
        </button>
      </div>

      <div className="content">
        {activeTab === 'models' && (
          <div className="models-section">
            <div className="section-header">
              <h2>Model Configuration</h2>
              <button onClick={addModel} className="add-button">Add Model</button>
            </div>

            <div className="model-select">
              <label>Selected Model:</label>
              <select
                value={config.selected_model_index}
                onChange={(e) => setConfig({ ...config, selected_model_index: Number(e.target.value) })}
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
                    <button onClick={() => removeModel(index)} className="remove-button">
                      Remove
                    </button>
                  )}
                </div>
                <div className="form-group">
                  <label>Name:</label>
                  <input
                    type="text"
                    value={model.name}
                    onChange={(e) => updateModel(index, 'name', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Base URL:</label>
                  <input
                    type="text"
                    value={model.base_url}
                    onChange={(e) => updateModel(index, 'base_url', e.target.value)}
                    placeholder="https://api.openai.com/v1"
                  />
                </div>
                <div className="form-group">
                  <label>API Key:</label>
                  <input
                    type="password"
                    value={model.api_key}
                    onChange={(e) => updateModel(index, 'api_key', e.target.value)}
                    placeholder="sk-..."
                  />
                </div>
                <div className="form-group">
                  <label>Model Name:</label>
                  <input
                    type="text"
                    value={model.model_name}
                    onChange={(e) => updateModel(index, 'model_name', e.target.value)}
                    placeholder="gpt-3.5-turbo"
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'templates' && (
          <div className="templates-section">
            <div className="section-header">
              <h2>Question Templates</h2>
              <button onClick={addTemplate} className="add-button">Add Template</button>
            </div>

            {config.templates.map((template, index) => (
              <div key={template.id} className="template-card">
                <div className="card-header">
                  <h3>{template.name || 'Unnamed Template'}</h3>
                  <button onClick={() => removeTemplate(index)} className="remove-button">
                    Remove
                  </button>
                </div>
                <div className="form-group">
                  <label>Name:</label>
                  <input
                    type="text"
                    value={template.name}
                    onChange={(e) => updateTemplate(index, 'name', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Prompt:</label>
                  <textarea
                    value={template.prompt}
                    onChange={(e) => updateTemplate(index, 'prompt', e.target.value)}
                    rows={3}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'hotkeys' && (
          <div className="hotkeys-section">
            <h2>Hotkey Configuration</h2>
            <div className="form-group">
              <label>Popup Hotkey:</label>
              <input
                type="text"
                value={config.hotkeys.popup_hotkey}
                onChange={(e) =>
                  setConfig({ ...config, hotkeys: { ...config.hotkeys, popup_hotkey: e.target.value } })
                }
                placeholder="CommandOrControl+Shift+Space"
              />
              <p className="help-text">
                Examples: CommandOrControl+Shift+Space, Alt+Q, Ctrl+Shift+A
                <br />
                Note: You need to restart the app for hotkey changes to take effect.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
