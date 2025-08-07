/**
 * Prompts模块导出
 */

// 检查相关prompts
export {
  buildCheckPrompt,
  buildTerminologyCheckPrompt
} from './checkPrompts';

// 润色相关prompts
export {
  buildPolishPrompt,
  buildClarityPolishPrompt
} from './polishPrompts';

// 翻译相关prompts
export {
  buildTranslatePrompt,
  buildFullDocumentTranslatePrompt
} from './translatePrompts';

// 改写相关prompts
export {
  buildRewritePrompt,
  buildStyleRewritePrompt,
  buildConversationalRewritePrompt
} from './rewritePrompts';
