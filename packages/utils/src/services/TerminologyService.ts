import { TerminologyDatabase, TerminologyEntry, createError } from '@docmate/shared';

export class TerminologyService {
  private database: TerminologyDatabase | null = null;
  private indexMap: Map<string, TerminologyEntry> = new Map();
  private replacementRegex: RegExp | null = null;

  constructor() {
    this.loadDefaultTerminology();
  }

  /**
   * 加载默认术语库
   */
  private loadDefaultTerminology(): void {
    // 默认的openEuler术语库
    const defaultEntries: TerminologyEntry[] = [
      {
        id: '1',
        term: 'openEuler',
        definition: 'An open source operating system based on Linux kernel',
        category: 'product',
        aliases: ['openeuler', 'OpenEuler'],
        examples: ['openEuler 22.03 LTS', 'openEuler community'],
      },
      {
        id: '2',
        term: 'RPM',
        definition: 'Red Hat Package Manager, a package management system',
        category: 'technology',
        aliases: ['rpm'],
        examples: ['RPM package', 'rpm command'],
      },
      {
        id: '3',
        term: 'YUM',
        definition: 'Yellowdog Updater Modified, a package manager for RPM-based systems',
        category: 'technology',
        aliases: ['yum'],
        examples: ['yum install', 'yum update'],
      },
      {
        id: '4',
        term: 'DNF',
        definition: 'Dandified YUM, the next generation package manager',
        category: 'technology',
        aliases: ['dnf'],
        examples: ['dnf install', 'dnf search'],
      },
      {
        id: '5',
        term: 'systemd',
        definition: 'A system and service manager for Linux operating systems',
        category: 'technology',
        aliases: ['SystemD'],
        examples: ['systemd service', 'systemctl command'],
      },
    ];

    this.database = {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      entries: defaultEntries,
    };

    this.buildIndex();
  }

  /**
   * 构建索引
   */
  private buildIndex(): void {
    if (!this.database) return;

    this.indexMap.clear();
    const allTermsAndAliases = new Set<string>();

    for (const entry of this.database.entries) {
      // 主术语
      this.indexMap.set(entry.term.toLowerCase(), entry);
      allTermsAndAliases.add(entry.term);

      // 别名
      if (entry.aliases) {
        for (const alias of entry.aliases) {
          this.indexMap.set(alias.toLowerCase(), entry);
          allTermsAndAliases.add(alias);
        }
      }
    }

    // 按长度降序排序以优先匹配长术语
    const sortedTerms = Array.from(allTermsAndAliases).sort((a, b) => b.length - a.length);

    if (sortedTerms.length > 0) {
      const regexParts = sortedTerms.map(term => this.escapeRegex(term));
      this.replacementRegex = new RegExp(`\\b(${regexParts.join('|')})\\b`, 'gi');
    } else {
      this.replacementRegex = null;
    }
  }

  /**
   * 获取术语库
   */
  getDatabase(): TerminologyDatabase | null {
    return this.database;
  }

  /**
   * 查找术语
   */
  findTerm(term: string): TerminologyEntry | null {
    return this.indexMap.get(term.toLowerCase()) || null;
  }

  /**
   * 搜索术语
   */
  searchTerms(query: string): TerminologyEntry[] {
    if (!this.database || !query.trim()) {
      return [];
    }

    const queryLower = query.toLowerCase();
    const results: TerminologyEntry[] = [];
    const seen = new Set<string>();

    for (const entry of this.database.entries) {
      if (seen.has(entry.id)) continue;

      // 检查术语名称
      if (entry.term.toLowerCase().includes(queryLower)) {
        results.push(entry);
        seen.add(entry.id);
        continue;
      }

      // 检查别名
      if (entry.aliases?.some(alias => alias.toLowerCase().includes(queryLower))) {
        results.push(entry);
        seen.add(entry.id);
        continue;
      }

      // 检查定义
      if (entry.definition.toLowerCase().includes(queryLower)) {
        results.push(entry);
        seen.add(entry.id);
        continue;
      }
    }

    return results;
  }

  /**
   * 获取所有术语
   */
  getAllTerms(): TerminologyEntry[] {
    return this.database?.entries || [];
  }

  /**
   * 按类别获取术语
   */
  getTermsByCategory(category: string): TerminologyEntry[] {
    if (!this.database) return [];

    return this.database.entries.filter(entry => entry.category === category);
  }

  /**
   * 获取所有类别
   */
  getCategories(): string[] {
    if (!this.database) return [];

    const categories = new Set<string>();
    for (const entry of this.database.entries) {
      categories.add(entry.category);
    }

    return Array.from(categories).sort();
  }

  /**
   * 检查文本中的术语使用
   */
  checkTerminologyUsage(text: string): Array<{
    term: string;
    position: number;
    length: number;
    entry: TerminologyEntry;
    isCorrect: boolean;
    suggestion?: string;
  }> {
    if (!this.database) return [];

    const results: Array<{
      term: string;
      position: number;
      length: number;
      entry: TerminologyEntry;
      isCorrect: boolean;
      suggestion?: string;
    }> = [];

    // 创建所有术语的正则表达式
    const allTerms = new Set<string>();
    for (const entry of this.database.entries) {
      allTerms.add(entry.term);
      if (entry.aliases) {
        entry.aliases.forEach(alias => allTerms.add(alias));
      }
    }

    // 按长度排序，优先匹配长术语
    const sortedTerms = Array.from(allTerms).sort((a, b) => b.length - a.length);

    for (const term of sortedTerms) {
      const regex = new RegExp(`\\b${this.escapeRegex(term)}\\b`, 'gi');
      let match;

      while ((match = regex.exec(text)) !== null) {
        const foundTerm = match[0];
        const entry = this.findTerm(foundTerm);
        
        if (entry) {
          const isCorrect = foundTerm === entry.term;
          
          results.push({
            term: foundTerm,
            position: match.index,
            length: foundTerm.length,
            entry,
            isCorrect,
            suggestion: isCorrect ? undefined : entry.term,
          });
        }
      }
    }

    // 按位置排序并去重
    return results
      .sort((a, b) => a.position - b.position)
      .filter((result, index, array) => {
        // 去除重叠的匹配
        if (index === 0) return true;
        const prev = array[index - 1];
        return result.position >= prev.position + prev.length;
      });
  }

  /**
   * 替换文本中的术语
   * @param text 输入文本
   * @returns 替换后的文本
   */
  public replace(text: string): string {
    if (!this.replacementRegex || !this.database) {
      return text;
    }

    return text.replace(this.replacementRegex, (matched) => {
      const entry = this.indexMap.get(matched.toLowerCase());
      // 如果找到了对应的术语条目，则返回该条目的标准术语，否则返回原文
      return entry ? entry.term : matched;
    });
  }

  /**
   * 转义正则表达式特殊字符
   */
  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 更新术语库
   */
  async updateDatabase(database: TerminologyDatabase): Promise<void> {
    try {
      this.database = database;
      this.buildIndex();
    } catch (error) {
      throw createError(
        'TERMINOLOGY_UPDATE_FAILED',
        'Failed to update terminology database',
        { originalError: error }
      );
    }
  }

  /**
   * 添加术语
   */
  addTerm(entry: Omit<TerminologyEntry, 'id'>): TerminologyEntry {
    if (!this.database) {
      throw createError('TERMINOLOGY_NOT_LOADED', 'Terminology database not loaded');
    }

    const newEntry: TerminologyEntry = {
      ...entry,
      id: `custom-${Date.now()}`,
    };

    this.database.entries.push(newEntry);
    this.database.lastUpdated = new Date().toISOString();
    this.buildIndex();

    return newEntry;
  }

  /**
   * 删除术语
   */
  removeTerm(id: string): boolean {
    if (!this.database) return false;

    const index = this.database.entries.findIndex(entry => entry.id === id);
    if (index === -1) return false;

    this.database.entries.splice(index, 1);
    this.database.lastUpdated = new Date().toISOString();
    this.buildIndex();

    return true;
  }
}
