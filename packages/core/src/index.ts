// 导出服务
export * from './services/AIService';
export * from './services/TerminologyService';
export * from './services/ConfigService';

// 导出操作
export * as CheckAction from './actions/check';
export * as PolishAction from './actions/polish';
export * as TranslateAction from './actions/translate';
export * as RewriteAction from './actions/rewrite';

// 导出Action类
export { CheckAction as CheckActionClass } from './actions/check';
export { PolishAction as PolishActionClass } from './actions/polish';
export { TranslateAction as TranslateActionClass, FullTranslateAction as FullTranslateActionClass } from './actions/translate';
export { RewriteAction as RewriteActionClass } from './actions/rewrite';

// 导出基础类和接口
export * from './actions/BaseAction';

// 导出工具
export * from './utils/diff';
