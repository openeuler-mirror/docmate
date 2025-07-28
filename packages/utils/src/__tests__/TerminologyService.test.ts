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

  test('should search terms by query', () => {
    const results = service.searchTerms('package');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.term === 'RPM')).toBe(true);
  });

  test('should get terms by category', () => {
    const techTerms = service.getTermsByCategory('technology');
    expect(techTerms.length).toBeGreaterThan(0);
    expect(techTerms.every(t => t.category === 'technology')).toBe(true);
  });

  test('should get all categories', () => {
    const categories = service.getCategories();
    expect(categories).toContain('product');
    expect(categories).toContain('technology');
  });

  test('should check terminology usage in text', () => {
    const text = 'Install openEuler using rpm packages';
    const results = service.checkTerminologyUsage(text);
    
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.entry.term === 'openEuler')).toBe(true);
    expect(results.some(r => r.entry.term === 'RPM')).toBe(true);
  });
});
