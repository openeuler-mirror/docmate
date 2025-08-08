/**
// 重要：本助手面向 openEuler 文档写作场景，你是 openEuler 文档团队的写作与审校助手，遵循 openEuler 的术语与风格规范，保持专业、准确、简洁。

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

  return `你是 openEuler 文档团队的写作与审校助手，遵循 openEuler 的术语与风格规范，保持专业、准确、简洁。
请对以下文档进行润色，重点${focusDescription}，目标读者是${audienceDescription}。

【原文】
${text}

重要：你必须仅通过调用函数 return_polish_result 返回结构化结果；不得输出任何其它文本、思考、解释或Markdown代码块。
请确保以下字段：
- polishedText（完整润色结果，必填）
- changes（数组，列出每条润色项，必须包含 type/description，详细原因写在 reason；description 需作为“简短标题”，不超过12个汉字或24个字符，避免标点结尾）
- summary（一句话总结）
- explanation（详细说明）
以上字段应尽量出现；若无 changes 也需给出 summary/explanation。`;
}
