/**
 * DocMate Prompt 管理系统
 * 统一管理所有AI功能的提示词模板
 */

export interface PromptOptions {
  [key: string]: any;
}

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  template: string;
  variables: string[];
  category: 'check' | 'polish' | 'translate' | 'rewrite' | 'system';
}

/**
 * 系统级提示词
 */
export const SYSTEM_PROMPTS = {
  TECHNICAL_WRITER: `你是一个专业的技术文档写作助手。你的任务是帮助用户改进技术文档的质量。

核心原则：
1. 保持技术准确性和专业性
2. 确保内容清晰易懂
3. 遵循技术文档写作规范
4. 保持术语的一致性
5. 注重文档的结构和逻辑

请根据用户的具体需求提供专业的建议和修改。`,

  OPENEULER_EXPERT: `你是openEuler技术文档专家。请特别注意：

术语规范：
- 使用"openEuler"而不是"OpenEuler"或"Open Euler"
- 保持技术术语的准确性和一致性
- 遵循openEuler官方文档规范

文档标准：
- 确保技术描述准确无误
- 保持专业的技术写作风格
- 注重用户体验和可读性`,
};

/**
 * 检查功能提示词
 */
export const CHECK_PROMPTS = {
  COMPREHENSIVE_CHECK: `请对以下技术文档进行{strictnessLevel}级别的全面检查，重点关注：{checkTypes}。

文档内容：
"""
{text}
"""

检查要求：
1. 语法和拼写错误
2. 术语使用规范（特别是openEuler相关术语）
3. 表达清晰度和准确性
4. 内容逻辑一致性
5. 技术描述的准确性

请以JSON格式返回检查结果，包含修改建议：
{
  "correctedText": "修正后的完整文本",
  "issues": [
    {
      "type": "grammar|terminology|style|consistency",
      "severity": "error|warning|info",
      "message": "问题描述",
      "suggestion": "修改建议",
      "start": 起始位置,
      "end": 结束位置,
      "originalText": "原文本",
      "suggestedText": "建议文本",
      "confidence": 0.0-1.0
    }
  ]
}

注意：
1. 只返回JSON格式，不要包含其他文字
2. correctedText字段必须包含修正后的完整文本
3. 位置索引从0开始
4. 置信度范围0.0-1.0`,

  TERMINOLOGY_CHECK: `请检查以下文本中的术语使用是否规范，特别关注openEuler相关术语：

文本：
"""
{text}
"""

检查重点：
1. openEuler术语的正确拼写和大小写
2. 技术术语的一致性
3. 专业术语的准确性

请返回检查结果和修正建议。`,
};

/**
 * 润色功能提示词
 */
export const POLISH_PROMPTS = {
  COMPREHENSIVE_POLISH: `请对以下技术文档进行全面润色，重点{focusDescription}，目标读者是{audienceDescription}。

{preserveTerminologyNote}

原文：
"""
{text}
"""

润色要求：
1. 提高表达的清晰度和准确性
2. 优化文档结构和逻辑
3. 确保技术描述准确无误
4. 保持专业的技术写作风格
5. 提升可读性和用户体验

请直接返回润色后的完整文本，不要包含解释或其他内容。`,

  CLARITY_FOCUS: `请重点提高以下技术文档的清晰度：

原文：
"""
{text}
"""

要求：
1. 简化复杂的表达
2. 明确模糊的描述
3. 优化句子结构
4. 保持技术准确性

请返回润色后的文本。`,

  CONCISENESS_FOCUS: `请使以下技术文档更加简洁明了：

原文：
"""
{text}
"""

要求：
1. 删除冗余表达
2. 合并重复内容
3. 精简长句
4. 保持核心信息完整

请返回润色后的文本。`,
};

/**
 * 翻译功能提示词
 */
export const TRANSLATE_PROMPTS = {
  TECHNICAL_TRANSLATION: `请将以下技术文档从{sourceLanguage}翻译为{targetLanguage}。

{contextSection}
原文：
"""
{text}
"""

翻译要求：
1. 保持技术文档的专业性和准确性
2. {preserveTerminologyNote}
3. 确保翻译自然流畅
4. 保持原文的格式和结构
5. 适应目标语言的表达习惯

请直接返回翻译后的完整文本，不要包含解释或其他内容。`,

  FULL_DOCUMENT_TRANSLATION: `请将以下完整的技术文档翻译为{targetLanguage}：

原文档：
"""
{text}
"""

翻译要求：
1. 完整翻译所有内容
2. 保持文档结构和格式
3. 确保技术术语准确
4. 保持专业性和可读性
5. 适合{targetLanguage}读者阅读

请返回完整的翻译文档。`,
};

/**
 * 改写功能提示词
 */
export const REWRITE_PROMPTS = {
  CONVERSATIONAL_REWRITE: `你是一个专业的文档改写助手。你的任务是根据用户的指令对文本进行改写。

改写要求：
1. 保持原文的核心意思和重要信息
2. 根据用户的具体指令进行调整
3. 确保改写后的文本流畅、准确、易读
4. 如果用户没有特殊要求，保持原文的格式和结构
5. 对于技术文档，保持专业术语的准确性

{preserveTerminologyNote}

当前需要改写的原文：
"""
{originalText}
"""

用户指令：{userInstruction}

请根据用户指令改写上述文本，直接返回改写后的文本，不要包含解释。`,

  STYLE_REWRITE: `请根据以下要求改写文本：

原文：
"""
{text}
"""

改写要求：{requirements}

请返回改写后的文本。`,
};

/**
 * Prompt 构建器类
 */
export class PromptBuilder {
  /**
   * 构建检查提示词
   */
  static buildCheckPrompt(text: string, options: {
    checkTypes?: string[];
    strictMode?: boolean;
  } = {}): string {
    const checkTypes = options.checkTypes || ['语法错误', '术语规范', '表达清晰度'];
    const strictnessLevel = options.strictMode ? '严格' : '标准';

    return CHECK_PROMPTS.COMPREHENSIVE_CHECK
      .replace('{text}', text)
      .replace('{checkTypes}', checkTypes.join('、'))
      .replace('{strictnessLevel}', strictnessLevel);
  }

  /**
   * 构建润色提示词
   */
  static buildPolishPrompt(text: string, options: {
    focusOn?: 'clarity' | 'conciseness' | 'tone' | 'structure' | 'all';
    targetAudience?: 'technical' | 'general' | 'beginner' | 'expert';
    preserveTerminology?: boolean;
  } = {}): string {
    const focusArea = options.focusOn || 'all';
    const audience = options.targetAudience || 'technical';
    const preserveTerms = options.preserveTerminology !== false;

    let focusDescription = '';
    switch (focusArea) {
      case 'clarity':
        focusDescription = '提高表达的清晰度和准确性';
        break;
      case 'conciseness':
        focusDescription = '使表达更加简洁明了';
        break;
      case 'tone':
        focusDescription = '调整语调和表达方式';
        break;
      case 'structure':
        focusDescription = '优化文档结构和逻辑';
        break;
      default:
        focusDescription = '全面提升文档质量';
    }

    let audienceDescription = '';
    switch (audience) {
      case 'technical':
        audienceDescription = '技术人员';
        break;
      case 'general':
        audienceDescription = '一般用户';
        break;
      case 'beginner':
        audienceDescription = '初学者';
        break;
      case 'expert':
        audienceDescription = '专家用户';
        break;
    }

    const preserveTerminologyNote = preserveTerms 
      ? '注意：请保持技术术语的准确性，不要随意更改专业术语。'
      : '';

    return POLISH_PROMPTS.COMPREHENSIVE_POLISH
      .replace('{text}', text)
      .replace('{focusDescription}', focusDescription)
      .replace('{audienceDescription}', audienceDescription)
      .replace('{preserveTerminologyNote}', preserveTerminologyNote);
  }

  /**
   * 构建翻译提示词
   */
  static buildTranslatePrompt(text: string, options: {
    sourceLanguage?: string;
    targetLanguage: string;
    preserveTerminology?: boolean;
    context?: string;
  }): string {
    const sourceLanguage = options.sourceLanguage || 'auto-detect';
    const targetLanguage = this.getLanguageName(options.targetLanguage);
    const preserveTerms = options.preserveTerminology !== false;
    const context = options.context || '';

    let contextSection = '';
    if (context) {
      contextSection = `\n上下文信息：${context}\n`;
    }

    const preserveTerminologyNote = preserveTerms 
      ? '保持技术术语不变' 
      : '可以适当本地化专业术语';

    return TRANSLATE_PROMPTS.TECHNICAL_TRANSLATION
      .replace('{text}', text)
      .replace('{sourceLanguage}', sourceLanguage === 'auto-detect' ? '源语言' : this.getLanguageName(sourceLanguage))
      .replace('{targetLanguage}', targetLanguage)
      .replace('{contextSection}', contextSection)
      .replace('{preserveTerminologyNote}', preserveTerminologyNote);
  }

  /**
   * 构建改写提示词
   */
  static buildRewritePrompt(originalText: string, userInstruction: string, options: {
    preserveTerminology?: boolean;
  } = {}): string {
    const preserveTerminologyNote = options.preserveTerminology 
      ? '\n\n特别注意：请保持技术术语的准确性，不要随意更改专业术语。'
      : '';

    return REWRITE_PROMPTS.CONVERSATIONAL_REWRITE
      .replace('{originalText}', originalText)
      .replace('{userInstruction}', userInstruction)
      .replace('{preserveTerminologyNote}', preserveTerminologyNote);
  }

  /**
   * 获取语言名称
   */
  private static getLanguageName(languageCode: string): string {
    const languageMap: Record<string, string> = {
      'zh-CN': '中文',
      'zh': '中文',
      'en-US': '英文',
      'en': '英文',
      'ja': '日文',
      'ko': '韩文',
      'fr': '法文',
      'de': '德文',
      'es': '西班牙文',
      'ru': '俄文',
    };

    return languageMap[languageCode] || languageCode;
  }
}

/**
 * 导出所有提示词模板
 */
export const ALL_PROMPTS = {
  SYSTEM: SYSTEM_PROMPTS,
  CHECK: CHECK_PROMPTS,
  POLISH: POLISH_PROMPTS,
  TRANSLATE: TRANSLATE_PROMPTS,
  REWRITE: REWRITE_PROMPTS,
};
