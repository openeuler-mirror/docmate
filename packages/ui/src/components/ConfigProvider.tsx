import { useState, useEffect } from 'react';
import { vscodeApi } from '../vscodeApi';

interface AIConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

interface ConfigProviderProps {
  onConfigSaved?: () => void;
}

export function ConfigProvider({ onConfigSaved }: ConfigProviderProps) {
  const [config, setConfig] = useState<AIConfig>({
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-3.5-turbo'
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Partial<AIConfig>>({});
  const [showApiKey, setShowApiKey] = useState(false);

  // 加载现有配置
  useEffect(() => {
    vscodeApi.postMessage({
      command: 'config',
      payload: { action: 'get' }
    });

    const unsubscribe = vscodeApi.onMessage((message) => {
      if (message.command === 'config' && message.result) {
        if (message.result.config) {
          setConfig(message.result.config);
        }
      }
    });

    return unsubscribe;
  }, []);

  // 验证配置
  const validateConfig = (config: AIConfig): Partial<AIConfig> => {
    const errors: Partial<AIConfig> = {};

    if (!config.baseUrl.trim()) {
      errors.baseUrl = '基础URL不能为空';
    } else {
      try {
        new URL(config.baseUrl);
      } catch {
        errors.baseUrl = '请输入有效的URL';
      }
    }

    if (!config.apiKey.trim()) {
      errors.apiKey = 'API密钥不能为空';
    }

    if (!config.model.trim()) {
      errors.model = '模型名称不能为空';
    }

    return errors;
  };

  // 处理输入变化
  const handleInputChange = (field: keyof AIConfig, value: string) => {
    setConfig(prev => ({ ...prev, [field]: value }));
    
    // 清除对应字段的错误
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  // 保存配置
  const handleSave = async () => {
    const validationErrors = validateConfig(config);
    
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      vscodeApi.postMessage({
        command: 'config',
        payload: { 
          action: 'save',
          config: config
        }
      });

      // 监听保存结果
      const unsubscribe = vscodeApi.onMessage((message) => {
        if (message.command === 'config' && message.result) {
          if (message.result.success) {
            onConfigSaved?.();
          } else if (message.result.error) {
            setErrors({ baseUrl: message.result.error });
          }
          setIsLoading(false);
          unsubscribe();
        }
      });

    } catch (error) {
      setErrors({ baseUrl: '保存配置失败，请重试' });
      setIsLoading(false);
    }
  };

  // 测试连接
  const handleTestConnection = () => {
    const validationErrors = validateConfig(config);

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsLoading(true);
    setErrors({});

    vscodeApi.postMessage({
      command: 'config',
      payload: {
        action: 'test',
        config: config
      }
    });

    // 监听测试结果
    const unsubscribe = vscodeApi.onMessage((message) => {
      if (message.command === 'config' && message.result && message.result.action === 'test') {
        if (message.result.success) {
          // 显示成功消息
          setErrors({ baseUrl: '' }); // 清除错误
          alert('连接测试成功！');
        } else {
          setErrors({ baseUrl: message.result.error || '连接测试失败' });
        }
        setIsLoading(false);
        unsubscribe();
      }
    });

    // 设置超时
    setTimeout(() => {
      setIsLoading(false);
      unsubscribe();
    }, 10000);
  };

  return (
    <div className="config-provider">
      <div className="config-header">
        <h2>🔧 AI服务配置</h2>
        <p>请配置您的AI服务信息以使用DocMate的AI功能</p>
      </div>

      <div className="config-form">
        <div className="form-group">
          <label htmlFor="baseUrl">基础URL</label>
          <input
            id="baseUrl"
            type="text"
            value={config.baseUrl}
            onChange={(e) => handleInputChange('baseUrl', e.target.value)}
            placeholder="https://api.openai.com/v1"
            className={errors.baseUrl ? 'error' : ''}
          />
          {errors.baseUrl && <span className="error-message">{errors.baseUrl}</span>}
          <small className="help-text">
            OpenAI兼容的API基础URL，例如：https://api.openai.com/v1
          </small>
        </div>

        <div className="form-group">
          <label htmlFor="apiKey">API密钥</label>
          <div className="api-key-input">
            <input
              id="apiKey"
              type={showApiKey ? 'text' : 'password'}
              value={config.apiKey}
              onChange={(e) => handleInputChange('apiKey', e.target.value)}
              placeholder="sk-..."
              className={errors.apiKey ? 'error' : ''}
            />
            <button
              type="button"
              className="toggle-visibility"
              onClick={() => setShowApiKey(!showApiKey)}
              title={showApiKey ? '隐藏密钥' : '显示密钥'}
            >
              {showApiKey ? '👁️' : '👁️‍🗨️'}
            </button>
          </div>
          {errors.apiKey && <span className="error-message">{errors.apiKey}</span>}
          <small className="help-text">
            您的AI服务API密钥，将安全存储在本地
          </small>
        </div>

        <div className="form-group">
          <label htmlFor="model">模型名称</label>
          <input
            id="model"
            type="text"
            value={config.model}
            onChange={(e) => handleInputChange('model', e.target.value)}
            placeholder="gpt-3.5-turbo"
            className={errors.model ? 'error' : ''}
          />
          {errors.model && <span className="error-message">{errors.model}</span>}
          <small className="help-text">
            要使用的AI模型名称，例如：gpt-3.5-turbo, gpt-4
          </small>
        </div>

        <div className="form-actions">
          <button
            type="button"
            onClick={handleTestConnection}
            className="test-button"
            disabled={isLoading}
          >
            🔍 测试连接
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="save-button"
            disabled={isLoading}
          >
            {isLoading ? '保存中...' : '💾 保存配置'}
          </button>
        </div>
      </div>

      <div className="config-help">
        <h3>💡 配置说明</h3>
        <ul>
          <li>支持OpenAI官方API和兼容的第三方服务</li>
          <li>配置信息将安全存储在本地，不会上传到云端</li>
          <li>建议先使用"测试连接"验证配置是否正确</li>
          <li>配置完成后即可使用所有AI功能</li>
        </ul>
      </div>
    </div>
  );
}
