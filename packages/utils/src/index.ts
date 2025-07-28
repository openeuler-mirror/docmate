// Services
export { ConfigService, configService } from './services/ConfigService';
export { TerminologyService } from './services/TerminologyService';

// Utils
export {
  calculateCharDiff,
  calculateWordDiff,
  calculateLineDiff,
  calculateDiff,
  mergeDiffSegments,
  filterEmptySegments,
  getDiffStats,
  applyDiff
} from './utils/diff';
