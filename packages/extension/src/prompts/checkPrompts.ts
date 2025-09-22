/**
 * 文本检查相关的Prompt模板
 */

import { SingleChunkRequestPayload, CheckRule } from '@docmate/shared';

/**
 * 构建文本检查提示词 - 结构化版本
 * 支持分块处理和精确位置映射，使用tools调用确保JSON稳定性
 */
export function buildSingleChunkPrompt(payload: SingleChunkRequestPayload, checkRules?: CheckRule[]): string {

  const { chunk } = payload;

  // 如果没有提供规则，使用默认规则（向后兼容）
  const rules = checkRules || getDefaultCheckRules();

  // 只使用启用的规则
  const enabledRules = rules.filter(rule => rule.enabled);

  // 动态构建检查规则部分，清理规则内容防止格式破坏
  const rulesSection = enabledRules.map((rule, index) => {
    const cleanContent = rule.content
      .replace(/<|>/g, '') // 移除 HTML/XML 标签，防止注入
      .replace(/\\n/g, ' ') // 将换行符替换为空格
      .replace(/\s{2,}/g, ' ') // 将多个连续空格压缩为一个
      .trim();

    return `**${index + 1}. ${rule.name} (${rule.type})**\n${cleanContent}`;
  }).join('\n\n');

  return `你是openEuler文档审校专家。请检查核心文本中的问题，必须使用 return_chunk_check_result 函数返回结果。

**重要要求**:
- 只检查"核心文本"，上下文仅作参考
- 每个问题必须提供精确的 original_text 和 suggested_text
- 仅标记实际存在的问题，不要产生"幻觉"
- 必须通过调用 return_chunk_check_result 函数返回结果，不要直接输出JSON

**检查规则 (必须严格遵守)**:

${rulesSection}

**函数调用说明**:
你必须调用 return_chunk_check_result 函数，参数如下：
- chunk_id: 必须精确设置为 "${chunk.id}"
- suggestions: 问题建议数组，每个建议包含：
  - chunk_id: 必须设置为 "${chunk.id}"（与父级相同）
  - type: 问题类型（${enabledRules.map(r => r.type).join('/')})
  - description: 简短问题标题
  - original_text: 核心文本中的错误部分
  - suggested_text: 修改后的正确文本
  - severity: 严重程度（error/warning/info）

**文档内容**:
以下部分会提供核心文本和上下文，只需要检查核心文本，上下文仅供参考！
**核心文本**:
${chunk.core_text}
${chunk.context_before ? `**上文**:
${chunk.context_before}` : ''}
${chunk.context_after ? `**下文**:
${chunk.context_after}` : ''}
`;
}

/**
 * 获取默认检查规则（用于向后兼容）
 */
function getDefaultCheckRules(): CheckRule[] {
  return [
    {
      id: 'TYPO-001',
      name: '中文错别字检查',
      type: 'TYPO',
      description: '找出并修正中文错别字，包括同音字、形近字错误',
      content: '找出并修正中文错别字，包括同音字（如"部署"错为"布署"）、形近字（如"阈值"错为"阀值"），识别多余或缺失的文字。',
      enabled: true,
      isDefault: true
    },
    {
      id: 'PUNCTUATION-001',
      name: '标点符号规范',
      type: 'PUNCTUATION',
      description: '检查标点符号使用规范，确保中英文标点正确使用',
      content: '纯英文内容中不应出现中文标点符号。顿号"、"仅用于句子内部的并列词语之间。',
      enabled: true,
      isDefault: true
    },
    {
      id: 'SPACING-001',
      name: '空格规范',
      type: 'SPACING',
      description: '检查中英文夹杂时的空格使用规范',
      content: '中英文夹杂时必须有且仅有一个半角空格。英文标点符号后应有半角空格，前面不能有空格。',
      enabled: true,
      isDefault: true
    },
    {
      id: 'FORMATTING-001',
      name: '格式规范',
      type: 'FORMATTING',
      description: '检查代码格式、文件名等格式要求',
      content: '行内代码、命令行和文件名需要用反引号 (`) 包裹，只有确认要包裹的再添加，不用特别严格，且```代码块内的命令不用管。代码块注释符号必须正确。',
      enabled: true,
      isDefault: true
    },
    {
      id: 'STYLE-001',
      name: '风格一致性',
      type: 'STYLE',
      description: '检查文档风格的一致性，包括标点、格式等',
      content: '同级别内容的结尾标点应保持一致。描述功能键或UI元素的格式应在全文中保持一致。行间距应保持一致。',
      enabled: true,
      isDefault: true
    },
    {
      id: 'HYPERLINK_ERROR-001',
      name: '超链接检查',
      type: 'HYPERLINK_ERROR',
      description: '检查超链接格式和描述的正确性',
      content: '外部手册链接应包含书名号《》，web链接则不需要。超链接文字描述应与实际内容相符。',
      enabled: true,
      isDefault: true
    },
    {
      id: 'TERMINOLOGY-001',
      name: '术语规范',
      type: 'TERMINOLOGY',
      description: '检查术语使用的正确性和一致性',
      content: '仅检查明显的术语大小写错误（如 "OpenEuler" 或 "openeuler" 应为 "openEuler"）。如果术语已经是正确格式，不要创建不必要的suggestion。确保术语在文档中的使用一致性。',
      enabled: true,
      isDefault: true
    }
  ];
}

