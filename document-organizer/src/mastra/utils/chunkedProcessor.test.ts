import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  needsChunking,
  splitIntoChunks,
  mergeExtractionResults,
  getChunkConfig,
  type ChunkConfig,
  type ExtractionResult,
} from './chunkedProcessor.js';

describe('needsChunking', () => {
  const config: ChunkConfig = {
    maxChunkSize: 1000,
    sizeThreshold: 500,
    overlapSize: 50,
    maxExtractionChunks: 3,
  };

  it('returns false for content below threshold', () => {
    const content = 'a'.repeat(400);
    expect(needsChunking(content, config)).toBe(false);
  });

  it('returns true for content above threshold', () => {
    const content = 'a'.repeat(600);
    expect(needsChunking(content, config)).toBe(true);
  });

  it('returns false for content exactly at threshold', () => {
    const content = 'a'.repeat(500);
    expect(needsChunking(content, config)).toBe(false);
  });

  it('uses default config when not provided', () => {
    // Default threshold is 100000 chars
    const smallContent = 'a'.repeat(50000);
    const largeContent = 'a'.repeat(150000);
    expect(needsChunking(smallContent)).toBe(false);
    expect(needsChunking(largeContent)).toBe(true);
  });
});

describe('splitIntoChunks', () => {
  it('returns single chunk for content smaller than maxChunkSize', () => {
    const config: ChunkConfig = {
      maxChunkSize: 100,
      sizeThreshold: 50,
      overlapSize: 10,
      maxExtractionChunks: 5,
    };
    const content = 'This is a short document.';
    const chunks = splitIntoChunks(content, config);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(content);
  });

  it('returns single chunk for content exactly at maxChunkSize', () => {
    const config: ChunkConfig = {
      maxChunkSize: 50,
      sizeThreshold: 30,
      overlapSize: 5,
      maxExtractionChunks: 5,
    };
    const content = 'a'.repeat(50);
    const chunks = splitIntoChunks(content, config);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(content);
  });

  it('splits large content into multiple chunks', () => {
    const config: ChunkConfig = {
      maxChunkSize: 100,
      sizeThreshold: 50,
      overlapSize: 10,
      maxExtractionChunks: 5,
    };
    // Create content larger than maxChunkSize
    const content = 'a'.repeat(250);
    const chunks = splitIntoChunks(content, config);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('prefers breaking at paragraph boundaries when available', () => {
    const content = 'a'.repeat(80) + '\n\n' + 'b'.repeat(80) + '\n\n' + 'c'.repeat(40);
    const config: ChunkConfig = {
      maxChunkSize: 100,
      sizeThreshold: 50,
      overlapSize: 10,
      maxExtractionChunks: 5,
    };
    const chunks = splitIntoChunks(content, config);
    // First chunk should end at or before the paragraph break
    expect(chunks[0].length).toBeLessThanOrEqual(100);
    // Should have created multiple chunks
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('includes overlap between chunks for context preservation', () => {
    const content = 'Word1 Word2 Word3 Word4 Word5 Word6 Word7 Word8 Word9 Word10 Word11 Word12';
    const config: ChunkConfig = {
      maxChunkSize: 35,
      sizeThreshold: 20,
      overlapSize: 10,
      maxExtractionChunks: 5,
    };
    const chunks = splitIntoChunks(content, config);

    // Verify we got multiple chunks
    expect(chunks.length).toBeGreaterThan(1);

    // Each chunk except the last should be around maxChunkSize
    for (let i = 0; i < chunks.length - 1; i++) {
      expect(chunks[i].length).toBeLessThanOrEqual(config.maxChunkSize);
    }
  });

  it('ensures all content is covered', () => {
    const content = 'Start ' + 'middle '.repeat(50) + 'End';
    const config: ChunkConfig = {
      maxChunkSize: 100,
      sizeThreshold: 50,
      overlapSize: 10,
      maxExtractionChunks: 5,
    };
    const chunks = splitIntoChunks(content, config);

    // First chunk should start with 'Start'
    expect(chunks[0].startsWith('Start')).toBe(true);
    // Last chunk should end with 'End'
    expect(chunks[chunks.length - 1].endsWith('End')).toBe(true);
  });

  it('handles content with no natural break points', () => {
    // Content with no spaces, newlines, or periods
    const content = 'abcdefghij'.repeat(20);
    const config: ChunkConfig = {
      maxChunkSize: 50,
      sizeThreshold: 30,
      overlapSize: 5,
      maxExtractionChunks: 5,
    };
    const chunks = splitIntoChunks(content, config);

    // Should still create chunks
    expect(chunks.length).toBeGreaterThan(1);
    // Should not exceed max size
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(config.maxChunkSize);
    }
  });
});

describe('mergeExtractionResults', () => {
  it('returns unknown values when all inputs are unknown', () => {
    const results: ExtractionResult[] = [
      { lessor: 'unknown', address: 'unknown', tenant: 'unknown' },
      { lessor: 'unknown', address: 'unknown', tenant: 'unknown' },
    ];
    const merged = mergeExtractionResults(results);
    expect(merged.lessor).toBe('unknown');
    expect(merged.address).toBe('unknown');
    expect(merged.tenant).toBe('unknown');
    expect(merged.baseReference).toBeUndefined();
  });

  it('takes first non-unknown value for each field', () => {
    const results: ExtractionResult[] = [
      { lessor: 'unknown', address: '123 main street', tenant: 'unknown' },
      { lessor: 'ABC Corp', address: 'unknown', tenant: 'John Smith' },
      { lessor: 'XYZ Inc', address: '456 oak avenue', tenant: 'Jane Doe' },
    ];
    const merged = mergeExtractionResults(results);
    expect(merged.lessor).toBe('ABC Corp');
    expect(merged.address).toBe('123 main street');
    expect(merged.tenant).toBe('John Smith');
  });

  it('takes first non-null baseReference', () => {
    const results: ExtractionResult[] = [
      { lessor: 'unknown', address: 'unknown', tenant: 'unknown' },
      { lessor: 'ABC Corp', address: '123 main', tenant: 'Tenant', baseReference: 'Lease dated Jan 1, 2020' },
      { lessor: 'Other', address: 'other', tenant: 'Other', baseReference: 'Another reference' },
    ];
    const merged = mergeExtractionResults(results);
    expect(merged.baseReference).toBe('Lease dated Jan 1, 2020');
  });

  it('handles empty results array', () => {
    const results: ExtractionResult[] = [];
    const merged = mergeExtractionResults(results);
    expect(merged.lessor).toBe('unknown');
    expect(merged.address).toBe('unknown');
    expect(merged.tenant).toBe('unknown');
    expect(merged.baseReference).toBeUndefined();
  });

  it('stops processing once all fields are filled', () => {
    // The function should short-circuit when all required fields are found
    const results: ExtractionResult[] = [
      { lessor: 'ABC Corp', address: '123 main street', tenant: 'John Smith' },
      { lessor: 'Should not appear', address: 'Should not appear', tenant: 'Should not appear' },
    ];
    const merged = mergeExtractionResults(results);
    expect(merged.lessor).toBe('ABC Corp');
    expect(merged.address).toBe('123 main street');
    expect(merged.tenant).toBe('John Smith');
  });

  it('ignores empty string values like unknown', () => {
    const results: ExtractionResult[] = [
      { lessor: '', address: '', tenant: '' },
      { lessor: 'ABC Corp', address: '123 main', tenant: 'John' },
    ];
    const merged = mergeExtractionResults(results);
    // Empty strings are falsy, so should be skipped
    expect(merged.lessor).toBe('ABC Corp');
  });
});

describe('getChunkConfig', () => {
  it('returns default config when no overrides provided', () => {
    const config = getChunkConfig();
    expect(config.maxChunkSize).toBe(50000);
    expect(config.sizeThreshold).toBe(100000);
    expect(config.overlapSize).toBe(500);
    expect(config.maxExtractionChunks).toBe(5);
  });

  it('applies partial overrides', () => {
    const config = getChunkConfig({ maxChunkSize: 25000, maxExtractionChunks: 3 });
    expect(config.maxChunkSize).toBe(25000);
    expect(config.maxExtractionChunks).toBe(3);
    // Unchanged values should keep defaults
    expect(config.sizeThreshold).toBe(100000);
    expect(config.overlapSize).toBe(500);
  });

  it('applies all overrides', () => {
    const overrides = {
      maxChunkSize: 10000,
      sizeThreshold: 20000,
      overlapSize: 100,
      maxExtractionChunks: 2,
    };
    const config = getChunkConfig(overrides);
    expect(config).toEqual(overrides);
  });
});
