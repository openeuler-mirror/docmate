/**
 * 文本润色相关的Prompt模板
 */

/**
 * 润色重点描述映射
 */
const FOCUS_DESCRIPTIONS = {
  clarity: '提高表达的清晰度和准确性',
  conciseness: '使表达更加简洁明了',
  tone: '调整语调和表达方式',
  structure: '优化文档结构和逻辑',
  all: '全面提升文档质量'
} as const;

/**
 * 目标读者描述映射
 */
const AUDIENCE_DESCRIPTIONS = {
  technical: '技术人员',
  general: '一般用户',
  beginner: '初学者',
  expert: '专家用户'
} as const;

/**
 * 构建文本润色提示词
 */
export function buildPolishPrompt(
  text: string,
  focusOn: keyof typeof FOCUS_DESCRIPTIONS = 'all',
  targetAudience: keyof typeof AUDIENCE_DESCRIPTIONS = 'technical'
): string {
  const focusDescription = FOCUS_DESCRIPTIONS[focusOn] || FOCUS_DESCRIPTIONS.all;
  const audienceDescription = AUDIENCE_DESCRIPTIONS[targetAudience] || AUDIENCE_DESCRIPTIONS.technical;

  return `你是一个专业的技术文档润色专家。请对以下文档进行润色，重点${focusDescription}，目标读者是${audienceDescription}。

**重要要求**：
1. 必须保持原文的核心意思和所有重要信息
2. 保持技术术语的准确性，不要随意更改专业术语
3. 只进行必要的改进，不要过度修改
4. 确保润色后的文本更加清晰、简洁、专业

**原文**：
${text}

**润色标准**：
- 语言表达：使用准确、简洁的表达方式
- 逻辑结构：确保段落和句子之间的逻辑清晰
- 专业性：保持技术文档的专业风格
- 可读性：提升文档的易读性和理解性

**输出格式**：请严格按照以下JSON格式返回，不要添加任何其他内容：

\`\`\`json
{
  "polishedText": "润色后的完整文本（必须包含所有原文信息）",
  "changes": [
    {
      "type": "clarity|conciseness|tone|structure|grammar",
      "description": "具体修改说明",
      "originalText": "被修改的原文片段",
      "polishedText": "修改后的片段",
      "reason": "修改的具体原因"
    }
  ]
}
\`\`\`

请确保：
1. polishedText包含完整的润色后文本
2. changes数组包含所有重要的修改说明
3. 只返回JSON格式，不要包含其他解释文字`;
}

/**
 * 构建清晰度润色提示词
 */
export function buildClarityPolishPrompt(text: string): string {
  return `请重点提高以下技术文档的清晰度：

原文：
${text}

要求：
1. 简化复杂的表达
2. 明确模糊的描述
3. 优化句子结构
4. 保持技术准确性

请按照以下JSON格式返回润色结果：

{
  "polishedText": "润色后的完整文本",
  "improvements": [
    {
      "type": "clarity",
      "description": "清晰度改进说明",
      "before": "原始表达",
      "after": "改进后表达"
    }
  ]
}

只返回JSON格式，不要包含其他文字。`;
}
