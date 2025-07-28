import { diffChars, diffWords, diffLines, Change } from 'diff';
import { DiffSegment } from '@docmate/shared';

/**
 * 计算两个文本之间的字符级差异
 */
export function calculateCharDiff(original: string, modified: string): DiffSegment[] {
  const changes = diffChars(original, modified);
  return changes.map((part: Change) => {
    if (part.added) {
      return { type: 'insert', value: part.value };
    }
    if (part.removed) {
      return { type: 'delete', value: part.value };
    }
    return { type: 'equal', value: part.value };
  });
}

/**
 * 计算两个文本之间的单词级差异
 */
export function calculateWordDiff(original: string, modified: string): DiffSegment[] {
  const changes = diffWords(original, modified);
  return changes.map((part: Change) => {
    if (part.added) {
      return { type: 'insert', value: part.value };
    }
    if (part.removed) {
      return { type: 'delete', value: part.value };
    }
    return { type: 'equal', value: part.value };
  });
}

/**
 * 计算两个文本之间的行级差异
 */
export function calculateLineDiff(original: string, modified: string): DiffSegment[] {
  const changes = diffLines(original, modified);
  return changes.map((part: Change) => {
    if (part.added) {
      return { type: 'insert', value: part.value };
    }
    if (part.removed) {
      return { type: 'delete', value: part.value };
    }
    return { type: 'equal', value: part.value };
  });
}

/**
 * 智能选择最合适的diff算法
 * 根据文本长度和内容特征自动选择字符级、单词级或行级差异
 */
export function calculateDiff(original: string, modified: string): DiffSegment[] {
  // 如果文本很短，使用字符级差异
  if (original.length < 100 && modified.length < 100) {
    return calculateCharDiff(original, modified);
  }
  
  // 如果包含多行，使用行级差异
  if (original.includes('\n') || modified.includes('\n')) {
    return calculateLineDiff(original, modified);
  }
  
  // 默认使用单词级差异
  return calculateWordDiff(original, modified);
}

/**
 * 合并相邻的相同类型的diff段
 */
export function mergeDiffSegments(segments: DiffSegment[]): DiffSegment[] {
  if (segments.length === 0) return segments;
  
  const merged: DiffSegment[] = [];
  let current = segments[0];
  
  for (let i = 1; i < segments.length; i++) {
    const next = segments[i];
    
    // 如果类型相同，合并
    if (current.type === next.type) {
      current = {
        type: current.type,
        value: current.value + next.value
      };
    } else {
      merged.push(current);
      current = next;
    }
  }
  
  merged.push(current);
  return merged;
}

/**
 * 过滤掉空的diff段
 */
export function filterEmptySegments(segments: DiffSegment[]): DiffSegment[] {
  return segments.filter(segment => segment.value.length > 0);
}

/**
 * 获取diff的统计信息
 */
export function getDiffStats(segments: DiffSegment[]): {
  insertions: number;
  deletions: number;
  unchanged: number;
  totalChanges: number;
} {
  let insertions = 0;
  let deletions = 0;
  let unchanged = 0;
  
  for (const segment of segments) {
    switch (segment.type) {
      case 'insert':
        insertions += segment.value.length;
        break;
      case 'delete':
        deletions += segment.value.length;
        break;
      case 'equal':
        unchanged += segment.value.length;
        break;
    }
  }
  
  return {
    insertions,
    deletions,
    unchanged,
    totalChanges: insertions + deletions
  };
}

/**
 * 将diff结果转换为最终的修改后文本
 */
export function applyDiff(segments: DiffSegment[]): string {
  return segments
    .filter(segment => segment.type !== 'delete')
    .map(segment => segment.value)
    .join('');
}
