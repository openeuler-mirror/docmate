import { TerminologyService } from '../services/TerminologyService';

describe('TerminologyService', () => {
  let service: TerminologyService;

  beforeEach(() => {
    service = new TerminologyService();
  });

  test('should load default terminology', () => {
    const database = service.getDatabase();
    expect(database).toBeTruthy();
    expect(database?.entries.length).toBeGreaterThan(0);
  });

  test('should find existing term', () => {
    const term = service.findTerm('openEuler');
    expect(term).toBeTruthy();
    expect(term?.term).toBe('openEuler');
  });

  test('should find term by alias', () => {
    const term = service.findTerm('openeuler');
    expect(term).toBeTruthy();
    expect(term?.term).toBe('openEuler');
  });

  test('should return null for non-existing term', () => {
    const term = service.findTerm('nonexistent');
    expect(term).toBeNull();
  });

  test('should search terms', () => {
    const results = service.searchTerms('package');
    expect(results.length).toBeGreaterThan(0);
  });

  test('should check terminology usage', () => {
    const text = 'This is about openeuler and RPM packages.';
    const usage = service.checkTerminologyUsage(text);
    
    expect(usage.length).toBeGreaterThan(0);
    
    const openeulerUsage = usage.find(u => u.term.toLowerCase() === 'openeuler');
    expect(openeulerUsage).toBeTruthy();
    expect(openeulerUsage?.isCorrect).toBe(false);
    expect(openeulerUsage?.suggestion).toBe('openEuler');
  });

  test('should get categories', () => {
    const categories = service.getCategories();
    expect(categories.length).toBeGreaterThan(0);
    expect(categories).toContain('product');
    expect(categories).toContain('technology');
  });
});
