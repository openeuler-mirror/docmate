import { useState, useEffect, useRef, useCallback } from 'react';
import { vscodeApi } from '../vscodeApi';

interface AIConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeout?: number;
  maxRetries?: number;
  testTimeout?: number;
}

interface ConfigProviderProps {
  onConfigSaved?: () => void;
  onBack: () => void;
}

// 保存状态类型
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function ConfigProvider({ onConfigSaved, onBack }: ConfigProviderProps) {
  const [config, setConfig] = useState<AIConfig>({
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-3.5-turbo',
    timeout: 60000,
    maxRetries: 3,
    testTimeout: 15000
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Partial<AIConfig>>({});
  const [showApiKey, setShowApiKey] = useState(false);
  const [testStatus, setTestStatus] = useState<{ ok?: boolean; message?: string } | null>(null);

  // 自动保存相关状态
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const initialConfigRef = useRef<AIConfig | null>(null);

  // 自动保存函数
  const autoSave = useCallback(async (configToSave: AIConfig) => {
    if (saveStatus === 'saving') return; // 防止重复保存

    setSaveStatus('saving');

    try {
      vscodeApi.postMessage({
        command: 'config',
        payload: {
          action: 'save',
          config: configToSave,
          isAutoSave: true // 标记为自动保存
        }
      });

      // 监听保存结果
      const unsubscribe = vscodeApi.onMessage((message) => {
        if (message.command === 'config' && message.result) {
          if (message.result.success) {
            setSaveStatus('saved');
            setHasUnsavedChanges(false);
            // 3秒后重置状态
            setTimeout(() => setSaveStatus('idle'), 3000);
          } else {
            setSaveStatus('error');
            // 5秒后重置状态
            setTimeout(() => setSaveStatus('idle'), 5000);
          }
          unsubscribe();
        }
      });

    } catch (error) {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 5000);
    }
  }, [saveStatus]);

  // 防抖自动保存
  const debouncedAutoSave = useCallback((configToSave: AIConfig) => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      autoSave(configToSave);
    }, 1000); // 1秒防抖
  }, [autoSave]);

  // 检查是否有未保存的更改
  const checkUnsavedChanges = useCallback((newConfig: AIConfig) => {
    if (!initialConfigRef.current) return false;

    return JSON.stringify(newConfig) !== JSON.stringify(initialConfigRef.current);
  }, []);

  // 加载现有配置
  useEffect(() => {
    vscodeApi.postMessage({
      command: 'config',
      payload: { action: 'get' }
    });

    const unsubscribe = vscodeApi.onMessage((message) => {
      if (message.command === 'config' && message.result) {
        if (message.result.config) {
          const loadedConfig = message.result.config;
          setConfig(loadedConfig);
          initialConfigRef.current = loadedConfig;
        }
        unsubscribe();
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

    // 基本的数字范围验证（HTML input已有min/max限制）
    if (config.timeout && (config.timeout < 5000 || config.timeout > 300000)) {
      errors.timeout = '超时时间范围：5-300秒' as any;
    }
    if (config.maxRetries && (config.maxRetries < 0 || config.maxRetries > 10)) {
      errors.maxRetries = '重试次数范围：0-10次' as any;
    }
    if (config.testTimeout && (config.testTimeout < 3000 || config.testTimeout > 60000)) {
      errors.testTimeout = '测试超时范围：3-60秒' as any;
    }

    return errors;
  };

  // 处理输入变化
  const handleInputChange = (field: keyof AIConfig, value: string | number) => {
    const newConfig = { ...config, [field]: value };
    setConfig(newConfig);

    // 清除对应字段的错误
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }

    // 检查是否有未保存的更改
    const hasChanges = checkUnsavedChanges(newConfig);
    setHasUnsavedChanges(hasChanges);

    // 如果有更改且配置有效，触发自动保存
    if (hasChanges) {
      const validationErrors = validateConfig(newConfig);
      if (Object.keys(validationErrors).length === 0) {
        debouncedAutoSave(newConfig);
      }
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
          config: config,
          isAutoSave: false // 标记为手动保存
        }
      });

      // 监听保存结果
      const unsubscribe = vscodeApi.onMessage((message) => {
        if (message.command === 'config' && message.result) {
          if (message.result.success) {
            onConfigSaved?.();
            onBack();
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
    setTestStatus(null);

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
          // 成功：内联提示
          setErrors({ baseUrl: '' });
          setTestStatus({ ok: true, message: message.result.message || '连接测试成功！' });
        } else {
          setErrors({ baseUrl: message.result.error || '连接测试失败' });
          setTestStatus({ ok: false, message: message.result.error || '连接测试失败' });
        }
        setIsLoading(false);
        clearTimeout(timeoutId);
        unsubscribe();
      }
    });

    // 设置超时，使用用户配置的测试超时时间
    const testTimeout = config.testTimeout || 15000;
    const timeoutId = setTimeout(() => {
      setIsLoading(false);
      setTestStatus({ ok: false, message: '连接测试超时，请检查网络或配置' });
      unsubscribe();
    }, testTimeout);
  };

  // 处理返回按钮点击
  const handleBack = async () => {
    // 如果有未保存的更改，先保存
    if (hasUnsavedChanges) {
      const validationErrors = validateConfig(config);
      if (Object.keys(validationErrors).length === 0) {
        await autoSave(config);
      }
    }

    // 清理定时器
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    onBack();
  };

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  // 获取保存状态显示文本
  const getSaveStatusText = () => {
    switch (saveStatus) {
      case 'saving':
        return '保存中...';
      case 'saved':
        return '已保存';
      case 'error':
        return '保存失败';
      default:
        return hasUnsavedChanges ? '有未保存的更改' : '';
    }
  };

  // 获取保存状态图标
  const getSaveStatusIcon = () => {
    switch (saveStatus) {
      case 'saving':
        return '⏳';
      case 'saved':
        return '✅';
      case 'error':
        return '❌';
      default:
        return hasUnsavedChanges ? '⚠️' : '';
    }
  };

  return (
    <div className="config-provider">
      <div className="config-header">
        <h2>🔧 AI服务配置</h2>
        <button className="back-button" onClick={handleBack} title="返回">
          &lt; 返回
        </button>
        <p>请配置您的AI服务信息以使用DocMate的AI功能</p>
      </div>

      <div className="config-form">
        {/* 保存状态指示器 */}
        {(saveStatus !== 'idle' || hasUnsavedChanges) && (
          <div className={`save-status ${saveStatus}`}>
            {getSaveStatusIcon()} {getSaveStatusText()}
          </div>
        )}

        {testStatus && (
          <div className={`test-status ${testStatus.ok ? 'ok' : 'fail'}`}>
            {testStatus.ok ? '✅' : '❌'} {testStatus.message}
          </div>
        )}
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
            具有Tools使用功能的AI模型名称，例如：deepseek-v3, qwen3-32B
          </small>
        </div>

        {/* 高级配置 */}
        <div className="advanced-config">
          <h3>高级配置</h3>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="timeout">请求超时 (秒)</label>
              <input
                id="timeout"
                type="number"
                min="5"
                max="300"
                value={config.timeout ? Math.floor(config.timeout / 1000) : 60}
                onChange={(e) => handleInputChange('timeout', Number(e.target.value) * 1000)}
                placeholder="60"
                className={errors.timeout ? 'error' : ''}
              />
              {errors.timeout && <span className="error-message">{errors.timeout}</span>}
              <small className="help-text">AI请求的超时时间，范围：5-300秒</small>
            </div>

            <div className="form-group">
              <label htmlFor="maxRetries">最大重试次数</label>
              <input
                id="maxRetries"
                type="number"
                min="0"
                max="10"
                value={config.maxRetries || 3}
                onChange={(e) => handleInputChange('maxRetries', Number(e.target.value))}
                placeholder="3"
                className={errors.maxRetries ? 'error' : ''}
              />
              {errors.maxRetries && <span className="error-message">{errors.maxRetries}</span>}
              <small className="help-text">请求失败时的重试次数，范围：0-10次</small>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="testTimeout">测试连接超时 (秒)</label>
            <input
              id="testTimeout"
              type="number"
              min="3"
              max="60"
              value={config.testTimeout ? Math.floor(config.testTimeout / 1000) : 15}
              onChange={(e) => handleInputChange('testTimeout', Number(e.target.value) * 1000)}
              placeholder="15"
              className={errors.testTimeout ? 'error' : ''}
            />
            {errors.testTimeout && <span className="error-message">{errors.testTimeout}</span>}
            <small className="help-text">测试连接的超时时间，范围：3-60秒</small>
          </div>
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
