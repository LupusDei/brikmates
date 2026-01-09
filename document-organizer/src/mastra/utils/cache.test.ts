import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unlinkSync, existsSync } from 'node:fs';
import {
  hashContent,
  loadCache,
  saveCache,
  getCachedResult,
  setCachedResult,
  DocumentCache,
} from './cache.js';

const TEST_CACHE_FILE = '.test-document-cache.json';

// Clean up test cache file before/after tests
function cleanupTestCache() {
  if (existsSync(TEST_CACHE_FILE)) {
    unlinkSync(TEST_CACHE_FILE);
  }
}

describe('hashContent', () => {
  it('returns consistent hash for same content', () => {
    const content = 'This is a test document';
    const hash1 = hashContent(content);
    const hash2 = hashContent(content);
    expect(hash1).toBe(hash2);
  });

  it('returns different hash for different content', () => {
    const hash1 = hashContent('Document A');
    const hash2 = hashContent('Document B');
    expect(hash1).not.toBe(hash2);
  });

  it('returns 64 character hex string (SHA-256)', () => {
    const hash = hashContent('test');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });
});

describe('loadCache / saveCache', () => {
  beforeEach(cleanupTestCache);
  afterEach(cleanupTestCache);

  it('returns empty cache when file does not exist', () => {
    const cache = loadCache(TEST_CACHE_FILE);
    expect(cache.version).toBe(1);
    expect(cache.entries).toEqual({});
  });

  it('saves and loads cache correctly', () => {
    const cache = {
      version: 1,
      entries: {
        abc123: {
          classification: {
            documentType: 'lease' as const,
            confidence: 'high' as const,
            reasoning: 'Test',
          },
          extraction: {
            lessor: 'Test Lessor',
            address: '123 main street',
            tenant: 'Test Tenant',
          },
          timestamp: Date.now(),
        },
      },
    };

    saveCache(cache, TEST_CACHE_FILE);
    const loaded = loadCache(TEST_CACHE_FILE);

    expect(loaded.version).toBe(cache.version);
    expect(loaded.entries.abc123).toEqual(cache.entries.abc123);
  });
});

describe('getCachedResult / setCachedResult', () => {
  it('returns null for uncached content', () => {
    const cache = { version: 1, entries: {} };
    const result = getCachedResult('new content', cache);
    expect(result).toBeNull();
  });

  it('returns cached result for matching content', () => {
    const cache = { version: 1, entries: {} as Record<string, any> };
    const content = 'test document content';
    const cachedResult = {
      classification: {
        documentType: 'amendment' as const,
        confidence: 'medium' as const,
        reasoning: 'Test reasoning',
      },
      extraction: {
        lessor: 'ABC Corp',
        address: '456 oak avenue',
        tenant: 'XYZ Inc',
      },
      timestamp: Date.now(),
    };

    setCachedResult(content, cachedResult, cache);
    const result = getCachedResult(content, cache);

    expect(result).toEqual(cachedResult);
  });
});

describe('DocumentCache', () => {
  beforeEach(cleanupTestCache);
  afterEach(cleanupTestCache);

  it('creates empty cache when file does not exist', () => {
    const cache = new DocumentCache(TEST_CACHE_FILE);
    expect(cache.stats().entries).toBe(0);
  });

  it('returns null for uncached content', () => {
    const cache = new DocumentCache(TEST_CACHE_FILE);
    const result = cache.get('some document content');
    expect(result).toBeNull();
  });

  it('stores and retrieves cached results', () => {
    const cache = new DocumentCache(TEST_CACHE_FILE);
    const content = 'This is a lease agreement...';

    const classification = {
      documentType: 'lease' as const,
      confidence: 'high' as const,
      reasoning: 'Document header indicates lease',
    };
    const extraction = {
      lessor: 'Property Management Inc',
      address: '789 elm boulevard',
      tenant: 'John Smith',
    };

    cache.set(content, classification, extraction);
    const result = cache.get(content);

    expect(result).not.toBeNull();
    expect(result!.classification).toEqual(classification);
    expect(result!.extraction).toEqual(extraction);
    expect(result!.timestamp).toBeGreaterThan(0);
  });

  it('persists cache to disk on save', () => {
    // Create cache and add entry
    const cache1 = new DocumentCache(TEST_CACHE_FILE);
    const content = 'Persistent document';
    cache1.set(
      content,
      { documentType: 'other', confidence: 'low', reasoning: 'Unknown' },
      { lessor: 'unknown', address: 'unknown', tenant: 'unknown' }
    );
    cache1.save();

    // Load cache in new instance
    const cache2 = new DocumentCache(TEST_CACHE_FILE);
    const result = cache2.get(content);

    expect(result).not.toBeNull();
    expect(result!.classification.documentType).toBe('other');
  });

  it('clear removes all entries', () => {
    const cache = new DocumentCache(TEST_CACHE_FILE);
    cache.set(
      'doc1',
      { documentType: 'lease', confidence: 'high', reasoning: 'R1' },
      { lessor: 'L1', address: 'A1', tenant: 'T1' }
    );
    cache.set(
      'doc2',
      { documentType: 'amendment', confidence: 'high', reasoning: 'R2' },
      { lessor: 'L2', address: 'A2', tenant: 'T2' }
    );

    expect(cache.stats().entries).toBe(2);

    cache.clear();
    expect(cache.stats().entries).toBe(0);
    expect(cache.get('doc1')).toBeNull();
    expect(cache.get('doc2')).toBeNull();
  });

  it('stats returns correct entry count', () => {
    const cache = new DocumentCache(TEST_CACHE_FILE);

    expect(cache.stats().entries).toBe(0);

    cache.set(
      'document content',
      { documentType: 'lease', confidence: 'high', reasoning: 'Test' },
      { lessor: 'Test', address: 'test', tenant: 'Test' }
    );

    expect(cache.stats().entries).toBe(1);
    expect(cache.stats().file).toBe(TEST_CACHE_FILE);
  });
});
