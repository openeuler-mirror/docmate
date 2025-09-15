/**
 * 文本检查相关的Prompt模板
 */

import { SingleChunkRequestPayload } from '@docmate/shared';

/**
 * 构建文本检查提示词 - v1.2结构化版本
 * 支持分块处理和精确位置映射，使用tools调用确保JSON稳定性
 */
export function buildSingleChunkPrompt(payload: SingleChunkRequestPayload): string {

  const { chunk } = payload;

  return `你是openEuler文档审校专家。请检查核心文本中的问题，必须使用 return_chunk_check_result 函数返回结果。

**重要要求**:
- 只检查"核心文本"，上下文仅作参考
- 每个问题必须提供精确的 original_text 和 suggested_text
- 仅标记实际存在的问题，不要产生"幻觉"
- 必须通过调用 return_chunk_check_result 函数返回结果，不要直接输出JSON

**检查规则 (必须严格遵守)**:

**1. 错别字 (TYPO)**
- 找出并修正中文错别字，包括同音字（如"部署"错为"布署"）、形近字（如"阈值"错为"阀值"）
- 识别多余或缺失的文字

**2. 标点符号 (PUNCTUATION)**
- 纯英文内容中不应出现中文标点符号
- 顿号"、"仅用于句子内部的并列词语之间

**3. 空格 (SPACING)**
- 中英文夹杂时必须有且仅有一个半角空格
- 英文标点符号后应有半角空格，前面不能有空格

**4. 格式 (FORMATTING)**
- 行内代码、命令行和文件名需要用反引号 (\`) 包裹，只有确认要包裹的再添加，不用特别严格，且\`\`\`代码块内的命令不用管
- 代码块注释符号必须正确
- 标题等格式一致性问题在风格中检查，此处不检查

**5. 风格 (STYLE)**（此部分可适当放宽要求，仅检查明显错误）
- 同级别内容的结尾标点应保持一致
- 描述功能键或UI元素的格式应在全文中保持一致
- 行间距应保持一致

**6. 超链接 (HYPERLINK_ERROR)**
- 外部手册链接应包含书名号《》，web链接则不需要
- 超链接文字描述应与实际内容相符

**7. 术语 (TERMINOLOGY)**
- 仅检查明显的术语大小写错误（如 "OpenEuler" 或 "openeuler" 应为 "openEuler"）
- 如果术语已经是正确格式，不要创建不必要的suggestion
- 确保术语在文档中的使用一致性

**函数调用说明**:
你必须调用 return_chunk_check_result 函数，参数如下：
- chunk_id: 必须精确设置为 "${chunk.id}"
- suggestions: 问题建议数组，每个建议包含：
  - chunk_id: 必须设置为 "${chunk.id}"（与父级相同）
  - type: 问题类型（TYPO/PUNCTUATION/SPACING/FORMATTING/STYLE/HYPERLINK_ERROR/TERMINOLOGY）
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
 * 构建文本检查提示词，要求返回JSON格式
 * @deprecated 请使用 buildStructuredCheckPrompt 替代
 */
export function buildCheckPrompt(text: string, checkTypes: string[], strictMode: boolean = false): string {

  return `你是openEuler文档审校专家。请仔细检查以下文档，找出所有问题并逐一标记。

**检查规则 (必须严格遵守)**:
你必须严格按照以下规则检查文档中的每一个潜在问题，并为每个问题选择最合适的 \`issueType\`。

**1. 错别字 (\`TYPO\`)**
  - 找出并修正中文错别字，包括同音字（如"部署"错为"布署"）、形近字（如"阈值"错为"阀值"）以及多余的文字。

**2. 标点符号 (\`PUNCTUATION\`)**
  - 在纯英文内容（如代码示例、命令）中，不允许出现中文标点符号。
  - 检查顿号"、"是否仅用于句子内部的并列词语之间。

**3. 空格 (\`SPACING\`)**
  - 中英文夹杂时，中文与英文单词、数字之间必须有且仅有一个半角空格。
  - 英文标点符号后应跟一个半角空格，前面不能有空格。

**4. 格式 (\`FORMATTING\`)**
  - 行内代码、命令行和文件名必须使用反引号 (\`) 包裹。
  - 代码块中的注释符号必须使用正确。

**5. 风格 (\`STYLE\`)**
  - 检查图片插入位置是否合理，是否与上下文文本有重叠。
  - 检查同一级别的内容（如多个并列的段落、列表项）的结尾标点是否保持一致（要么都有句号，要么都没有）。
  - 在表格或列表中，同一列的结尾标点风格应保持一致。
  - 描述功能键或UI元素的字体格式（如加粗）应在全文中保持一致。
  - 检查上下文行间距（换行个数）是否一致。

**6. 超链接 (\`HYPERLINK_ERROR\`)**
  - 检查链接到外部手册的文本，是否正确包含了书名号《》。如[xx手册](手册.md)应为《[xx手册](手册.md)》。
  - 检查超链接文字描述和实际内容是否相符。如[xx](yy.md)应为[yy](yy.md)。

**7. 术语 (\`TERMINOLOGY\`)**
  - 仅检查明显的术语大小写错误（如 "OpenEuler" 或 "openeuler" 应为 "openEuler"）。
  - 如果术语已经是正确格式，不要创建不必要的suggestion。
  - 确保术语在文档中的使用一致性。

**输出格式**:
你必须仅通过调用函数 \`return_check_result\` 返回结构化结果。禁止输出任何其他文本、思考或解释。
- 对于发现的每一个问题，都必须创建一个对应的 \`issue\` 对象。包含一个明确的 \`issueType\`，其值必须是以下之一：['TYPO', 'PUNCTUATION', 'SPACING', 'FORMATTING', 'STYLE', 'HYPERLINK_ERROR', 'TERMINOLOGY']。
- \`message\` 字段应直接写规则标题。
- \`suggestion\` 字段必须提供详细、专业的修改建议，包含：
  * 错误的具体原因和背景知识
  * 正确做法的依据和标准

【文档内容】
${text}
`;
}