// 基础命令接口
export interface BaseCommand {
  command: string;
  payload?: any;
}

// 文本来源类型
export type TextSource = 'selected' | 'full';

// UI发往Host的命令接口
export interface UICommand extends BaseCommand {
  command: 'check' | 'polish' | 'translate' | 'fullTranslate' | 'rewrite' | 'applySuggestion' | 'clearDiagnostics' | 'refresh' | 'settings' | 'auth' | 'config' | 'cancel' | 'checkRule';
  payload: {
    text?: string;
    textSource?: TextSource;
    options?: Record<string, any>;
    action?: string;
    data?: any;
    conversationHistory?: ChatMessage[];
    suggestion?: string;
    originalText?: string;
    config?: any; // 配置相关数据
    isAutoSave?: boolean; // 是否为自动保存
    checkRulePayload?: CheckRuleCommandPayload; // 检查规则管理相关载荷
  };
}

// Host发往UI的结果接口
export interface HostResult extends BaseCommand {
  command: 'renderResult' | 'error' | 'loading' | 'ready' | 'auth' | 'renderCheckResult' | 'renderPolishResult' | 'renderTranslateResult' | 'renderRewriteResult' | 'config' | 'checkRule';
  payload?: {
    type?: 'check' | 'polish' | 'translate' | 'fullTranslate' | 'rewrite';
    data?: any;
    error?: string;
    code?: string;
    suggestion?: string;
    details?: any;
    loading?: boolean;
    diffs?: Diff[];
    issues?: any[];
    changes?: any[];
    sourceLang?: string;
    targetLang?: string;
    conversationId?: string;
    conversation?: ChatMessage[];
    message?: string;
    suggestedFileName?: string;
    success?: boolean;
    checkRuleResult?: CheckRuleCommandResult; // 检查规则管理相关结果
  };
  result?: any;
}

// 检查发现的问题
export interface Issue {
  message: string;
  suggestion?: string;
  range: [number, number];
  severity: 'error' | 'warning' | 'info';
  type: 'TYPO' | 'PUNCTUATION' | 'SPACING' | 'FORMATTING' | 'STYLE' | 'CONSISTENCY' | 'HYPERLINK_ERROR' | 'TERMINOLOGY';
  original_text?: string;
  suggested_text?: string;
  // 精确的字符位置范围
  preciseRange?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
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
  operation?: 'check' | 'polish' | 'translate' | 'fullTranslate' | 'rewrite';
  results?: AIResult;
}


// 错误类型
export interface DocMateError {
  code: string;
  message: string;
  details?: any;
  timestamp: number;
}

// 错误码枚举
export enum ErrorCode {
  // 网络相关
  NETWORK_ERROR = 'NETWORK_ERROR',
  AI_SERVICE_ERROR = 'AI_SERVICE_ERROR',
  CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT',
  REQUEST_TIMEOUT = 'REQUEST_TIMEOUT',
  BACKEND_REQUEST_FAILED = 'BACKEND_REQUEST_FAILED',

  // 认证相关
  AUTH_REQUIRED = 'AUTH_REQUIRED',
  AUTH_FAILED = 'AUTH_FAILED',
  AUTH_EXPIRED = 'AUTH_EXPIRED',
  INVALID_API_KEY = 'INVALID_API_KEY',
  AUTH_CANCELLED = 'AUTH_CANCELLED',

  // 配置相关
  CONFIG_MISSING = 'CONFIG_MISSING',
  CONFIG_INVALID = 'CONFIG_INVALID',
  LOGIN_URL_FAILED = 'LOGIN_URL_FAILED',

  // 文本处理相关
  INVALID_TEXT = 'INVALID_TEXT',
  NO_ACTIVE_EDITOR = 'NO_ACTIVE_EDITOR',
  ORIGINAL_TEXT_NOT_FOUND = 'ORIGINAL_TEXT_NOT_FOUND',
  TEXT_TOO_LONG = 'TEXT_TOO_LONG',

  // 解析相关
  JSON_PARSE_ERROR = 'JSON_PARSE_ERROR',
  RESPONSE_FORMAT_ERROR = 'RESPONSE_FORMAT_ERROR',
  TOOL_CALL_PARSE_ERROR = 'TOOL_CALL_PARSE_ERROR',

  // 系统相关
  UNKNOWN_COMMAND = 'UNKNOWN_COMMAND',
  SERVICE_NOT_INITIALIZED = 'SERVICE_NOT_INITIALIZED',
  OPERATION_CANCELLED = 'OPERATION_CANCELLED',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

// 友好错误消息映射
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.NETWORK_ERROR]: '网络连接失败，请检查网络设置',
  [ErrorCode.AI_SERVICE_ERROR]: 'AI服务暂时不可用，请稍后重试',
  [ErrorCode.CONNECTION_TIMEOUT]: '连接超时，请检查网络或稍后重试',
  [ErrorCode.REQUEST_TIMEOUT]: '请求超时，请稍后重试',
  [ErrorCode.BACKEND_REQUEST_FAILED]: '后端服务请求失败，请稍后重试',
  [ErrorCode.AUTH_REQUIRED]: '需要登录才能使用此功能',
  [ErrorCode.AUTH_FAILED]: '登录失败，请检查凭据',
  [ErrorCode.AUTH_EXPIRED]: '登录已过期，请重新登录',
  [ErrorCode.INVALID_API_KEY]: 'API密钥无效，请在设置中更新',
  [ErrorCode.AUTH_CANCELLED]: '用户取消了登录操作',
  [ErrorCode.CONFIG_MISSING]: '请先在设置中配置AI服务',
  [ErrorCode.CONFIG_INVALID]: '配置信息有误，请检查设置',
  [ErrorCode.LOGIN_URL_FAILED]: '获取登录地址失败，请检查网络连接',
  [ErrorCode.INVALID_TEXT]: '请选择有效的文本内容',
  [ErrorCode.NO_ACTIVE_EDITOR]: '请先打开一个文档',
  [ErrorCode.ORIGINAL_TEXT_NOT_FOUND]: '无法找到原文，请重新选择文本',
  [ErrorCode.TEXT_TOO_LONG]: '文本过长，请分段处理',
  [ErrorCode.JSON_PARSE_ERROR]: 'AI响应格式错误，请重试',
  [ErrorCode.RESPONSE_FORMAT_ERROR]: 'AI响应格式不正确',
  [ErrorCode.TOOL_CALL_PARSE_ERROR]: 'AI工具调用参数解析失败',
  [ErrorCode.UNKNOWN_COMMAND]: '未知命令',
  [ErrorCode.SERVICE_NOT_INITIALIZED]: '服务未初始化',
  [ErrorCode.OPERATION_CANCELLED]: '操作已取消',
  [ErrorCode.UNKNOWN_ERROR]: '发生未知错误，请重试'
};

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

// ===== v1.5 新增类型定义 =====

/**
 * 表示文本差异的片段。
 * 'equal': 表示该部分文本在原始内容和修改后内容中没有变化。
 * 'insert': 表示该部分文本是新增的。
 * 'delete': 表示该部分文本已被删除。
 */
export interface Diff {
  type: 'equal' | 'insert' | 'delete';
  value: string;
}

/**
 * AI 服务返回的标准化响应结构。
 */
export interface AIResponse {
  success: boolean;
  content: string;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * 定义了所有可执行操作的类型。
 */
export enum ActionType {
  Check = 'check',
  Polish = 'polish',
  Translate = 'translate',
  Rewrite = 'rewrite',
}

/**
 * AI 操作的统一结果模型
 */
export interface AIResult {
  type: 'check' | 'polish' | 'rewrite' | 'translate';
  originalText: string;
  modifiedText: string;
  diffs: Diff[];
  issues?: Issue[];
  changes?: Array<{
    type: 'wording' | 'grammar' | 'style' | 'clarity' | 'flow' | 'structure' | 'tone' | 'content' | 'formatting' | 'terminology';
    original: string;
    improved?: string;
    rewritten?: string;
    reason: string;
    description?: string;
  }>;
  summary?: string;
  explanation?: string;
  sourceLang?: string;
  targetLang?: string;
  // 可选：用于翻译结果的术语对照
  terminology?: Array<{
    original: string;
    translated: string;
    note?: string;
  }>;
  // 是否已处理（接受/拒绝）用于持久化隐藏 Diff
  dismissed?: boolean;
  // 可选：处理时间（毫秒）
  processingTime?: number;
  // 可选：信心度
  confidence?: number;
}

/**
 * 对话历史中的单条消息。
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

// ===== 新增类型定义 =====

/**
 * 文本块结构 (Chunker产出)
 * 包含唯一ID、核心文本、上下文和精确位置信息
 */
export interface TextChunk {
  id: string; // 唯一ID
  core_text: string; // 核心文本
  context_before?: string; // 上文
  context_after?: string; // 下文
  range: {
    // 在文档中的绝对位置
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

/**
 * LLM 请求体 - 结构化的检查请求
 */
export interface CheckRequestPayload {
  chunks: TextChunk[];
}

/**
 * 单个chunk检查请求负载（用于并行处理）
 */
export interface SingleChunkRequestPayload {
  chunk: TextChunk;
}

/**
 * LLM 响应体中的建议结构
 * 必须包含chunk_id用于精确关联
 */
export interface Suggestion {
  chunk_id: string; // 必须返回的关联ID
  type: string; // 问题类型
  description: string; // 问题描述
  original_text: string; // 原始错误文本
  suggested_text: string; // 建议修改文本
  severity: 'error' | 'warning' | 'info';
}

/**
 * LLM 完整响应体
 */
export interface CheckResultPayload {
  suggestions: Suggestion[];
}

/**
 * 诊断信息 - 用于VS Code渲染
 * 包含完整的诊断信息和精确位置
 */
export interface DiagnosticInfo {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  message: string;
  severity: 'error' | 'warning' | 'info';
  source: string;
  code?: string;
  original_text: string;
  suggested_text: string;
  suggestion_type: string;
}

/**
 * 自定义检查规则
 */
export interface CheckRule {
  id: string;                    // 唯一标识符 (例如: 'TYPO-001')
  name: string;                  // 规则名称 (例如: '中文错别字检查')
  type: 'TYPO' | 'PUNCTUATION' | 'SPACING' | 'FORMATTING' | 'STYLE' | 'HYPERLINK_ERROR' | 'TERMINOLOGY'; // 规则类型
  description: string;           // 规则的详细描述
  content: string;               // 规则的具体内容，将用于生成Prompt
  enabled: boolean;              // 规则是否启用
  isDefault: boolean;            // 是否为默认规则
  createdAt?: string;            // 创建时间
  updatedAt?: string;            // 更新时间
}

/**
 * 检查规则管理相关的命令载荷
 */
export interface CheckRuleCommandPayload {
  action: 'getAll' | 'update' | 'create' | 'delete';
  rules?: Partial<CheckRule>[];
  ruleIds?: string[];
}

/**
 * 检查规则管理相关的结果
 */
export interface CheckRuleCommandResult {
  action: 'getAll' | 'update' | 'create' | 'delete';
  success: boolean;
  rules?: CheckRule[];
  error?: string;
  message?: string;
}

