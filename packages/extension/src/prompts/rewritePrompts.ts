/**
 * 改写相关的Prompt模板
 */

/**
 * 构建改写提示词
 */
export function buildRewritePrompt(
  originalText: string,
  userInstruction: string,
  preserveTerminology: boolean = true
): string {
  const terminologyNote = preserveTerminology 
    ? '\n\n特别注意：请保持技术术语的准确性，不要随意更改专业术语。' 
    : '';
  
  return `你是一个专业的文档改写助手。你的任务是根据用户的指令对文本进行改写。

改写要求：
1. 保持原文的核心意思和重要信息
2. 根据用户的具体指令进行调整
3. 确保改写后的文本流畅、准确、易读
4. 如果用户没有特殊要求，保持原文的格式和结构
5. 对于技术文档，保持专业术语的准确性${terminologyNote}

当前需要改写的原文：
${originalText}

用户指令：${userInstruction}

请按照以下JSON格式返回改写结果：

\`\`\`json
{
  "rewrittenText": "改写后的完整文本",
  "changes": [
    {
      "type": "content|structure|style|tone",
      "description": "具体修改说明",
      "originalText": "被修改的原文片段",
      "rewrittenText": "改写后的片段",
      "reason": "改写的具体原因"
    }
  ],
  "summary": "整体改写效果总结",
  "explanation": "详细的改写说明和思路",
  "suggestions": "进一步优化建议"
}
\`\`\`

重要要求：
1. rewrittenText必须包含完整的改写后文本
2. changes数组必须包含所有重要的修改点
3. 每个change都要有清晰的description和reason
4. summary要简洁地总结改写效果
5. explanation要详细说明改写思路
6. 只返回JSON格式，不要包含其他解释文字`;
}

/**
 * 构建风格改写提示词
 */
export function buildStyleRewritePrompt(text: string, requirements: string): string {
  return `请根据以下要求改写文本：

原文：
${text}

改写要求：${requirements}

请按照以下JSON格式返回改写结果：

{
  "rewrittenText": "改写后的完整文本",
  "styleChanges": [
    {
      "aspect": "改写方面",
      "description": "具体改动说明",
      "before": "改写前",
      "after": "改写后"
    }
  ]
}

只返回JSON格式，不要包含其他文字。`;
}

/**
 * 构建对话式改写提示词（用于聊天功能）
 */
export function buildConversationalRewritePrompt(
  originalText: string,
  userInstruction: string,
  conversationContext: string = ''
): string {
  const contextSection = conversationContext 
    ? `\n对话上下文：\n${conversationContext}\n` 
    : '';
  
  return `你是一个专业的文档改写助手，正在与用户进行对话式的文档改写。${contextSection}

当前需要改写的文本：
${originalText}

用户的改写指令：${userInstruction}

请根据用户的指令和对话上下文，对文本进行改写。改写时请：
1. 理解用户的真实意图
2. 保持文档的专业性
3. 确保改写后的文本符合用户的期望
4. 如果指令不够明确，可以在回复中说明你的理解

请按照以下JSON格式返回改写结果：

{
  "rewrittenText": "改写后的完整文本",
  "explanation": "改写说明和你的理解",
  "changes": [
    {
      "type": "content|structure|style|tone",
      "description": "修改说明",
      "originalText": "原文片段",
      "rewrittenText": "改写后片段",
      "reason": "改写原因"
    }
  ],
  "suggestions": "进一步改进建议（如果有）"
}

只返回JSON格式，不要包含其他文字。`;
}
