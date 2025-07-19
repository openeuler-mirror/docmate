import { DiffSegment, ChatMessage } from '@docmate/shared';

/**
 * Action执行选项的基础接口
 */
export interface ActionExecuteOptions {
  text: string;
  [key: string]: any;
}

/**
 * 扩展的Action执行选项，支持对话历史
 */
export interface ExtendedActionExecuteOptions extends ActionExecuteOptions {
  conversationHistory?: ChatMessage[];
  language?: string;
  targetLanguage?: string;
  preserveTerminology?: boolean;
  focusOn?: string;
  targetAudience?: string;
}

/**
 * Action结果的基础接口
 */
export interface BaseActionResult {
  diffs: DiffSegment[];
}

/**
 * 基础Action接口
 */
export interface IAction<T extends BaseActionResult> {
  execute(options: ActionExecuteOptions): Promise<T>;
}

/**
 * 通用Action接口，不限制返回类型
 */
export interface IGenericAction<T> {
  execute(options: ActionExecuteOptions): Promise<T>;
}

/**
 * 扩展Action接口，支持对话历史
 */
export interface IExtendedAction<T extends BaseActionResult> {
  execute(options: ExtendedActionExecuteOptions): Promise<T>;
}

/**
 * Action类型枚举
 */
export enum ActionType {
  Check = 'check',
  Polish = 'polish',
  Translate = 'translate',
  Rewrite = 'rewrite',
}

/**
 * Action执行上下文
 */
export interface ActionContext {
  userId?: string;
  sessionId?: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

/**
 * Action执行结果的包装器
 */
export interface ActionExecutionResult<T extends BaseActionResult> {
  success: boolean;
  result?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  context: ActionContext;
  executionTime: number;
}

/**
 * 抽象基础Action类
 */
export abstract class BaseAction<T extends BaseActionResult> implements IAction<T> {
  protected actionType: ActionType;

  constructor(actionType: ActionType) {
    this.actionType = actionType;
  }

  /**
   * 执行Action的抽象方法
   */
  abstract execute(options: ActionExecuteOptions): Promise<T>;

  /**
   * 验证输入参数
   */
  protected validateInput(options: ActionExecuteOptions): void {
    if (!options.text || typeof options.text !== 'string') {
      throw new Error('Text is required and must be a string');
    }

    if (options.text.trim().length === 0) {
      throw new Error('Text cannot be empty');
    }
  }

  /**
   * 创建执行上下文
   */
  protected createContext(metadata?: Record<string, any>): ActionContext {
    return {
      timestamp: Date.now(),
      metadata,
    };
  }

  /**
   * 包装执行结果
   */
  protected async executeWithContext(
    options: ActionExecuteOptions,
    metadata?: Record<string, any>
  ): Promise<ActionExecutionResult<T>> {
    const startTime = Date.now();
    const context = this.createContext(metadata);

    try {
      this.validateInput(options);
      const result = await this.execute(options);
      
      return {
        success: true,
        result,
        context,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'EXECUTION_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
          details: error,
        },
        context,
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * 获取Action类型
   */
  getActionType(): ActionType {
    return this.actionType;
  }
}
