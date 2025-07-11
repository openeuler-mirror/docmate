// 基础命令接口
export interface BaseCommand {
  command: string;
  payload?: any;
}

// UI发往Host的命令接口
export interface UICommand extends BaseCommand {
  command: 'check' | 'polish' | 'translate' | 'refresh' | 'settings';
  payload: {
    text?: string;
    options?: Record<string, any>;
  };
}

// Host发往UI的结果接口
export interface HostResult extends BaseCommand {
  command: 'renderResult' | 'error' | 'loading' | 'ready';
  payload: {
    type?: 'check' | 'polish' | 'translate';
    data?: any;
    error?: string;
    loading?: boolean;
  };
}

// 检查结果项
export interface CheckResultItem {
  id: string;
  type: 'terminology' | 'grammar' | 'style' | 'consistency';
  severity: 'error' | 'warning' | 'info';
  message: string;
  suggestion?: string;
  range: {
    start: number;
    end: number;
  };
  originalText: string;
  suggestedText?: string;
  confidence?: number;
  source?: string; // 来源：术语库、语法规则等
}

// 润色结果项
export interface PolishResultItem {
  id: string;
  type: 'clarity' | 'conciseness' | 'tone' | 'structure';
  originalText: string;
  polishedText: string;
  explanation: string;
  confidence: number;
  range: {
    start: number;
    end: number;
  };
}

// 翻译结果项
export interface TranslateResultItem {
  id: string;
  originalText: string;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  confidence: number;
  alternatives?: string[];
  range: {
    start: number;
    end: number;
  };
}

// AI服务配置
export interface AIServiceConfig {
  apiKey: string;
  endpoint: string;
  model?: string;
  timeout?: number;
  maxRetries?: number;
}

// 术语库条目
export interface TerminologyEntry {
  id: string;
  term: string;
  definition: string;
  category: string;
  aliases?: string[];
  deprecated?: boolean;
  preferredTerm?: string;
  context?: string;
  examples?: string[];
}

// 术语库
export interface TerminologyDatabase {
  version: string;
  lastUpdated: string;
  entries: TerminologyEntry[];
}

// 用户设置
export interface UserSettings {
  aiService: AIServiceConfig;
  terminology: {
    autoCheck: boolean;
    strictMode: boolean;
    customDictionary: string[];
  };
  ui: {
    theme: 'light' | 'dark' | 'auto';
    language: string;
    showConfidence: boolean;
  };
  features: {
    enableCheck: boolean;
    enablePolish: boolean;
    enableTranslate: boolean;
  };
}

// 消息类型
export type MessageType = UICommand | HostResult;

// 操作状态
export interface OperationState {
  isLoading: boolean;
  error?: string;
  lastOperation?: string;
  timestamp?: number;
}

// 对话历史项
export interface ConversationItem {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: number;
  operation?: 'check' | 'polish' | 'translate';
  results?: CheckResultItem[] | PolishResultItem[] | TranslateResultItem[];
}

// 统计信息
export interface Statistics {
  totalChecks: number;
  totalPolishes: number;
  totalTranslations: number;
  issuesFound: number;
  issuesFixed: number;
  lastUsed: number;
}

// 错误类型
export interface DocMateError {
  code: string;
  message: string;
  details?: any;
  timestamp: number;
}

// 常量
export const COMMANDS = {
  CHECK: 'check',
  POLISH: 'polish',
  TRANSLATE: 'translate',
  REFRESH: 'refresh',
  SETTINGS: 'settings',
} as const;

export const RESULT_TYPES = {
  RENDER_RESULT: 'renderResult',
  ERROR: 'error',
  LOADING: 'loading',
  READY: 'ready',
} as const;

export const SEVERITY_LEVELS = {
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
} as const;

export const LANGUAGES = {
  ZH_CN: 'zh-CN',
  EN_US: 'en-US',
} as const;
